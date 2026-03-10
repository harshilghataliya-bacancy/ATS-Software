import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferById } from '@/lib/services/offers'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import { formatSalary } from '@/lib/offer-template'
import { EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS } from '@/lib/constants'
import React from 'react'

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const offerId = searchParams.get('id')

  if (!offerId) {
    return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 })
  }

  const orgId = membership.organization_id
  const { data: offer, error } = await getOfferById(supabase, offerId, orgId)

  if (error || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  const candidate = offer.application?.candidate
  const job = offer.application?.job

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 400 })
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  const companyName = org?.name || 'Company'

  // ── Resolve offer template ──────────────────────────────────────────────
  // Use the offer's selected template first, then fall back to the org's active template
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let template: Record<string, any> | null = null

  const templateId = (offer as any).offer_template_id
  if (templateId) {
    const { data: t } = await supabase
      .from('offer_templates')
      .select('*')
      .eq('id', templateId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single()
    if (t) template = t
  }

  if (!template) {
    const { data: t } = await supabase
      .from('offer_templates')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle()
    if (t) template = t
  }
  // ────────────────────────────────────────────────────────────────────────

  const candidateName = `${candidate.first_name} ${candidate.last_name}`
  const salaryFormatted = formatSalary(offer.salary || 0, offer.salary_currency || 'INR')
  const startDate = offer.start_date
    ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'
  const expiryDate = offer.expiry_date
    ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'

  const salaryComponents = Array.isArray(offer.salary_components) ? offer.salary_components : []
  const bonusComponents = Array.isArray(offer.bonus_components) ? offer.bonus_components : []
  const empLabel = EMPLOYMENT_TYPE_OPTIONS.find((e) => e.value === offer.employment_type)?.label || offer.employment_type || ''
  const workLabel = WORK_TYPE_OPTIONS.find((w) => w.value === offer.work_type)?.label || offer.work_type || ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: template?.company_name || companyName,
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
      // Template overrides
      templateLogoUrl: template?.logo_url || undefined,
      templateCompanyName: template?.company_name || undefined,
      templateTerms: template?.terms_and_conditions || undefined,
      primaryColor: template?.primary_color || undefined,
      accentColor: template?.accent_color || undefined,
      greetingText: template?.greeting_text || undefined,
      introText: template?.intro_text || undefined,
      closingText: template?.closing_text || undefined,
      validityText: template?.validity_text || undefined,
      acceptanceText: template?.acceptance_text || undefined,
      signatoryName: template?.signatory_name || undefined,
      signatoryTitle: template?.signatory_title || undefined,
      signatoryLabel: template?.signatory_label || undefined,
      candidateSigLabel: template?.candidate_sig_label || undefined,
      showSalaryBreakdown: template?.show_salary_breakdown ?? true,
      showBonusSection: template?.show_bonus_section ?? true,
      showTermsSection: template?.show_terms_section ?? true,
      showAcceptanceSection: template?.show_acceptance_section ?? true,
      showSignatureBlock: template?.show_signature_block ?? true,
      footerText: template?.footer_text || undefined,
      // Contact info for header (stored in template if available)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyPhone:   (template as any)?.company_phone   || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyEmail:   (template as any)?.company_email   || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyWebsite: (template as any)?.company_website || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyAddress: (template as any)?.company_address || undefined,
    }) as any
    const buffer = await renderToBuffer(pdfElement)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="offer-${candidate.last_name.toLowerCase()}-${job?.title?.toLowerCase().replace(/\s+/g, '-') || 'position'}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[PDF Generation Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to generate PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
