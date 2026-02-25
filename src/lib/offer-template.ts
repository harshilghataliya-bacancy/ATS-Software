export interface OfferTemplateVariables {
  candidate_name: string
  job_title: string
  department: string
  salary: string
  start_date: string
  expiry_date: string
  company_name: string
  reporting_manager?: string
  employment_type?: string
  location?: string
  work_type?: string
  business_unit?: string
  salary_structure?: string
}

export interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section?: string
}

export interface BonusComponent {
  name: string
  amount: number
  frequency: string
}

export function formatSalaryStructureHtml(
  components: SalaryComponent[],
  currency: string,
  bonusComponents?: BonusComponent[]
): string {
  if (!components || components.length === 0) return ''

  const earnings = components.filter((c) => !c.section || c.section === 'earnings')
  const employer = components.filter((c) => c.section === 'employer')
  const deductions = components.filter((c) => c.section === 'deduction')

  const earningsTotal = earnings.reduce((s, c) => s + c.annual, 0)
  const employerTotal = employer.reduce((s, c) => s + c.annual, 0)
  const deductionsTotal = deductions.reduce((s, c) => s + c.annual, 0)
  const netPay = earningsTotal - deductionsTotal

  const thStyle = 'text-align:left;padding:8px;border:1px solid #e5e7eb;'
  const thRightStyle = 'text-align:right;padding:8px;border:1px solid #e5e7eb;'
  const tdStyle = 'padding:8px;border:1px solid #e5e7eb;'
  const tdRightStyle = 'text-align:right;padding:8px;border:1px solid #e5e7eb;'
  const sectionStyle = 'background:#eef2ff;font-weight:bold;padding:8px;border:1px solid #e5e7eb;'
  const totalStyle = 'font-weight:bold;background:#f9fafb;'

  let html = `<table style="width:100%;border-collapse:collapse;margin:12px 0;">
<thead>
<tr style="background:#f3f4f6;">
<th style="${thStyle}">Component</th>
<th style="${thRightStyle}">Monthly</th>
<th style="${thRightStyle}">Annual</th>
</tr>
</thead>
<tbody>`

  // Earnings
  if (earnings.length > 0) {
    html += `<tr><td colspan="3" style="${sectionStyle}">Earnings</td></tr>`
    for (const c of earnings) {
      html += `<tr>
<td style="${tdStyle}">${c.name}</td>
<td style="${tdRightStyle}">${formatNumber(c.monthly, currency)}</td>
<td style="${tdRightStyle}">${formatNumber(c.annual, currency)}</td>
</tr>`
    }
    html += `<tr style="${totalStyle}">
<td style="${tdStyle}">Gross Salary</td>
<td style="${tdRightStyle}">${formatNumber(Math.round(earningsTotal / 12), currency)}</td>
<td style="${tdRightStyle}">${formatNumber(earningsTotal, currency)}</td>
</tr>`
  }

  // Deductions
  if (deductions.length > 0) {
    html += `<tr><td colspan="3" style="${sectionStyle}">Deductions</td></tr>`
    for (const c of deductions) {
      html += `<tr>
<td style="${tdStyle}">${c.name}</td>
<td style="${tdRightStyle}">${formatNumber(c.monthly, currency)}</td>
<td style="${tdRightStyle}">${formatNumber(c.annual, currency)}</td>
</tr>`
    }
    html += `<tr style="${totalStyle}">
<td style="${tdStyle}">Net Pay (Take Home)</td>
<td style="${tdRightStyle}">${formatNumber(Math.round(netPay / 12), currency)}</td>
<td style="${tdRightStyle}">${formatNumber(netPay, currency)}</td>
</tr>`
  }

  // Employer contributions
  if (employer.length > 0) {
    html += `<tr><td colspan="3" style="${sectionStyle}">Employer Contributions</td></tr>`
    for (const c of employer) {
      html += `<tr>
<td style="${tdStyle}">${c.name}</td>
<td style="${tdRightStyle}">${formatNumber(c.monthly, currency)}</td>
<td style="${tdRightStyle}">${formatNumber(c.annual, currency)}</td>
</tr>`
    }
  }

  // Total CTC
  const totalCtc = earningsTotal + employerTotal
  html += `<tr style="font-weight:bold;background:#e0e7ff;">
<td style="${tdStyle}">Total CTC</td>
<td style="${tdRightStyle}">${formatNumber(Math.round(totalCtc / 12), currency)}</td>
<td style="${tdRightStyle}">${formatNumber(totalCtc, currency)}</td>
</tr>
</tbody>
</table>`

  if (bonusComponents && bonusComponents.length > 0) {
    html += `<p style="margin-top:8px;"><strong>Bonus Components:</strong></p><ul>`
    for (const b of bonusComponents) {
      html += `<li>${b.name}: ${formatNumber(b.amount, currency)} (${b.frequency})</li>`
    }
    html += `</ul>`
  }

  return html
}

function formatNumber(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export function substituteOfferVariables(
  template: string,
  vars: Partial<OfferTemplateVariables>
): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(`{{${key}}}`, value)
    }
  }
  return result
}

export function formatSalary(amount: number, currency: string): string {
  return formatNumber(amount, currency)
}

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
