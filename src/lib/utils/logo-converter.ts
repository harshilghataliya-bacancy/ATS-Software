import sharp from 'sharp'

/**
 * Fetches a logo URL and returns a base64 data URI suitable for @react-pdf/renderer.
 * Converts any image format (SVG, WebP, PNG, JPG, etc.) to PNG via sharp.
 * Returns undefined if fetch fails.
 */
export async function resolveLogoForPdf(url: string): Promise<string | undefined> {
  if (!url) return undefined

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined

    const buffer = Buffer.from(await res.arrayBuffer())

    // Always convert through sharp to get a clean PNG — handles SVG, WebP, AVIF, JPEG, etc.
    const pngBuffer = await sharp(buffer)
      .resize(400, 160, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    return `data:image/png;base64,${pngBuffer.toString('base64')}`
  } catch (err) {
    console.error('[Logo Converter] Failed to resolve logo:', err)
    return undefined
  }
}
