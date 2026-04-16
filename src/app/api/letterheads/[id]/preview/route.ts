import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLetterheadById } from '@/lib/services/letterheads'

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

  const { data: lh, error } = await getLetterheadById(supabase, id, member.organization_id)
  if (error || !lh) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Generate fresh signed URLs
  let page1Url = lh.page1_url
  let continuationUrl = lh.continuation_url
  if (lh.page1_storage_path) {
    const { data: sig } = await supabase.storage
      .from('letterheads')
      .createSignedUrl(lh.page1_storage_path, 60 * 60)
    if (sig?.signedUrl) page1Url = sig.signedUrl
  }
  if (lh.continuation_storage_path) {
    const { data: sig } = await supabase.storage
      .from('letterheads')
      .createSignedUrl(lh.continuation_storage_path, 60 * 60)
    if (sig?.signedUrl) continuationUrl = sig.signedUrl
  }

  return NextResponse.json({
    page1_url: page1Url,
    continuation_url: continuationUrl,
    margins: {
      top: lh.margin_top,
      bottom: lh.margin_bottom,
      left: lh.margin_left,
      right: lh.margin_right,
    },
    name: lh.name,
  })
}
