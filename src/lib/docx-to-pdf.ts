/**
 * Render an HTML string to a PDF buffer using headless Chromium.
 *
 * On Vercel/serverless: Uses puppeteer-core + @sparticuz/chromium
 * Locally: Falls back to playwright-core if available
 *
 * Browser Singleton: Reuses a single browser instance across requests.
 * Auto-closes after 5 minutes of inactivity to free memory.
 */

import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'

let _browser: Browser | null = null
let _browserPromise: Promise<Browser> | null = null
let _idleTimer: ReturnType<typeof setTimeout> | null = null

const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const IS_VERCEL = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

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

async function getBrowser(): Promise<Browser> {
  // Return existing browser if still connected
  if (_browser && _browser.connected) {
    resetIdleTimer()
    return _browser
  }

  // If a launch is already in progress, wait for it
  if (_browserPromise) {
    _browser = await _browserPromise
    if (_browser && _browser.connected) {
      resetIdleTimer()
      return _browser
    }
  }

  // Launch new browser
  if (IS_VERCEL) {
    // Serverless: use @sparticuz/chromium (optimized for Lambda/Vercel)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (await import('@sparticuz/chromium')).default as any
    _browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 794, height: 1123 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true,
    })
  } else {
    // Local dev: use system Chrome or playwright's chromium
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let execPath: string | undefined
    try {
      // Try to find playwright's chromium
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = eval('require')('playwright-core') as any
      execPath = pw.chromium.executablePath()
    } catch {
      // Fallback to common Chrome locations on macOS
      const { existsSync } = await import('fs')
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
      execPath = paths.find(p => existsSync(p))
    }
    _browserPromise = puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 794, height: 1123 },
      executablePath: execPath,
      headless: true,
    })
  }

  _browser = await _browserPromise
  resetIdleTimer()
  return _browser
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 794, height: 1123 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    // Wait for Google Fonts (Dancing Script etc.) to fully load
    await page.evaluate(() => document.fonts.ready)
    await new Promise(r => setTimeout(r, 500))
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    return Buffer.from(pdfBuffer)
  } finally {
    await page.close()
  }
}
