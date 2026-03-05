import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getOfferById, sendOffer } from '@/lib/services/offers'
import { getActiveOfferTemplate, getOfferTemplateById } from '@/lib/services/offer-templates'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import { DEFAULT_OFFER_TEMPLATE, EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS } from '@/lib/constants'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'
import { resolveLogoForPdf } from '@/lib/utils/logo-converter'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const orgId = membership.organization_id

  // Get the offer with full details
  const { data: offer, error: offerError } = await getOfferById(supabase, id, orgId)

  if (offerError || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  const resendableStatuses = ['draft', 'declined', 'expired']
  if (!resendableStatuses.includes(offer.status)) {
    return NextResponse.json(
      { error: `Cannot send an offer with status "${offer.status}". Only draft, declined, or expired offers can be sent.` },
      { status: 400 }
    )
  }

  // Reset declined/expired offers back to draft before resending
  if (offer.status !== 'draft') {
    await supabase
      .from('offer_letters')
      .update({ status: 'draft', responded_at: null, response_notes: null, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  const candidate = offer.application?.candidate
  const job = offer.application?.job

  if (!candidate?.email) {
    return NextResponse.json({ error: 'Candidate email not found' }, { status: 400 })
  }

  // Get org name for template
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  // Get valid Gmail access token
  const tokenResult = await getValidAccessToken(supabase, user.id, orgId)
  if (!tokenResult.accessToken) {
    return NextResponse.json({ error: tokenResult.error || 'Gmail not connected' }, { status: 400 })
  }

  // Generate response token and store on offer
  const responseToken = randomUUID()
  await supabase
    .from('offer_letters')
    .update({ response_token: responseToken })
    .eq('id', id)

  const candidateName = `${candidate.first_name} ${candidate.last_name}`
  const salaryFormatted = formatSalary(offer.salary || 0, offer.salary_currency || 'INR')
  const startDate = offer.start_date
    ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'
  const expiryDate = offer.expiry_date
    ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'

  // Fetch the offer's saved template, falling back to the active template
  let activeTemplate = null
  if (offer.offer_template_id) {
    const { data } = await getOfferTemplateById(supabase, offer.offer_template_id, orgId)
    activeTemplate = data
  }
  if (!activeTemplate) {
    const { data } = await getActiveOfferTemplate(supabase, orgId)
    activeTemplate = data
  }

  const templateVars = {
    candidate_name: candidateName,
    job_title: job?.title || '',
    department: job?.department || '',
    salary: salaryFormatted,
    start_date: startDate,
    expiry_date: expiryDate,
    company_name: org?.name || '',
    location: offer.location || job?.location || '',
  }

  // Simple email body — full details are in the PDF
  const emailTemplate = activeTemplate?.email_body || offer.template_html || DEFAULT_OFFER_TEMPLATE
  let emailHtml = substituteOfferVariables(emailTemplate, templateVars)

  // Append Accept/Decline buttons
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const acceptUrl = `${appUrl}/offers/respond?token=${responseToken}&action=accept`
  const declineUrl = `${appUrl}/offers/respond?token=${responseToken}&action=decline`

  emailHtml += `
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb;text-align:center;">
  <p style="font-size:14px;color:#374151;margin-bottom:16px;">Please respond to this offer:</p>
  <a href="${acceptUrl}" style="display:inline-block;padding:12px 32px;background-color:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;margin-right:12px;">Accept Offer</a>
  <a href="${declineUrl}" style="display:inline-block;padding:12px 32px;background-color:#dc2626;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Decline Offer</a>
</div>`

  const empLabel = EMPLOYMENT_TYPE_OPTIONS.find((e) => e.value === offer.employment_type)?.label || offer.employment_type || ''
  const workLabel = WORK_TYPE_OPTIONS.find((w) => w.value === offer.work_type)?.label || offer.work_type || ''

  const subject = activeTemplate?.email_subject
    ? substituteOfferVariables(activeTemplate.email_subject, templateVars)
    : `Offer Letter - ${job?.title || 'Position'} at ${org?.name || 'Our Company'}`
  const fromEmail = tokenResult.fromEmail || user.email!

  try {
    // Generate full offer letter PDF
    const salaryComponents = Array.isArray(offer.salary_components) ? offer.salary_components : []
    const bonusComponents = Array.isArray(offer.bonus_components) ? offer.bonus_components : []

    // Resolve logo URL (converts SVG to PNG if needed)
    const resolvedLogo = activeTemplate?.logo_url ? await resolveLogoForPdf(activeTemplate.logo_url) : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: activeTemplate?.company_name || org?.name || 'Company',
      candidateName,
      candidateEmail: candidate.email,
      jobTitle: job?.title || '',
      department: job?.department || '',
      businessUnit: offer.business_unit || undefined,
      employmentType: empLabel,
      workType: workLabel,
      location: offer.location || job?.location || undefined,
      reportingManager: offer.reporting_manager || undefined,
      salary: salaryFormatted,
      salaryCurrency: offer.salary_currency || 'INR',
      startDate,
      expiryDate,
      createdDate: new Date(offer.created_at).toLocaleDateString('en-US', { dateStyle: 'long' }),
      salaryComponents: salaryComponents.length > 0 ? salaryComponents : undefined,
      bonusComponents: bonusComponents.length > 0 ? bonusComponents : undefined,
      pfApplicable: offer.pf_applicable ?? false,
      templateLogoUrl: resolvedLogo,
      templateCompanyName: activeTemplate?.company_name || undefined,
      templateTerms: activeTemplate?.terms_and_conditions || undefined,
      // Full template customization
      primaryColor: activeTemplate?.primary_color || undefined,
      accentColor: activeTemplate?.accent_color || undefined,
      headerSubtitle: activeTemplate?.header_subtitle || undefined,
      greetingText: activeTemplate?.greeting_text || undefined,
      introText: activeTemplate?.intro_text || undefined,
      closingText: activeTemplate?.closing_text || undefined,
      validityText: activeTemplate?.validity_text || undefined,
      acceptanceText: activeTemplate?.acceptance_text || undefined,
      signatoryName: activeTemplate?.signatory_name || undefined,
      signatoryTitle: activeTemplate?.signatory_title || undefined,
      signatoryLabel: activeTemplate?.signatory_label || undefined,
      candidateSigLabel: activeTemplate?.candidate_sig_label || undefined,
      showSalaryBreakdown: activeTemplate?.show_salary_breakdown ?? true,
      showBonusSection: activeTemplate?.show_bonus_section ?? true,
      showTermsSection: activeTemplate?.show_terms_section ?? true,
      showAcceptanceSection: activeTemplate?.show_acceptance_section ?? true,
      showSignatureBlock: activeTemplate?.show_signature_block ?? true,
      footerText: activeTemplate?.footer_text || undefined,
    }) as any
    const pdfBuffer = await renderToBuffer(pdfElement)
    const pdfFilename = `offer-${candidate.last_name.toLowerCase()}-${job?.title?.toLowerCase().replace(/\s+/g, '-') || 'position'}.pdf`

    await sendGmailEmail(tokenResult.accessToken, {
      from: fromEmail,
      to: candidate.email,
      subject,
      html: emailHtml,
      attachments: [{
        filename: pdfFilename,
        content: new Uint8Array(pdfBuffer),
        contentType: 'application/pdf',
      }],
    })

    // Mark as sent in DB
    const { error: sendError } = await sendOffer(supabase, id, orgId)
    if (sendError) {
      return NextResponse.json({ error: sendError.message }, { status: 500 })
    }

    // Log the email in background
    logEmail(supabase, orgId, {
      candidate_id: candidate.id,
      application_id: offer.application_id,
      subject,
      body_html: emailHtml,
      to_email: candidate.email,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).catch((err) => console.error('[Offer Email Log Error]', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Offer Send Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to send offer email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
