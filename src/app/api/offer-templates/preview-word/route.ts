import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPreviewHtml, PageMargins } from '@/lib/docx-preview-html'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name : 'Preview'
  const docxBody = typeof body.docx_content_html === 'string' ? body.docx_content_html : ''
  const header = typeof body.docx_header_html === 'string' ? body.docx_header_html : null
  const footer = typeof body.docx_footer_html === 'string' ? body.docx_footer_html : null
  const pageBackgroundUrl =
    typeof body.docx_page_background_url === 'string' ? body.docx_page_background_url : null
  const pageMargins = body.docx_page_margins && typeof body.docx_page_margins === 'object'
    ? body.docx_page_margins as PageMargins
    : null
  const embedded = body.embedded === true

  const html = buildPreviewHtml({
    name,
    header,
    body: docxBody,
    footer,
    pageBackgroundUrl,
    pageMargins,
    embedded,
  })

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
