import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferById, sendOffer } from '@/lib/services/offers'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'
import { logEmail } from '@/lib/services/email'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'

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

  if (offer.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft offers can be sent' }, { status: 400 })
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

  // Substitute variables in template
  const html = substituteOfferVariables(offer.template_html || '', {
    candidate_name: `${candidate.first_name} ${candidate.last_name}`,
    job_title: job?.title || '',
    department: job?.department || '',
    salary: formatSalary(offer.salary, offer.salary_currency || 'USD'),
    start_date: offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    expiry_date: offer.expiry_date ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    company_name: org?.name || '',
  })

  const subject = `Offer Letter - ${job?.title || 'Position'} at ${org?.name || 'Our Company'}`
  const fromEmail = tokenResult.fromEmail || user.email!

  try {
    // Generate PDF attachment
    const candidateName = `${candidate.first_name} ${candidate.last_name}`
    const salaryFormatted = formatSalary(offer.salary || 0, offer.salary_currency || 'USD')
    const startDate = offer.start_date
      ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' })
      : 'TBD'
    const expiryDate = offer.expiry_date
      ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })
      : 'TBD'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: org?.name || 'Company',
      candidateName,
      candidateEmail: candidate.email,
      jobTitle: job?.title || '',
      department: job?.department || '',
      salary: salaryFormatted,
      startDate,
      expiryDate,
      templateContent: html,
      createdDate: new Date(offer.created_at).toLocaleDateString('en-US', { dateStyle: 'long' }),
    }) as any
    const pdfBuffer = await renderToBuffer(pdfElement)
    const pdfFilename = `offer-${candidate.last_name.toLowerCase()}-${job?.title?.toLowerCase().replace(/\s+/g, '-') || 'position'}.pdf`

    await sendGmailEmail(tokenResult.accessToken, {
      from: fromEmail,
      to: candidate.email,
      subject,
      html,
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

    // Log the email
    await logEmail(supabase, orgId, {
      candidate_id: candidate.id,
      application_id: offer.application_id,
      subject,
      body_html: html,
      to_email: candidate.email,
      from_email: fromEmail,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Offer Send Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to send offer email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
