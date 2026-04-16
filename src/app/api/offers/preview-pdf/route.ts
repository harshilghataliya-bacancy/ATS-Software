import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOfferTemplate } from '@/lib/services/offer-templates'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'
import { resolveLogoForPdf } from '@/lib/utils/logo-converter'
import { generatePdfFromHtml } from '@/lib/docx-to-pdf'

// ─── Helpers for body_html template rendering ────────────────────────────

const PAGE_DELIMITER = '<!--PAGE_BREAK-->'

interface SalaryComp { name: string; monthly: number; annual: number; section?: string }

function fmtINR(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function buildSalaryTable(components: SalaryComp[]): string {
  if (!components?.length) return ''
  const earnings = components.filter(c => c.section === 'earnings')
  const employer = components.filter(c => c.section === 'employer')
  const deductions = components.filter(c => c.section === 'deduction')
  const grossAnnual = earnings.reduce((s, c) => s + c.annual, 0)
  const employerAnnual = employer.reduce((s, c) => s + c.annual, 0)
  const totalCtc = grossAnnual + employerAnnual

  const row = (name: string, m: number, a: number, bold = false) => {
    const s = bold ? 'font-weight:600;background:#f0fdf4;' : 'border-bottom:1px solid #f3f4f6;'
    return `<tr style="${s}"><td style="padding:4px 10px">${name}</td><td style="text-align:right;padding:4px 10px">${fmtINR(m)}</td><td style="text-align:right;padding:4px 10px">${fmtINR(a)}</td></tr>`
  }

  let rows = ''
  earnings.forEach(c => { rows += row(c.name, c.monthly, c.annual) })
  rows += row('Sub Total (Gross)', Math.round(grossAnnual / 12), grossAnnual, true)
  employer.forEach(c => { rows += row(c.name, c.monthly, c.annual) })
  rows += row('Total CTC', Math.round(totalCtc / 12), totalCtc, true)
  if (deductions.length) {
    deductions.forEach(c => { rows += row(c.name, c.monthly, c.annual) })
    const netAnnual = grossAnnual - deductions.reduce((s, c) => s + c.annual, 0)
    rows += row('Net Take Home', Math.round(netAnnual / 12), netAnnual, true)
  }

  return `<table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e5e7eb">
<thead><tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
<th style="text-align:left;padding:6px 10px;font-weight:600">Component</th>
<th style="text-align:right;padding:6px 10px;font-weight:600">Monthly (₹)</th>
<th style="text-align:right;padding:6px 10px;font-weight:600">Annual (₹)</th>
</tr></thead><tbody>${rows}</tbody></table>`
}

function substituteVars(html: string, vars: Record<string, string>): string {
  let result = html
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val)
  }
  return result
}

function buildHtmlForPages(
  bodyHtml: string,
  vars: Record<string, string>,
  lhData: { page1Url: string | null; contUrl: string | null; margins: { top: number; bottom: number; left: number; right: number } } | null,
): string {
  const pages = bodyHtml.split(PAGE_DELIMITER)
  // A4 at 96dpi (Playwright uses 96dpi): 794 x 1123 px
  const A4_W = 794
  const A4_H = 1123
  const mmToPx96 = (mm: number) => Math.round(mm * A4_W / 210)
  const m = lhData?.margins || { top: 35, bottom: 25, left: 20, right: 20 }
  const marginTop = mmToPx96(m.top)
  const marginBottom = mmToPx96(m.bottom)
  const marginLeft = mmToPx96(m.left)
  const marginRight = mmToPx96(m.right)

  const pagesHtml = pages.map((pageContent, idx) => {
    const bgUrl = idx === 0 ? lhData?.page1Url : (lhData?.contUrl || lhData?.page1Url)
    const substituted = substituteVars(pageContent, vars)
    const bgStyle = bgUrl
      ? `background: url('${bgUrl}') 0 0 / 100% 100% no-repeat;`
      : 'background: white;'
    const isLast = idx === pages.length - 1

    return `<div class="page" style="
      width: ${A4_W}px; height: ${A4_H}px; position: relative; overflow: hidden;
      ${bgStyle}
      ${isLast ? '' : 'page-break-after: always;'}
    ">
      <div style="
        position: absolute;
        top: ${marginTop}px; left: ${marginLeft}px;
        right: ${marginRight}px; bottom: ${marginBottom}px;
        overflow: hidden;
        font-family: Georgia, serif;
        font-size: 13px;
        line-height: 1.6;
        color: #1a1a1a;
      ">
        <div class="prose">${substituted}</div>
      </div>
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${A4_W}px; }
  .page { width: ${A4_W}px; height: ${A4_H}px; }
  .prose { max-width: none; }
  .prose p { margin-bottom: 0.4em; }
  .prose p:empty { min-height: 1.2em; }
  .prose strong { font-weight: 700; }
  .prose u { text-decoration: underline; }
  .prose h1 { font-size: 22px; font-weight: 700; margin-bottom: 0.5em; }
  .prose h2 { font-size: 18px; font-weight: 700; margin-bottom: 0.4em; }
  .prose ul, .prose ol { padding-left: 1.5em; margin-bottom: 0.5em; }
  .prose li { margin-bottom: 0.2em; }
  .prose table { width: 100%; border-collapse: collapse; }
  .prose hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.8em 0; }
</style>
</head>
<body>${pagesHtml}</body>
</html>`
}

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
      let lhData: { page1Url: string | null; contUrl: string | null; margins: { top: number; bottom: number; left: number; right: number } } | null = null
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
