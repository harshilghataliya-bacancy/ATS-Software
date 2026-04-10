import { chromium } from 'playwright-core'

/**
 * Render an HTML string to a PDF buffer using Playwright's headless Chromium.
 * The HTML should already contain all styling and pagination logic.
 * Returns a Buffer containing the PDF bytes.
 */
export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    // A4 at 96 DPI = 794 x 1123 px
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.setContent(html, { waitUntil: 'load' })
    // Allow pagination JS and font loading to finish
    await page.waitForTimeout(1500)
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
