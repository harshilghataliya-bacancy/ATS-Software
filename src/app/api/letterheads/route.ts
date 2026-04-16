import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLetterheads, createLetterhead } from '@/lib/services/letterheads'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data, error } = await getLetterheads(supabase, member.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const formData = await request.formData()
  const name = formData.get('name') as string | null
  const page1File = formData.get('page1') as File | null
  const continuationFile = formData.get('continuation') as File | null
  const marginTop = parseFloat(formData.get('margin_top') as string) || 35
  const marginBottom = parseFloat(formData.get('margin_bottom') as string) || 25
  const marginLeft = parseFloat(formData.get('margin_left') as string) || 20
  const marginRight = parseFloat(formData.get('margin_right') as string) || 20

  if (!page1File || !name) {
    return NextResponse.json({ error: 'Name and page 1 image are required' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(page1File.type)) {
    return NextResponse.json({ error: 'Only PNG and JPEG images are supported' }, { status: 400 })
  }

  if (continuationFile && !ALLOWED_TYPES.includes(continuationFile.type)) {
    return NextResponse.json({ error: 'Continuation image must be PNG or JPEG' }, { status: 400 })
  }

  const orgId = member.organization_id
  const ts = Date.now()
  const ext = page1File.name.split('.').pop()?.toLowerCase() || 'png'

  // Upload page 1 image
  const page1Path = `${orgId}/${ts}_page1.${ext}`
  const page1Buf = new Uint8Array(await page1File.arrayBuffer())
  const { error: up1Err } = await supabase.storage
    .from('letterheads')
    .upload(page1Path, page1Buf, { contentType: page1File.type, upsert: false })
  if (up1Err) return NextResponse.json({ error: `Upload failed: ${up1Err.message}` }, { status: 500 })

  // Get signed URL for page 1
  const { data: sig1 } = await supabase.storage
    .from('letterheads')
    .createSignedUrl(page1Path, 60 * 60 * 24 * 365)
  const page1Url = sig1?.signedUrl || ''

  // Upload continuation image (optional)
  let contPath: string | undefined
  let contUrl: string | undefined
  if (continuationFile) {
    const contExt = continuationFile.name.split('.').pop()?.toLowerCase() || 'png'
    contPath = `${orgId}/${ts}_continuation.${contExt}`
    const contBuf = new Uint8Array(await continuationFile.arrayBuffer())
    const { error: up2Err } = await supabase.storage
      .from('letterheads')
      .upload(contPath, contBuf, { contentType: continuationFile.type, upsert: false })
    if (up2Err) return NextResponse.json({ error: `Continuation upload failed: ${up2Err.message}` }, { status: 500 })

    const { data: sig2 } = await supabase.storage
      .from('letterheads')
      .createSignedUrl(contPath, 60 * 60 * 24 * 365)
    contUrl = sig2?.signedUrl || undefined
  }

  const { data, error } = await createLetterhead(
    supabase,
    orgId,
    {
      name,
      file_type: ext === 'jpg' ? 'jpeg' : ext,
      page1_storage_path: page1Path,
      page1_url: page1Url,
      continuation_storage_path: contPath,
      continuation_url: contUrl,
      margin_top: marginTop,
      margin_bottom: marginBottom,
      margin_left: marginLeft,
      margin_right: marginRight,
    },
    user.id
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
