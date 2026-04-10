import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOfferTemplate } from '@/lib/services/offer-templates'
import { parseDocx } from '@/lib/docx-parser'

const DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: authError?.message || 'Session expired. Please refresh and try again.' },
      { status: 401 }
    )
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

  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'docx' || !DOCX_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: 'Only .docx files are supported' },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Parse .docx → body HTML + header HTML + footer HTML + detected placeholders
  let parsed: Awaited<ReturnType<typeof parseDocx>>
  try {
    parsed = await parseDocx(buffer)
  } catch (err) {
    console.error('[upload-docx] docx parse failed:', err)
    return NextResponse.json(
      { error: 'Failed to parse the Word document. Make sure it is a valid .docx file.' },
      { status: 400 }
    )
  }

  if (!parsed.body_html || !parsed.body_html.trim()) {
    return NextResponse.json(
      { error: 'The document appears to be empty.' },
      { status: 400 }
    )
  }

  // Upload original .docx to private storage bucket for reference/re-download
  const storagePath = `${membership.organization_id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from('offer-templates')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    // Non-fatal — we still have the parsed HTML. Log and continue without a storage path.
    console.error('[upload-docx] storage upload failed:', uploadError)
  }

  const { data, error } = await createOfferTemplate(
    supabase,
    membership.organization_id,
    {
      name,
      template_source: 'word',
      docx_content_html: parsed.body_html,
      docx_header_html: parsed.header_html,
      docx_footer_html: parsed.footer_html,
      docx_page_background_url: parsed.page_background_url,
      docx_page_margins: parsed.page_margins,
      docx_storage_path: uploadError ? null : storagePath,
    },
    user.id
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...data, detected_placeholders: parsed.placeholders } })
}
