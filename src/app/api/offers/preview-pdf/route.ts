import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOfferTemplate } from '@/lib/services/offer-templates'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'
import { resolveLogoForPdf } from '@/lib/utils/logo-converter'
import { generatePdfFromHtml } from '@/lib/docx-to-pdf'
import { buildSalaryTable, buildHtmlForPages, type LetterheadData } from '@/lib/offer-pdf-helpers'

// ─── Main Route ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    // ─── New body_html template system ────────────────────────────────
    if (body.bodyHtml) {
      // Build variable map from offer data
      const vars: Record<string, string> = {
        '{{candidate_name}}': body.candidateName || '',
        '{{candidate_email}}': body.candidateEmail || '',
        '{{job_title}}': body.jobTitle || '',
        '{{department}}': body.department || '',
        '{{business_unit}}': body.businessUnit || '',
        '{{location}}': body.location || '',
        '{{salary}}': body.salary || '',
        '{{salary_currency}}': body.salaryCurrency || 'INR',
        '{{remuneration_type}}': 'Annual',
        '{{start_date}}': body.startDate || 'TBD',
        '{{expiry_date}}': body.expiryDate || 'TBD',
        '{{employment_type}}': body.employmentType || '',
        '{{work_type}}': body.workType || '',
        '{{reporting_manager}}': body.reportingManager || '',
        '{{company_name}}': body.companyName || '',
        '{{signatory_name}}': body.signatoryName
          ? `<span style="font-family:'Dancing Script',cursive;font-size:18px">${body.signatoryName}</span>`
          : '',
        '{{signatory_title}}': body.signatoryTitle || '',
        '{{salary_structure}}': buildSalaryTable(body.salaryComponents || []),
      }

      // Fetch letterhead data if letterhead_id is provided
      let lhData: LetterheadData | null = null
      if (body.letterheadId && membership) {
        const { data: lh } = await supabase
          .from('letterheads')
          .select('*')
          .eq('id', body.letterheadId)
          .eq('organization_id', membership.organization_id)
          .is('deleted_at', null)
          .single()

        if (lh) {
          let page1Url = lh.page1_url
          let contUrl = lh.continuation_url
          // Generate signed URLs for storage paths
          if (lh.page1_storage_path) {
            const { data: sig } = await supabase.storage
              .from('letterheads')
              .createSignedUrl(lh.page1_storage_path, 60 * 5)
            if (sig?.signedUrl) page1Url = sig.signedUrl
          }
          if (lh.continuation_storage_path) {
            const { data: sig } = await supabase.storage
              .from('letterheads')
              .createSignedUrl(lh.continuation_storage_path, 60 * 5)
            if (sig?.signedUrl) contUrl = sig.signedUrl
          }
          lhData = {
            page1Url,
            contUrl,
            margins: {
              top: lh.margin_top || 35,
              bottom: lh.margin_bottom || 25,
              left: lh.margin_left || 20,
              right: lh.margin_right || 20,
            },
          }
        }
      }

      const html = buildHtmlForPages(body.bodyHtml, vars, lhData)
      const pdfBuffer = await generatePdfFromHtml(html)

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="offer-preview.pdf"',
        },
      })
    }

    // ─── Legacy template system (React-PDF) ───────────────────────────
    let tpl: Record<string, unknown> | null = null
    if (body.usePassedTemplate) {
      tpl = body
    } else if (membership) {
      const { data } = await getActiveOfferTemplate(supabase, membership.organization_id)
      tpl = data
    }

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
