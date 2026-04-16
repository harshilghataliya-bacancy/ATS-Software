import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateLetterhead, deleteLetterhead, getLetterheadById } from '@/lib/services/letterheads'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null, member: null }

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'admin') return { error: 'Admin only', status: 403, user: null, member: null }
  return { error: null, status: 200, user, member }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data, error } = await getLetterheadById(supabase, id, member.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Refresh signed URLs if images exist
  if (data.page1_storage_path) {
    const { data: sig } = await supabase.storage
      .from('letterheads')
      .createSignedUrl(data.page1_storage_path, 60 * 60)
    if (sig?.signedUrl) data.page1_url = sig.signedUrl
  }
  if (data.continuation_storage_path) {
    const { data: sig } = await supabase.storage
      .from('letterheads')
      .createSignedUrl(data.continuation_storage_path, 60 * 60)
    if (sig?.signedUrl) data.continuation_url = sig.signedUrl
  }

  return NextResponse.json(data)
}

async function uploadImage(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, file: File, orgId: string, suffix: string) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${orgId}/${Date.now()}_${suffix}.${ext}`
  const buf = new Uint8Array(await file.arrayBuffer())
  const { error } = await supabase.storage
    .from('letterheads')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (error) return { path: null, url: null, error }

  const { data: sig } = await supabase.storage
    .from('letterheads')
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  return { path, url: sig?.signedUrl || '', error: null }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await requireAdmin(supabase)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const orgId = ctx.member!.organization_id
  const formData = await request.formData()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}

  const name = formData.get('name') as string | null
  if (name) updates.name = name

  // Margins
  const mt = formData.get('margin_top')
  const mb = formData.get('margin_bottom')
  const ml = formData.get('margin_left')
  const mr = formData.get('margin_right')
  if (mt !== null) updates.margin_top = parseFloat(mt as string)
  if (mb !== null) updates.margin_bottom = parseFloat(mb as string)
  if (ml !== null) updates.margin_left = parseFloat(ml as string)
  if (mr !== null) updates.margin_right = parseFloat(mr as string)

  // Page 1 image replacement
  const page1File = formData.get('page1') as File | null
  if (page1File) {
    if (!ALLOWED_TYPES.includes(page1File.type)) {
      return NextResponse.json({ error: 'Only PNG/JPEG' }, { status: 400 })
    }
    // Remove old
    const { data: existing } = await getLetterheadById(supabase, id, orgId)
    if (existing?.page1_storage_path) {
      await supabase.storage.from('letterheads').remove([existing.page1_storage_path])
    }
    const res = await uploadImage(supabase, page1File, orgId, 'page1')
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    updates.page1_storage_path = res.path
    updates.page1_url = res.url
    updates.storage_path = res.path // backward compat
    updates.file_type = page1File.name.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpeg' : page1File.name.split('.').pop()?.toLowerCase()
  }

  // Continuation image replacement
  const contFile = formData.get('continuation') as File | null
  if (contFile) {
    if (!ALLOWED_TYPES.includes(contFile.type)) {
      return NextResponse.json({ error: 'Only PNG/JPEG' }, { status: 400 })
    }
    const { data: existing } = await getLetterheadById(supabase, id, orgId)
    if (existing?.continuation_storage_path) {
      await supabase.storage.from('letterheads').remove([existing.continuation_storage_path])
    }
    const res = await uploadImage(supabase, contFile, orgId, 'continuation')
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    updates.continuation_storage_path = res.path
    updates.continuation_url = res.url
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await updateLetterhead(supabase, id, orgId, updates)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await requireAdmin(supabase)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { data: existing } = await getLetterheadById(supabase, id, ctx.member!.organization_id)
  if (existing) {
    const paths = [existing.page1_storage_path, existing.continuation_storage_path, existing.storage_path].filter(Boolean) as string[]
    if (paths.length > 0) await supabase.storage.from('letterheads').remove(paths)
  }

  const { error } = await deleteLetterhead(supabase, id, ctx.member!.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
