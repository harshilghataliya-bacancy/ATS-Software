import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const templateId = request.nextUrl.searchParams.get('templateId')
  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  const { data: template } = await supabase
    .from('offer_templates')
    .select('docx_preview_pdf_path')
    .eq('id', templateId)
    .eq('organization_id', membership.organization_id)
    .is('deleted_at', null)
    .single()

  if (!template?.docx_preview_pdf_path) {
    return NextResponse.json({ error: 'No PDF preview available' }, { status: 404 })
  }

  // Download the PDF from private storage and proxy it to the client
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('offer-templates')
    .download(template.docx_preview_pdf_path)

  if (error || !data) {
    console.error('[preview-pdf] storage download failed:', error)
    return NextResponse.json({ error: 'Failed to load PDF' }, { status: 500 })
  }

  const arrayBuffer = await data.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
