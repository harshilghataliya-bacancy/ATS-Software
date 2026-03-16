import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BankFilters {
  search?: string
  source?: string
  location?: string
  tags?: string[]
  page?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Banks CRUD
// ---------------------------------------------------------------------------

export async function getBanks(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from('candidate_banks')
    .select('*, candidate_bank_members(count)')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  return { data, error }
}

export async function getBankById(supabase: SupabaseClient, bankId: string, orgId: string) {
  const { data, error } = await supabase
    .from('candidate_banks')
    .select('*')
    .eq('id', bankId)
    .eq('organization_id', orgId)
    .single()

  return { data, error }
}

export async function createBank(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  description: string | null,
  userId: string
) {
  const { data, error } = await supabase
    .from('candidate_banks')
    .insert({
      organization_id: orgId,
      name,
      description,
      is_default: false,
      created_by: userId,
    })
    .select()
    .single()

  return { data, error }
}

export async function updateBank(
  supabase: SupabaseClient,
  bankId: string,
  orgId: string,
  updates: { name?: string; description?: string | null }
) {
  const { data, error } = await supabase
    .from('candidate_banks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', bankId)
    .eq('organization_id', orgId)
    .eq('is_default', false)
    .select()
    .single()

  return { data, error }
}

export async function deleteBank(supabase: SupabaseClient, bankId: string, orgId: string) {
  // First remove all members (they go back to Default Bank)
  await supabase
    .from('candidate_bank_members')
    .delete()
    .eq('bank_id', bankId)
    .eq('organization_id', orgId)

  const { error } = await supabase
    .from('candidate_banks')
    .delete()
    .eq('id', bankId)
    .eq('organization_id', orgId)
    .eq('is_default', false)

  return { error }
}

export async function ensureDefaultBank(supabase: SupabaseClient, orgId: string) {
  // Check if default bank exists
  const { data: existing } = await supabase
    .from('candidate_banks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_default', true)
    .maybeSingle()

  if (existing) return { data: existing, error: null }

  // Create default bank
  const { data, error } = await supabase
    .from('candidate_banks')
    .insert({
      organization_id: orgId,
      name: 'Default Bank',
      description: 'Rejected candidates and candidates from closed/archived jobs',
      is_default: true,
    })
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Default Bank Candidates (non-rejected, NOT in any custom bank)
// ---------------------------------------------------------------------------

export async function getDefaultBankCandidates(
  supabase: SupabaseClient,
  orgId: string,
  filters: BankFilters = {}
) {
  const { search, source, location, tags, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Get candidate IDs already in custom banks
  const { data: bankedIds } = await supabase
    .from('candidate_bank_members')
    .select('candidate_id')
    .eq('organization_id', orgId)

  const excludeIds = bankedIds?.map((b) => b.candidate_id) ?? []

  // Build query for candidates who are NOT rejected in all applications
  // A candidate is in the default bank if:
  // 1. They have no applications at all, OR
  // 2. At least one of their applications is NOT rejected
  // AND they are not already in a custom bank

  let query = supabase
    .from('candidates')
    .select(
      `
      *,
      applications(id, status, job:jobs(id, title, department, status))
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  // Exclude candidates already in custom banks
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  }
  if (source) {
    query = query.eq('source', source)
  }
  if (location) {
    query = query.ilike('location', `%${location}%`)
  }
  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  const { data, error } = await query

  // Only show candidates who are rejected OR whose job is closed/archived
  // Exclude hired candidates and candidates with active applications on open jobs
  const filtered = data?.filter((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apps = (c as any).applications || []
    if (apps.length === 0) return false
    // Exclude if any application is hired
    const hasHired = apps.some((a: { status: string }) => a.status === 'hired')
    if (hasHired) return false
    // Exclude if any application is active on an open job
    const hasActiveOnOpenJob = apps.some((a: { status: string; job?: { status?: string } }) => {
      const jobStatus = a.job?.status
      const isJobOpen = jobStatus !== 'closed' && jobStatus !== 'archived'
      return a.status === 'active' && isJobOpen
    })
    return !hasActiveOnOpenJob
  }) ?? []

  return { data: filtered, error, count: filtered.length }
}

// ---------------------------------------------------------------------------
// Custom Bank Candidates
// ---------------------------------------------------------------------------

export async function getBankCandidates(
  supabase: SupabaseClient,
  bankId: string,
  orgId: string,
  filters: BankFilters = {}
) {
  const { search, source, location, tags, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Get candidate IDs in this bank
  const { data: memberIds } = await supabase
    .from('candidate_bank_members')
    .select('candidate_id')
    .eq('bank_id', bankId)
    .eq('organization_id', orgId)

  const candidateIds = memberIds?.map((m) => m.candidate_id) ?? []
  if (candidateIds.length === 0) {
    return { data: [], error: null, count: 0 }
  }

  let query = supabase
    .from('candidates')
    .select(
      `
      *,
      applications(id, status, job:jobs(id, title, department, status))
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .in('id', candidateIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  }
  if (source) {
    query = query.eq('source', source)
  }
  if (location) {
    query = query.ilike('location', `%${location}%`)
  }
  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  const { data, error, count } = await query

  return { data, error, count }
}

// ---------------------------------------------------------------------------
// Move Candidates Between Banks
// ---------------------------------------------------------------------------

export async function addCandidatesToBank(
  supabase: SupabaseClient,
  bankId: string,
  orgId: string,
  candidateIds: string[],
  userId: string
) {
  const rows = candidateIds.map((candidate_id) => ({
    bank_id: bankId,
    candidate_id,
    organization_id: orgId,
    added_by: userId,
  }))

  const { data, error } = await supabase
    .from('candidate_bank_members')
    .upsert(rows, { onConflict: 'bank_id,candidate_id' })
    .select()

  return { data, error }
}

export async function removeCandidatesFromBank(
  supabase: SupabaseClient,
  bankId: string,
  orgId: string,
  candidateIds: string[]
) {
  const { error } = await supabase
    .from('candidate_bank_members')
    .delete()
    .eq('bank_id', bankId)
    .eq('organization_id', orgId)
    .in('candidate_id', candidateIds)

  return { error }
}

/**
 * When a job is closed/archived, remove all its candidates from custom banks
 * so they fall back into the Default Bank.
 */
export async function moveJobCandidatesToDefaultBank(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  // Get all candidate IDs who applied to this job
  const { data: applications } = await supabase
    .from('applications')
    .select('candidate_id')
    .eq('job_id', jobId)

  const candidateIds = applications?.map((a) => a.candidate_id) ?? []
  if (candidateIds.length === 0) return { error: null }

  // Remove these candidates from all custom banks
  const { error } = await supabase
    .from('candidate_bank_members')
    .delete()
    .eq('organization_id', orgId)
    .in('candidate_id', candidateIds)

  return { error }
}

export async function moveCandidatesToBank(
  supabase: SupabaseClient,
  fromBankId: string | null,
  toBankId: string,
  orgId: string,
  candidateIds: string[],
  userId: string
) {
  // Remove from source bank (if it's a custom bank, not default)
  if (fromBankId) {
    await removeCandidatesFromBank(supabase, fromBankId, orgId, candidateIds)
  }

  // Add to target bank
  const { data, error } = await addCandidatesToBank(supabase, toBankId, orgId, candidateIds, userId)
  return { data, error }
}
