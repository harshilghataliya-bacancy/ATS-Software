import { SupabaseClient } from '@supabase/supabase-js'

export interface LetterheadMargins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface LetterheadRow {
  id: string
  organization_id: string
  name: string
  file_type: string
  storage_path: string
  file_url: string | null
  preview_url: string | null
  parsed_data: unknown
  page1_storage_path: string | null
  page1_url: string | null
  continuation_storage_path: string | null
  continuation_url: string | null
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getLetterheads(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from('letterheads')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return { data: data as LetterheadRow[] | null, error }
}

export async function getLetterheadById(supabase: SupabaseClient, id: string, orgId: string) {
  const { data, error } = await supabase
    .from('letterheads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()
  return { data: data as LetterheadRow | null, error }
}

export async function createLetterhead(
  supabase: SupabaseClient,
  orgId: string,
  payload: {
    name: string
    file_type: string
    page1_storage_path: string
    page1_url: string
    continuation_storage_path?: string
    continuation_url?: string
    margin_top?: number
    margin_bottom?: number
    margin_left?: number
    margin_right?: number
  },
  userId: string
) {
  const { data, error } = await supabase
    .from('letterheads')
    .insert({
      organization_id: orgId,
      name: payload.name,
      file_type: payload.file_type,
      storage_path: payload.page1_storage_path, // backward compat
      page1_storage_path: payload.page1_storage_path,
      page1_url: payload.page1_url,
      continuation_storage_path: payload.continuation_storage_path || null,
      continuation_url: payload.continuation_url || null,
      margin_top: payload.margin_top ?? 35,
      margin_bottom: payload.margin_bottom ?? 25,
      margin_left: payload.margin_left ?? 20,
      margin_right: payload.margin_right ?? 20,
      created_by: userId,
    })
    .select()
    .single()
  return { data: data as LetterheadRow | null, error }
}

export async function updateLetterhead(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
) {
  const { data, error } = await supabase
    .from('letterheads')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()
  return { data: data as LetterheadRow | null, error }
}

export async function deleteLetterhead(supabase: SupabaseClient, id: string, orgId: string) {
  const { error } = await supabase
    .from('letterheads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  return { error }
}
