/**
 * Render an HTML string to a PDF buffer using Playwright's headless Chromium.
 * Uses eval('require') to prevent Next.js webpack from bundling playwright-core.
 *
 * Browser Singleton: A single Chromium instance is reused across requests.
 * This cuts PDF generation from ~1-2s (cold launch) to ~200-400ms (reuse).
 * The browser auto-closes after 5 minutes of inactivity to free memory.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _browser: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _browserPromise: Promise<any> | null = null
let _idleTimer: ReturnType<typeof setTimeout> | null = null

const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes

function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer)
  _idleTimer = setTimeout(async () => {
    if (_browser) {
      try { await _browser.close() } catch { /* already closed */ }
      _browser = null
      _browserPromise = null
    }
  }, IDLE_TIMEOUT)
}

async function getBrowser() {
  // Return existing browser if still connected
  if (_browser && _browser.isConnected()) {
    resetIdleTimer()
    return _browser
  }

  // If a launch is already in progress, wait for it
  if (_browserPromise) {
    _browser = await _browserPromise
    if (_browser && _browser.isConnected()) {
      resetIdleTimer()
      return _browser
    }
  }

  // Launch new browser
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw = eval('require')('playwright-core') as any
  _browserPromise = pw.chromium.launch({ headless: true })
  _browser = await _browserPromise
  resetIdleTimer()
  return _browser
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
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
    await context.close()
  }
}
