// Utilities for extracting rich content from a .docx file.
//
// mammoth handles the main document body (including body images), but it
// does NOT extract headers/footers. This module unzips the .docx with JSZip,
// finds the first header and footer parts, inlines any images referenced
// from them as base64 data URLs, and converts their WordprocessingML into
// simple HTML so we can render the template with the same visual structure
// as the original Word file.

import JSZip from 'jszip'
import mammoth from 'mammoth'

/** Page margins extracted from the Word document's section properties (in mm). */
export interface DocxPageMargins {
  top: number
  bottom: number
  left: number
  right: number
  header: number
  footer: number
}

export interface ParsedDocx {
  body_html: string
  header_html: string | null
  footer_html: string | null
  /**
   * Base64 data URL of a full-page background image detected in the header or
   * footer (anchored drawing with behindDoc=1 that covers most of the page).
   * Templates built from a single letterhead PNG commonly use this pattern.
   */
  page_background_url: string | null
  /** Page margins from the Word document's section properties */
  page_margins: DocxPageMargins | null
  /** Placeholders detected in the combined content (body + header + footer) */
  placeholders: string[]
}

// A4 at 96dpi is ~794×1123 px. Any image wider than ~70% of the page and
// taller than ~60% of the page (and anchored behindDoc) is treated as a
// full-page background rather than inline content.
const PAGE_BG_MIN_WIDTH_PX = 550
const PAGE_BG_MIN_HEIGHT_PX = 650

// ---------------------------------------------------------------------------
// Minimal WordprocessingML → HTML converter for header/footer parts
// ---------------------------------------------------------------------------

const TEXT_ELEMENT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
const PARAGRAPH_ELEMENT = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g
const RUN_ELEMENT = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g
const DRAWING_ELEMENT = /<w:drawing>[\s\S]*?<\/w:drawing>/
const ALIGNMENT_ELEMENT = /<w:jc\s+w:val="(left|center|right|both)"\s*\/>/
const EMU_PER_PX = 9525 // 1 pixel = 9525 EMU (914400 EMU = 1 inch; 96 px = 1 inch)

/** Context used by the parser to collect out-of-band artefacts. */
interface ParseContext {
  imageMap: Map<string, string>
  /** Set by the parser when it encounters a full-page background drawing. */
  pageBackgroundUrl: string | null
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extToMime(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  if (e === 'gif') return 'image/gif'
  if (e === 'svg') return 'image/svg+xml'
  if (e === 'bmp') return 'image/bmp'
  if (e === 'webp') return 'image/webp'
  return `image/${e}`
}

/**
 * Convert a `<w:drawing>…</w:drawing>` block into an `<img>` tag using the
 * provided rId → data-URL map. Returns empty string if the embed id can't be
 * resolved OR if the drawing was absorbed as a full-page background (stored on
 * `ctx.pageBackgroundUrl`).
 */
function drawingToImgTag(drawingXml: string, ctx: ParseContext): string {
  const embedMatch = drawingXml.match(/r:embed="([^"]+)"/)
  if (!embedMatch) return ''
  const dataUrl = ctx.imageMap.get(embedMatch[1])
  if (!dataUrl) return ''

  // Size comes from <wp:extent cx="..." cy="..."/> in EMU.
  const sizeMatch = drawingXml.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/)
  let widthPx: number | null = null
  let heightPx: number | null = null
  if (sizeMatch) {
    widthPx = Math.round(parseInt(sizeMatch[1], 10) / EMU_PER_PX)
    heightPx = Math.round(parseInt(sizeMatch[2], 10) / EMU_PER_PX)
  }

  // Detect "page background" drawings: anchored behindDoc=1 and sized to
  // roughly cover the page. These should be rendered as a CSS background on
  // the page div, not as inline header content.
  const isAnchored = /<wp:anchor\b/.test(drawingXml)
  const isBehindDoc = /behindDoc="1"/.test(drawingXml)
  if (
    isAnchored &&
    isBehindDoc &&
    widthPx !== null &&
    heightPx !== null &&
    widthPx >= PAGE_BG_MIN_WIDTH_PX &&
    heightPx >= PAGE_BG_MIN_HEIGHT_PX
  ) {
    // Prefer the largest background if multiple are found.
    if (!ctx.pageBackgroundUrl) {
      ctx.pageBackgroundUrl = dataUrl
    }
    return '' // Absorbed — don't emit inline
  }

  const sizeStyle =
    widthPx !== null && heightPx !== null
      ? ` style="width:${widthPx}px;height:${heightPx}px;max-width:100%;"`
      : ' style="max-width:100%;"'

  return `<img src="${dataUrl}"${sizeStyle} alt="" />`
}

function runToHtml(runXml: string, ctx: ParseContext): string {
  // A run can contain a drawing (image) OR text — handle drawing first.
  const drawingMatch = runXml.match(DRAWING_ELEMENT)
  if (drawingMatch) {
    return drawingToImgTag(drawingMatch[0], ctx)
  }

  // Text extraction, preserving <w:br/> as <br>
  let html = ''
  const segments = runXml.split(/<w:br\s*\/>/g)
  segments.forEach((seg, i) => {
    if (i > 0) html += '<br/>'
    TEXT_ELEMENT.lastIndex = 0
    let tm: RegExpExecArray | null
    while ((tm = TEXT_ELEMENT.exec(seg)) !== null) {
      html += decodeXmlEntities(tm[1])
    }
  })

  // Apply styling from <w:rPr> — preserve font size, color, highlight, etc.
  const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)
  if (rPrMatch && html) {
    const rPr = rPrMatch[1]
    if (/<w:b\s*\/>/.test(rPr) || /<w:b\s+w:val="(?:true|1)"\s*\/>/.test(rPr)) {
      html = `<strong>${html}</strong>`
    }
    if (/<w:i\s*\/>/.test(rPr) || /<w:i\s+w:val="(?:true|1)"\s*\/>/.test(rPr)) {
      html = `<em>${html}</em>`
    }
    if (/<w:u\s/.test(rPr)) {
      html = `<u>${html}</u>`
    }

    // Collect inline styles for font size, color, font family, highlight
    const inlineStyles: string[] = []

    // Font size: <w:sz w:val="24"/> means 12pt (value is in half-points)
    const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/)
    if (szMatch) {
      const pt = parseInt(szMatch[1], 10) / 2
      inlineStyles.push(`font-size:${pt}pt`)
    }

    // Font color: <w:color w:val="FF0000"/>
    const colorMatch = rPr.match(/<w:color\s+w:val="([A-Fa-f0-9]{6})"/)
    if (colorMatch) {
      inlineStyles.push(`color:#${colorMatch[1]}`)
    }

    // Highlight/shading: <w:highlight w:val="yellow"/> or <w:shd w:fill="FFFF00"/>
    const highlightMatch = rPr.match(/<w:highlight\s+w:val="([^"]+)"/)
    if (highlightMatch) {
      inlineStyles.push(`background-color:${highlightMatch[1]}`)
    }
    const shdMatch = rPr.match(/<w:shd\s[^>]*w:fill="([A-Fa-f0-9]{6})"/)
    if (shdMatch && shdMatch[1] !== 'auto' && shdMatch[1] !== 'FFFFFF') {
      inlineStyles.push(`background-color:#${shdMatch[1]}`)
    }

    // Font family: <w:rFonts w:ascii="Arial"/>
    const fontMatch = rPr.match(/<w:rFonts\s[^>]*w:ascii="([^"]+)"/)
    if (fontMatch) {
      inlineStyles.push(`font-family:'${fontMatch[1]}',sans-serif`)
    }

    if (inlineStyles.length > 0) {
      html = `<span style="${inlineStyles.join(';')}">${html}</span>`
    }
  }

  return html
}

function paragraphToHtml(pXml: string, ctx: ParseContext): string {
  // Extract paragraph properties
  const pPrMatch = pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)
  const pPr = pPrMatch ? pPrMatch[1] : ''

  // Alignment
  const alignMatch = pPr.match(ALIGNMENT_ELEMENT)
  const align = alignMatch ? alignMatch[1] : null

  // Collect paragraph-level styles
  const pStyles: string[] = []
  if (align === 'center') pStyles.push('text-align:center')
  else if (align === 'right') pStyles.push('text-align:right')
  else if (align === 'both') pStyles.push('text-align:justify')

  // Indentation: <w:ind w:left="720"/> (in twips, 1440 twips = 1 inch)
  const indMatch = pPr.match(/<w:ind\s[^>]*w:left="(\d+)"/)
  if (indMatch) {
    const pt = Math.round(parseInt(indMatch[1], 10) / 20)
    if (pt > 0) pStyles.push(`padding-left:${pt}pt`)
  }

  // Spacing before/after — skip when autospacing is enabled
  const hasAutoSpBefore = /w:beforeAutospacing="1"/.test(pPr)
  const hasAutoSpAfter = /w:afterAutospacing="1"/.test(pPr)
  const spacingBefore = pPr.match(/<w:spacing\s[^>]*w:before="(\d+)"/)
  const spacingAfter = pPr.match(/<w:spacing\s[^>]*w:after="(\d+)"/)
  if (spacingBefore && !hasAutoSpBefore) {
    const pt = Math.round(parseInt(spacingBefore[1], 10) / 20)
    if (pt > 0) pStyles.push(`margin-top:${pt}pt`)
  }
  if (spacingAfter && !hasAutoSpAfter) {
    const pt = Math.round(parseInt(spacingAfter[1], 10) / 20)
    if (pt > 0) pStyles.push(`margin-bottom:${pt}pt`)
  }

  // Paragraph shading: <w:shd w:fill="E2EFD9"/>
  const pShdMatch = pPr.match(/<w:shd\s[^>]*w:fill="([A-Fa-f0-9]{6})"/)
  if (pShdMatch && pShdMatch[1] !== 'FFFFFF') {
    pStyles.push(`background-color:#${pShdMatch[1]}`)
    pStyles.push('padding:4pt 6pt')
  }

  const styleAttr = pStyles.length > 0 ? ` style="${pStyles.join(';')}"` : ''

  // Build runs in order
  let inner = ''
  RUN_ELEMENT.lastIndex = 0
  let rm: RegExpExecArray | null
  while ((rm = RUN_ELEMENT.exec(pXml)) !== null) {
    inner += runToHtml(rm[0], ctx)
  }

  if (!inner.trim()) {
    return `<p${styleAttr}>&nbsp;</p>`
  }

  return `<p${styleAttr}>${inner}</p>`
}

function wordXmlToHtml(xml: string, ctx: ParseContext): string {
  const paragraphs: string[] = []
  PARAGRAPH_ELEMENT.lastIndex = 0
  let pm: RegExpExecArray | null
  while ((pm = PARAGRAPH_ELEMENT.exec(xml)) !== null) {
    paragraphs.push(pm[0])
  }
  if (paragraphs.length === 0) return ''
  return paragraphs.map((p) => paragraphToHtml(p, ctx)).join('\n')
}

// ---------------------------------------------------------------------------
// Load images referenced by a header/footer rels file as base64 data URLs
// ---------------------------------------------------------------------------

async function loadImagesFromRels(
  zip: JSZip,
  relsPath: string,
  partDir: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const relsFile = zip.file(relsPath)
  if (!relsFile) return result

  const relsXml = await relsFile.async('string')

  // <Relationship Id="rId6" Type="..." Target="media/image1.png"/>
  // Note: attribute values contain slashes (e.g. Target="media/image1.png"),
  // so we can't use a simple `[^/>]+` character class. Instead, match any
  // chars up to the closing `/>` non-greedily.
  const relationshipRegex = /<Relationship\s+([\s\S]*?)\/>/g
  let match: RegExpExecArray | null
  while ((match = relationshipRegex.exec(relsXml)) !== null) {
    const attrs = match[1]
    const idMatch = attrs.match(/Id="([^"]+)"/)
    const typeMatch = attrs.match(/Type="([^"]+)"/)
    const targetMatch = attrs.match(/Target="([^"]+)"/)
    if (!idMatch || !targetMatch) continue
    // Only image relationships
    if (typeMatch && !/\/image$/.test(typeMatch[1])) continue

    const rId = idMatch[1]
    // Target is relative to the part's directory (usually "word/")
    // Strip leading "./" and resolve relative to partDir.
    const rawTarget = targetMatch[1].replace(/^\.\//, '')
    const mediaPath = rawTarget.startsWith('/')
      ? rawTarget.slice(1)
      : `${partDir}/${rawTarget}`.replace(/\/+/g, '/')

    const imageFile = zip.file(mediaPath)
    if (!imageFile) continue

    const base64 = await imageFile.async('base64')
    const ext = mediaPath.split('.').pop() || 'png'
    const mime = extToMime(ext)
    result.set(rId, `data:${mime};base64,${base64}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

function extractPlaceholders(html: string): string[] {
  const regex = /\{\{\s*([\w.]+)\s*\}\}/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    found.add(m[1])
  }
  return Array.from(found).sort()
}

interface ConvertedPart {
  html: string | null
  pageBackgroundUrl: string | null
}

async function convertPart(
  zip: JSZip,
  partPath: string
): Promise<ConvertedPart> {
  const file = zip.file(partPath)
  if (!file) return { html: null, pageBackgroundUrl: null }
  const xml = await file.async('string')
  if (!xml) return { html: null, pageBackgroundUrl: null }

  // Load images from the part's rels file (e.g. word/_rels/header1.xml.rels)
  const relsPath = partPath.replace(/^(.*\/)([^/]+)$/, '$1_rels/$2.rels')
  const partDir = partPath.substring(0, partPath.lastIndexOf('/'))
  const imageMap = await loadImagesFromRels(zip, relsPath, partDir)

  console.log('[docx-parser] convertPart', partPath, '- xml length:', xml.length, 'images:', imageMap.size)
  // Log first 500 chars of XML to diagnose structure
  console.log('[docx-parser] XML preview:', xml.substring(0, 500))

  const ctx: ParseContext = { imageMap, pageBackgroundUrl: null }
  const html = wordXmlToHtml(xml, ctx)
  console.log('[docx-parser] convertPart result - html:', html ? html.substring(0, 200) : '(empty)')
  return {
    html: html.trim() ? html : null,
    pageBackgroundUrl: ctx.pageBackgroundUrl,
  }
}

// Unique sentinel text injected into the .docx XML before mammoth processes
// it, so we can locate paragraphs that originally contained an explicit
// `<w:br w:type="page"/>` break in the rendered HTML. The sentinel is chosen
// to be exceedingly unlikely to occur in a real Word document.
const PAGE_BREAK_SENTINEL = '\u2042HFPB\u2042' // ⁂HFPB⁂

/**
 * Mammoth's `transformDocument` + styleMap approach reliably loses page
 * breaks inside empty paragraphs (the paragraph gets dropped before the
 * transform runs). Instead, we mutate the raw document.xml inside the .docx
 * zip: for every paragraph that contains `<w:br w:type="page"/>` we insert
 * a fresh sentinel paragraph immediately AFTER it. Mammoth then converts
 * that sentinel into a regular `<p>…</p>` in the output HTML which we can
 * find and rewrite to `<p class="hireflow-page-break"></p>`. This survives
 * empty-paragraph collapsing and handles multiple breaks correctly.
 */
async function injectPageBreakSentinels(buffer: Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const docFile = zip.file('word/document.xml')
    if (!docFile) return buffer
    const xml = await docFile.async('string')

    const sentinelParagraph = `<w:p><w:r><w:t xml:space="preserve">${PAGE_BREAK_SENTINEL}</w:t></w:r></w:p>`

    // Match any <w:p ...>...</w:p> that contains <w:br w:type="page"/> and
    // append a sentinel paragraph right after it. Non-greedy up to </w:p>.
    const modified = xml.replace(
      /<w:p(?:\s[^>]*)?>(?:(?!<\/w:p>)[\s\S])*?<w:br\s+w:type="page"\s*\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
      (match) => match + sentinelParagraph
    )

    if (modified === xml) return buffer

    zip.file('word/document.xml', modified)
    const out = await zip.generateAsync({ type: 'nodebuffer' })
    return out as Buffer
  } catch (err) {
    console.error('[docx-parser] page-break sentinel injection failed:', err)
    return buffer
  }
}

/**
 * Extract per-paragraph formatting from raw document.xml. Returns an ordered
 * array of style strings (one per <w:p> in the body). Mammoth produces one
 * <p> per body paragraph in the same order, so we can zip them together.
 */
function extractParagraphStyles(bodyXml: string): string[] {
  const styles: string[] = []
  PARAGRAPH_ELEMENT.lastIndex = 0
  let pm: RegExpExecArray | null
  while ((pm = PARAGRAPH_ELEMENT.exec(bodyXml)) !== null) {
    const pXml = pm[0]
    const pPrMatch = pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)
    const pPr = pPrMatch ? pPrMatch[1] : ''
    const parts: string[] = []

    // Alignment
    const alignMatch = pPr.match(ALIGNMENT_ELEMENT)
    if (alignMatch) {
      const a = alignMatch[1]
      if (a === 'center') parts.push('text-align:center')
      else if (a === 'right') parts.push('text-align:right')
      else if (a === 'both') parts.push('text-align:justify')
    }

    // Indentation
    const indMatch = pPr.match(/<w:ind\s[^>]*w:left="(\d+)"/)
    if (indMatch) {
      const pt = Math.round(parseInt(indMatch[1], 10) / 20)
      if (pt > 0) parts.push(`padding-left:${pt}pt`)
    }

    // Paragraph spacing — when beforeAutospacing/afterAutospacing is "1",
    // Word uses minimal automatic spacing (roughly 0-2pt), not the numeric
    // value in w:before/w:after. We skip those values in that case.
    const hasAutoSpacingBefore = /w:beforeAutospacing="1"/.test(pPr)
    const hasAutoSpacingAfter = /w:afterAutospacing="1"/.test(pPr)
    const spacingBefore = pPr.match(/<w:spacing\s[^>]*w:before="(\d+)"/)
    const spacingAfter = pPr.match(/<w:spacing\s[^>]*w:after="(\d+)"/)
    if (spacingBefore && !hasAutoSpacingBefore) {
      const pt = Math.round(parseInt(spacingBefore[1], 10) / 20)
      if (pt > 0) parts.push(`margin-top:${pt}pt`)
    }
    if (spacingAfter && !hasAutoSpacingAfter) {
      const pt = Math.round(parseInt(spacingAfter[1], 10) / 20)
      if (pt > 0) parts.push(`margin-bottom:${pt}pt`)
    }

    // Line spacing
    const lineSpacing = pPr.match(/<w:spacing\s[^>]*w:line="(\d+)"/)
    if (lineSpacing) {
      const twips = parseInt(lineSpacing[1], 10)
      // 240 twips = single spacing (1.0), 360 = 1.5, 480 = double
      if (twips && twips !== 240) {
        const ratio = (twips / 240).toFixed(2)
        parts.push(`line-height:${ratio}`)
      }
    }

    // Paragraph shading
    const pShdMatch = pPr.match(/<w:shd\s[^>]*w:fill="([A-Fa-f0-9]{6})"/)
    if (pShdMatch && pShdMatch[1] !== 'FFFFFF') {
      parts.push(`background-color:#${pShdMatch[1]}`)
      parts.push('padding:4pt 6pt')
    }

    // Font size from paragraph-level rPr (applies to all runs in the paragraph)
    const pRprMatch = pPr.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)
    if (pRprMatch) {
      const rPr = pRprMatch[1]
      const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/)
      if (szMatch) {
        const pt = parseInt(szMatch[1], 10) / 2
        parts.push(`font-size:${pt}pt`)
      }
      const colorMatch = rPr.match(/<w:color\s+w:val="([A-Fa-f0-9]{6})"/)
      if (colorMatch && colorMatch[1] !== '000000') {
        parts.push(`color:#${colorMatch[1]}`)
      }
    }

    styles.push(parts.join(';'))
  }
  return styles
}

/**
 * Extract per-run underline info from raw document.xml. Returns a Set of
 * text snippets that should have underline applied. Mammoth drops underline
 * by default, so we need to re-inject it.
 */
function extractUnderlinedTexts(bodyXml: string): Set<string> {
  const result = new Set<string>()
  RUN_ELEMENT.lastIndex = 0
  let rm: RegExpExecArray | null
  while ((rm = RUN_ELEMENT.exec(bodyXml)) !== null) {
    const runXml = rm[0]
    const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)
    if (!rPrMatch) continue
    const rPr = rPrMatch[1]
    if (!/<w:u\s/.test(rPr)) continue
    // Extract text from this run
    TEXT_ELEMENT.lastIndex = 0
    let text = ''
    let tm: RegExpExecArray | null
    while ((tm = TEXT_ELEMENT.exec(runXml)) !== null) {
      text += decodeXmlEntities(tm[1])
    }
    if (text.trim()) result.add(text.trim())
  }
  return result
}

/**
 * Post-process mammoth HTML output to re-inject formatting that mammoth
 * strips: paragraph alignment, font sizes, underlines, etc.
 */
function injectBodyFormatting(html: string, bodyXml: string): string {
  const pStyles = extractParagraphStyles(bodyXml)
  const underlinedTexts = extractUnderlinedTexts(bodyXml)

  // Inject paragraph styles — mammoth produces <p>, <h1>-<h6>, <li> elements.
  // We match <p> tags and inject styles in order. List items (<li><p>) and
  // headings count as paragraphs too.
  let styleIdx = 0
  html = html.replace(/<(p|h[1-6])(\s[^>]*)?>/g, (match, tag, attrs) => {
    const style = pStyles[styleIdx] || ''
    styleIdx++
    if (!style) return match
    // Merge with existing style attribute if present
    if (attrs && /style="/.test(attrs)) {
      return `<${tag}${attrs.replace(/style="/, `style="${style};`)}`
    }
    return `<${tag}${attrs || ''} style="${style}">`
  })

  // Re-inject underlines for text that mammoth wrapped in <strong> but
  // dropped the underline. We look for exact text matches inside <strong>
  // tags and add <u> wrapping.
  underlinedTexts.forEach((text) => {
    // Escape regex special characters in the text
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match the text inside strong tags or standalone
    const strongPattern = new RegExp(
      `(<strong>)(${escaped})(</strong>)`,
      'g'
    )
    html = html.replace(strongPattern, '$1<u>$2</u>$3')
    // Also match standalone (not in strong)
    const standalonePattern = new RegExp(
      `(?<!<strong>|<u>|<em>)(${escaped})(?!</strong>|</u>|</em>)`,
      'g'
    )
    // Only wrap if not already wrapped
    if (!html.includes(`<u>${text}</u>`)) {
      html = html.replace(standalonePattern, `<u>$1</u>`)
    }
  })

  return html
}

/**
 * Extract page margins from the document's section properties (<w:sectPr>).
 * Margins in Word XML are in twips (1440 twips = 1 inch = 25.4mm).
 */
function extractPageMargins(xml: string): DocxPageMargins | null {
  const sectPr = xml.match(/<w:sectPr[^>]*>([\s\S]*?)<\/w:sectPr>/)
  if (!sectPr) return null
  const pgMar = sectPr[1].match(/<w:pgMar[^>]*\/>/)
  if (!pgMar) return null
  const attrs = pgMar[0]
  const twipsToMm = (val: string | undefined) => {
    if (!val) return 0
    return Math.round((Math.abs(parseInt(val, 10)) / 1440) * 25.4 * 10) / 10
  }
  return {
    top: twipsToMm(attrs.match(/w:top="(-?\d+)"/)?.[1]),
    bottom: twipsToMm(attrs.match(/w:bottom="(-?\d+)"/)?.[1]),
    left: twipsToMm(attrs.match(/w:left="(\d+)"/)?.[1]),
    right: twipsToMm(attrs.match(/w:right="(\d+)"/)?.[1]),
    header: twipsToMm(attrs.match(/w:header="(\d+)"/)?.[1]),
    footer: twipsToMm(attrs.match(/w:footer="(\d+)"/)?.[1]),
  }
}

export async function parseDocx(buffer: Buffer): Promise<ParsedDocx> {
  // 1) Inject sentinel paragraphs after every explicit page break so we can
  //    tag them in the final HTML output (see injectPageBreakSentinels).
  const preparedBuffer = await injectPageBreakSentinels(buffer)

  // 1b) Extract raw body XML for post-processing (formatting injection)
  //     and page margins from sectPr.
  let rawBodyXml = ''
  let pageMargins: DocxPageMargins | null = null
  try {
    const zipForBody = await JSZip.loadAsync(preparedBuffer)
    const docFile = zipForBody.file('word/document.xml')
    if (docFile) {
      const fullXml = await docFile.async('string')
      // Extract the <w:body>...</w:body> portion
      const bodyMatch = fullXml.match(/<w:body>([\s\S]*)<\/w:body>/)
      if (bodyMatch) rawBodyXml = bodyMatch[1]
      // Extract page margins from section properties
      pageMargins = extractPageMargins(fullXml)
    }
  } catch {
    // Non-fatal
  }

  // 2) Body HTML via mammoth (handles images, lists, tables automatically)
  const bodyResult = await mammoth.convertToHtml(
    { buffer: preparedBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='TOC Heading'] => h3:fresh",
      ],
      convertImage: mammoth.images.imgElement(function (image) {
        return image.read('base64').then(function (imageBuffer) {
          return {
            src: `data:${image.contentType};base64,${imageBuffer}`,
          }
        })
      }),
    }
  )
  let bodyHtml = bodyResult.value || ''

  // 3) Rewrite sentinel paragraphs into explicit page-break markers.
  bodyHtml = bodyHtml.replace(
    new RegExp(
      `<p[^>]*>\\s*(?:<[^>]+>\\s*)*${PAGE_BREAK_SENTINEL}(?:\\s*<\\/[^>]+>)*\\s*<\\/p>`,
      'g'
    ),
    '<p class="hireflow-page-break"></p>'
  )
  bodyHtml = bodyHtml.split(PAGE_BREAK_SENTINEL).join('')

  // 4) Post-process: inject paragraph alignment, font sizes, underlines,
  //    and other formatting that mammoth strips by default.
  if (rawBodyXml) {
    bodyHtml = injectBodyFormatting(bodyHtml, rawBodyXml)
  }

  let headerHtml: string | null = null
  let footerHtml: string | null = null
  let pageBackgroundUrl: string | null = null

  try {
    const zip = await JSZip.loadAsync(buffer)

    // Collect all header and footer parts, prefer the "default" one
    // (lowest number is usually the default page header/footer).
    const allFiles = Object.keys(zip.files)
    console.log('[docx-parser] All files in .docx:', allFiles.filter(f => /header|footer/i.test(f)))

    const headerFiles = allFiles
      .filter((n) => /^word\/header\d*\.xml$/i.test(n))
      .sort()
    const footerFiles = allFiles
      .filter((n) => /^word\/footer\d*\.xml$/i.test(n))
      .sort()
    console.log('[docx-parser] Matched headerFiles:', headerFiles, 'footerFiles:', footerFiles)

    // Try each header file until we get non-empty HTML OR a page background —
    // some templates have multiple headers (first-page, even, odd) and the
    // first one may be blank.
    for (const headerFile of headerFiles) {
      console.log('[docx-parser] Processing header:', headerFile)
      const result = await convertPart(zip, headerFile)
      console.log('[docx-parser] Header result - html length:', result.html?.length || 0, 'pageBg:', !!result.pageBackgroundUrl)
      if (result.pageBackgroundUrl && !pageBackgroundUrl) {
        pageBackgroundUrl = result.pageBackgroundUrl
      }
      if (result.html && !headerHtml) {
        headerHtml = result.html
      }
      if (headerHtml && pageBackgroundUrl) break
    }

    for (const footerFile of footerFiles) {
      console.log('[docx-parser] Processing footer:', footerFile)
      const result = await convertPart(zip, footerFile)
      console.log('[docx-parser] Footer result - html length:', result.html?.length || 0, 'pageBg:', !!result.pageBackgroundUrl)
      if (result.pageBackgroundUrl && !pageBackgroundUrl) {
        pageBackgroundUrl = result.pageBackgroundUrl
      }
      if (result.html && !footerHtml) {
        footerHtml = result.html
      }
      if (footerHtml && pageBackgroundUrl) break
    }
  } catch (err) {
    // Header/footer extraction is non-fatal; we still have the body HTML.
    console.error('[docx-parser] header/footer extraction failed:', err)
  }

  const placeholders = extractPlaceholders(
    [bodyHtml, headerHtml || '', footerHtml || ''].join('\n')
  )

  return {
    body_html: bodyHtml,
    header_html: headerHtml,
    footer_html: footerHtml,
    page_background_url: pageBackgroundUrl,
    page_margins: pageMargins,
    placeholders,
  }
}

// ---------------------------------------------------------------------------
// Client-safe helpers (used by preview rendering)
// ---------------------------------------------------------------------------

/**
 * Replace `{{BasicInfo.FirstName}}` style placeholders in HTML with values
 * from a nested data object. Placeholders whose path isn't found are left as
 * a highlighted span so the user can see which ones are unresolved.
 */
export function substitutePlaceholders(
  html: string,
  data: Record<string, unknown>
): string {
  // Allow dot-paths ({{BasicInfo.FirstName}}) AND space-separated paths
  // ({{Signature OrgSignature1}}) — some Word templates use spaces between
  // group and field names.
  return html.replace(/\{\{\s*([\w.][\w. ]*?)\s*\}\}/g, (match, path: string) => {
    const parts = path.trim().split(/[.\s]+/)
    let value: unknown = data
    for (const p of parts) {
      if (value && typeof value === 'object' && p in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[p]
      } else {
        value = undefined
        break
      }
    }
    if (value === undefined || value === null || value === '') {
      return `<span style="background:#fef3c7;color:#92400e;padding:0 3px;border-radius:2px;font-family:monospace;font-size:0.85em;">${match}</span>`
    }
    return String(value)
  })
}
