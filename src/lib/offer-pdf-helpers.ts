/**
 * Shared helpers for generating offer letter PDFs from body_html templates.
 * Used by both preview-pdf and send routes.
 */

const PAGE_DELIMITER = '<!--PAGE_BREAK-->'

export interface SalaryComp { name: string; monthly: number; annual: number; section?: string }

export interface LetterheadData {
  page1Url: string | null
  contUrl: string | null
  margins: { top: number; bottom: number; left: number; right: number }
}

function fmtINR(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function buildSalaryTable(components: SalaryComp[]): string {
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

export function substituteVars(html: string, vars: Record<string, string>): string {
  let result = html
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val)
  }
  return result
}

export function buildHtmlForPages(
  bodyHtml: string,
  vars: Record<string, string>,
  lhData: LetterheadData | null,
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
