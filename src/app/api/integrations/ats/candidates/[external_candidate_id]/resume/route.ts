import { noStoreJson, requireIntegrationKey } from '@/app/api/integrations/ats/_auth'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type RouteContext = {
  params: Promise<{ external_candidate_id: string }>
}

export async function GET(request: Request, ctx: RouteContext) {
  const auth = await requireIntegrationKey(request)
  if (auth instanceof Response) return auth

  const { external_candidate_id } = await ctx.params
  if (!external_candidate_id) return noStoreJson({ error: 'external_candidate_id is required' }, { status: 400 })

  const supabase = getAdminClient()
  const url = new URL(request.url)
  const orgId = url.searchParams.get('organization_id')

  let query = supabase.from('candidates').select('id, resume_url').eq('id', external_candidate_id)
  if (orgId) query = query.eq('organization_id', orgId)

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) return noStoreJson({ error: error.message }, { status: 500 })
  if (!data) return noStoreJson({ error: 'Not found' }, { status: 404 })
  if (!data.resume_url) return noStoreJson({ error: 'Candidate has no resume_url' }, { status: 404 })

  return noStoreJson({ download_url: data.resume_url, expires_in_seconds: null })
}
