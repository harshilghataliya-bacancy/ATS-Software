import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireIntegrationKey } from '@/app/api/integrations/ats/_auth'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  organization_id: z.string().uuid().optional(),
  q: z.string().min(1).max(200).optional(),
  from: z.string().min(1).max(32).optional(),
  to: z.string().min(1).max(32).optional(),
})

export async function GET(request: Request) {
  const auth = await requireIntegrationKey(request)
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }

  const supabase = getAdminClient()
  const offset = (parsed.data.page - 1) * parsed.data.limit

  let query = supabase
    .from('candidates')
    .select('id, email, first_name, last_name, phone, resume_url, created_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + parsed.data.limit - 1)

  if (parsed.data.organization_id) {
    query = query.eq('organization_id', parsed.data.organization_id)
  }

  if (parsed.data.q) {
    const q = parsed.data.q.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
    query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
  }

  if (parsed.data.from) {
    const d = new Date(parsed.data.from)
    if (!Number.isNaN(d.getTime())) query = query.gte('created_at', d.toISOString())
  }
  if (parsed.data.to) {
    const d = new Date(parsed.data.to)
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1)
      query = query.lt('created_at', d.toISOString())
    }
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? []).map((c) => ({
    external_candidate_id: c.id,
    email: c.email,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || undefined,
    phone: c.phone ?? undefined,
    created_at: c.created_at ?? undefined,
    resume: c.resume_url
      ? {
          external_resume_id: c.id,
          file_name: `${(c.first_name ?? 'Candidate').toString()}_${(c.last_name ?? 'Resume').toString()}.pdf`,
        }
      : undefined,
  }))

  const total = count ?? items.length
  const hasNext = offset + items.length < total

  return NextResponse.json({
    items,
    next_page: hasNext ? parsed.data.page + 1 : null,
  })
}
