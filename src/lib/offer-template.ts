export interface OfferTemplateVariables {
  candidate_name: string
  job_title: string
  department: string
  salary: string
  start_date: string
  expiry_date: string
  company_name: string
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
