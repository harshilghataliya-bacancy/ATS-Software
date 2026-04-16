/**
 * Render an HTML string to a PDF buffer using Playwright's headless Chromium.
 * Uses eval('require') to prevent Next.js webpack from bundling playwright-core.
 */
export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw = eval('require')('playwright-core') as any
  const browser = await pw.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    // A4 at 96 DPI = 794 x 1123 px
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.setContent(html, { waitUntil: 'networkidle' })
    // Wait for Google Fonts (Dancing Script etc.) to fully load
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
