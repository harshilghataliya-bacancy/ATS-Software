import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'

// Generate a PDF preview without saving to DB — accepts all offer data in POST body
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: body.companyName || 'Company',
      candidateName: body.candidateName || '',
      candidateEmail: body.candidateEmail || '',
      jobTitle: body.jobTitle || '',
      department: body.department || '',
      businessUnit: body.businessUnit || undefined,
      employmentType: body.employmentType || undefined,
      workType: body.workType || undefined,
      location: body.location || undefined,
      reportingManager: body.reportingManager || undefined,
      salary: body.salary || '',
      salaryCurrency: body.salaryCurrency || 'INR',
      startDate: body.startDate || 'TBD',
      expiryDate: body.expiryDate || 'TBD',
      createdDate: body.createdDate || new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      salaryComponents: body.salaryComponents || undefined,
      bonusComponents: body.bonusComponents || undefined,
      pfApplicable: body.pfApplicable ?? false,
    }) as any

    const buffer = await renderToBuffer(pdfElement)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="offer-preview.pdf"',
      },
    })
  } catch (err) {
    console.error('[PDF Preview Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to generate PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
