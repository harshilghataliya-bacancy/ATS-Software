import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOfferTemplate } from '@/lib/services/offer-templates'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'
import { resolveLogoForPdf } from '@/lib/utils/logo-converter'

// Generate a PDF preview without saving to DB — accepts all offer data in POST body
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Fetch active template for this user's org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let activeTemplate = null
    if (membership) {
      const { data } = await getActiveOfferTemplate(supabase, membership.organization_id)
      activeTemplate = data
    }

    // Resolve logo URL (converts SVG to PNG if needed)
    const logoUrl = activeTemplate?.logo_url || undefined
    const resolvedLogo = logoUrl ? await resolveLogoForPdf(logoUrl) : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: activeTemplate?.company_name || body.companyName || 'Company',
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
