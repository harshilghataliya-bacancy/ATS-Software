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
      description: 'Candidates manually added to the bank',
      is_default: true,
    })
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Default Bank Candidates (only explicitly added candidates)
// ---------------------------------------------------------------------------

export async function getDefaultBankCandidates(
  supabase: SupabaseClient,
  orgId: string,
  filters: BankFilters = {}
) {
  // Get the default bank ID
  const { data: defaultBank } = await supabase
    .from('candidate_banks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_default', true)
    .maybeSingle()

  if (!defaultBank) return { data: [], error: null, count: 0 }

  // Use the same logic as custom banks — only explicitly added members
  return getBankCandidates(supabase, defaultBank.id, orgId, filters)
}

// ---------------------------------------------------------------------------
// Add candidate to default bank (manual move)
// ---------------------------------------------------------------------------

export async function addCandidateToDefaultBank(
  supabase: SupabaseClient,
  orgId: string,
  candidateId: string,
  userId: string
) {
  // Ensure default bank exists
  const { data: bank, error: bankError } = await ensureDefaultBank(supabase, orgId)
  if (bankError || !bank) return { error: bankError || new Error('Failed to get default bank'), alreadyExists: false }

  // Check if already in default bank
  const { data: existing } = await supabase
    .from('candidate_bank_members')
    .select('id')
    .eq('bank_id', bank.id)
    .eq('candidate_id', candidateId)
    .maybeSingle()

  if (existing) return { error: { message: 'Candidate is already in the Default Bank' }, alreadyExists: true }

  // Add to default bank
  const { data, error } = await supabase
    .from('candidate_bank_members')
    .insert({
      bank_id: bank.id,
      candidate_id: candidateId,
      organization_id: orgId,
      added_by: userId,
    })
    .select()
    .single()

  return { data, error, alreadyExists: false }
}

// Check if candidate is in default bank
export async function isCandidateInDefaultBank(
  supabase: SupabaseClient,
  orgId: string,
  candidateId: string
) {
  const { data: defaultBank } = await supabase
    .from('candidate_banks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_default', true)
    .maybeSingle()

  if (!defaultBank) return false

  const { data } = await supabase
    .from('candidate_bank_members')
    .select('id')
    .eq('bank_id', defaultBank.id)
    .eq('candidate_id', candidateId)
    .maybeSingle()

  return !!data
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
