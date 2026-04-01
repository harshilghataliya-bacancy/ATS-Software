/**
 * Shared email HTML wrapper — provides consistent Keka-style professional
 * design for ALL outgoing emails from HireFlow.
 *
 * The inner body_html from the template is placed inside this chrome.
 */

export function wrapEmailHtml(
  bodyHtml: string,
  companyName: string,
  options?: { accentColor?: string; footerText?: string }
): string {
  const accent = options?.accentColor || '#e97a1f'
  const footer = options?.footerText || 'Powered by HireFlow'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:2px solid ${accent};">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:${accent};line-height:1.3;">${companyName}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 32px;">
            <div style="font-size:14px;line-height:1.7;color:#374151;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">${footer}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Build a clean HTML detail table (Keka-style) from key-value pairs.
 * Skips entries where value is falsy.
 */
export function buildDetailTable(rows: Array<{ label: string; value: string | null | undefined; href?: string }>): string {
  const filteredRows = rows.filter((r) => r.value)
  if (filteredRows.length === 0) return ''

  const rowsHtml = filteredRows
    .map(
      (r) =>
        `<tr>
          <td style="padding:10px 14px;font-weight:600;color:#374151;border:1px solid #e5e7eb;white-space:nowrap;width:180px;">${r.label}</td>
          <td style="padding:10px 14px;color:#374151;border:1px solid #e5e7eb;">${
            r.href ? `<a href="${r.href}" style="color:#2563eb;text-decoration:none;">${r.value}</a>` : r.value
          }</td>
        </tr>`
    )
    .join('\n')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
    ${rowsHtml}
  </table>`
}
