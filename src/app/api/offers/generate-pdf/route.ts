import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferById } from '@/lib/services/offers'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
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
  const candidateName = `${candidate.first_name} ${candidate.last_name}`
  const salaryFormatted = formatSalary(offer.salary || 0, offer.salary_currency || 'USD')
  const startDate = offer.start_date
    ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'
  const expiryDate = offer.expiry_date
    ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'TBD'

  const templateContent = substituteOfferVariables(offer.template_html || '', {
    candidate_name: candidateName,
    job_title: job?.title || '',
    department: job?.department || '',
    salary: salaryFormatted,
    start_date: startDate,
    expiry_date: expiryDate,
    company_name: companyName,
  })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName,
      candidateName,
      candidateEmail: candidate.email,
      jobTitle: job?.title || '',
      department: job?.department || '',
      salary: salaryFormatted,
      startDate,
      expiryDate,
      templateContent,
      createdDate: new Date(offer.created_at).toLocaleDateString('en-US', { dateStyle: 'long' }),
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
