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

    // Use template data passed directly from the client (selected template) OR fall back to active template
    let tpl: Record<string, unknown> | null = null
    if (body.usePassedTemplate) {
      // Client passed full template fields — use them directly
      tpl = body
    } else if (membership) {
      const { data } = await getActiveOfferTemplate(supabase, membership.organization_id)
      tpl = data
    }

    // Resolve logo URL (converts SVG to PNG if needed)
    const logoUrl = (tpl?.templateLogoUrl || tpl?.logo_url) as string | undefined
    const resolvedLogo = logoUrl ? await resolveLogoForPdf(logoUrl) : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: (tpl?.templateCompanyName || tpl?.company_name || body.companyName || 'Company') as string,
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
      templateCompanyName: (tpl?.templateCompanyName || tpl?.company_name) as string | undefined,
      templateTerms: (tpl?.templateTerms || tpl?.terms_and_conditions) as string | undefined,
      // Full template customization
      primaryColor: (tpl?.primaryColor || tpl?.primary_color) as string | undefined,
      accentColor: (tpl?.accentColor || tpl?.accent_color) as string | undefined,
      greetingText: (tpl?.greetingText || tpl?.greeting_text) as string | undefined,
      introText: (tpl?.introText || tpl?.intro_text) as string | undefined,
      closingText: (tpl?.closingText || tpl?.closing_text) as string | undefined,
      validityText: (tpl?.validityText || tpl?.validity_text) as string | undefined,
      acceptanceText: (tpl?.acceptanceText || tpl?.acceptance_text) as string | undefined,
      signatoryName: (tpl?.signatoryName || tpl?.signatory_name) as string | undefined,
      signatoryTitle: (tpl?.signatoryTitle || tpl?.signatory_title) as string | undefined,
      signatoryLabel: (tpl?.signatoryLabel || tpl?.signatory_label) as string | undefined,
      candidateSigLabel: (tpl?.candidateSigLabel || tpl?.candidate_sig_label) as string | undefined,
      showSalaryBreakdown: ((tpl?.showSalaryBreakdown ?? tpl?.show_salary_breakdown) as boolean | undefined) ?? true,
      showBonusSection: ((tpl?.showBonusSection ?? tpl?.show_bonus_section) as boolean | undefined) ?? true,
      showTermsSection: ((tpl?.showTermsSection ?? tpl?.show_terms_section) as boolean | undefined) ?? true,
      showAcceptanceSection: ((tpl?.showAcceptanceSection ?? tpl?.show_acceptance_section) as boolean | undefined) ?? true,
      showSignatureBlock: ((tpl?.showSignatureBlock ?? tpl?.show_signature_block) as boolean | undefined) ?? true,
      footerText: (tpl?.footerText || tpl?.footer_text) as string | undefined,
      companyPhone:   (tpl?.companyPhone   || tpl?.company_phone)   as string | undefined,
      companyEmail:   (tpl?.companyEmail   || tpl?.company_email)   as string | undefined,
      companyWebsite: (tpl?.companyWebsite || tpl?.company_website) as string | undefined,
      companyAddress: (tpl?.companyAddress || tpl?.company_address) as string | undefined,
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
