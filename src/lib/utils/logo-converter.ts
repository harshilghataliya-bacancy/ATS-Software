import sharp from 'sharp'

/**
 * Fetches a logo URL and returns a base64 data URI suitable for @react-pdf/renderer.
 * Converts SVG to PNG automatically. Returns undefined if fetch fails.
 */
export async function resolveLogoForPdf(url: string): Promise<string | undefined> {
  if (!url) return undefined

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined

    const contentType = res.headers.get('content-type') || ''
    const buffer = Buffer.from(await res.arrayBuffer())

    const isSvg = contentType.includes('svg') || url.toLowerCase().endsWith('.svg')

    if (isSvg) {
      // Convert SVG to PNG using sharp
      const pngBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      return `data:image/png;base64,${pngBuffer.toString('base64')}`
    }

    // Already PNG/JPG — return as data URI
    const mime = contentType.includes('png') ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (err) {
    console.error('[Logo Converter] Failed to resolve logo:', err)
    return undefined
  }
}
