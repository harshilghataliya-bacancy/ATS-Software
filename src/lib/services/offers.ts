import { SupabaseClient } from '@supabase/supabase-js'
import { ITEMS_PER_PAGE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OfferFilters {
  status?: string
  page?: number
  limit?: number
}

interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section?: string
}

interface BonusComponent {
  name: string
  amount: number
  frequency: string
}

interface OfferData {
  application_id: string
  candidate_id: string
  job_id: string
  salary: number
  salary_currency?: string
  start_date?: string
  expiry_date?: string
  template_html?: string
  salary_components?: SalaryComponent[]
  bonus_components?: BonusComponent[]
  reporting_manager?: string
  employment_type?: string
  location?: string
  remuneration_type?: string
  pf_applicable?: boolean
  work_type?: string
  business_unit?: string
  offer_template_id?: string | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOffers(
  supabase: SupabaseClient,
  orgId: string,
  filters: OfferFilters = {}
) {
  const { status, page = 1, limit = ITEMS_PER_PAGE } = filters
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('offer_letters')
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title, department)
      )
    `,
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  return { data, error, count }
}

export async function getOfferById(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_letters')
    .select(
      `
      *,
      application:applications(
        *,
        candidate:candidates(*),
        job:jobs(id, title, department, status)
      )
    `
    )
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  return { data, error }
}

export async function getOfferByToken(
  supabase: SupabaseClient,
  token: string
) {
  const { data, error } = await supabase
    .from('offer_letters')
    .select('id, status, application_id, organization_id, candidate_id, job_id')
    .eq('response_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  return { data, error }
}

export async function respondToOfferByToken(
  supabase: SupabaseClient,
  token: string,
  status: 'accepted' | 'declined'
) {
  // Find the offer by token
  const { data: offer, error: findError } = await getOfferByToken(supabase, token)

  if (findError || !offer) {
    return { data: null, error: findError ?? new Error('Invalid or expired link') }
  }

  if (offer.status !== 'sent') {
    return { data: null, error: new Error('This offer has already been responded to') }
  }

  // Update status and nullify token (single-use)
  const { data: updated, error: updateError } = await supabase
    .from('offer_letters')
    .update({
      status,
      responded_at: new Date().toISOString(),
      response_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offer.id)
    .eq('status', 'sent')
    .select('id, application_id, organization_id')
    .maybeSingle()

  if (updateError) {
    return { data: null, error: updateError }
  }

  if (!updated) {
    return { data: null, error: new Error('This offer has already been responded to') }
  }

  return { data: updated, error: null }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createOffer(
  supabase: SupabaseClient,
  orgId: string,
  data: OfferData,
  userId: string
) {
  const { data: offer, error } = await supabase
    .from('offer_letters')
    .insert({
      ...data,
      organization_id: orgId,
      created_by: userId,
      status: 'draft',
    })
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title)
      )
    `
    )
    .single()

  return { data: offer, error }
}

export async function updateOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: offer, error } = await supabase
    .from('offer_letters')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .in('status', ['draft']) // Only allow editing draft offers
    .select()
    .single()

  return { data: offer, error }
}

export async function sendOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_letters')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .eq('status', 'draft')
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title)
      )
    `
    )
    .single()

  return { data, error }
}

export async function respondToOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string,
  status: 'accepted' | 'declined',
  notes?: string
) {
  const updatePayload: Record<string, unknown> = {
    status,
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (notes) {
    updatePayload.response_notes = notes
  }

  const { data, error } = await supabase
    .from('offer_letters')
    .update(updatePayload)
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .in('status', ['sent', 'draft']) // Allow admin to respond to sent or draft offers
    .select(
      `
      *,
      application:applications(
        id,
        candidate:candidates(id, first_name, last_name, email),
        job:jobs(id, title)
      )
    `
    )
    .maybeSingle()

  if (!error && !data) {
    return { data: null, error: new Error('Offer not found or already has a final status') }
  }

  return { data, error }
}

export async function deleteOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string
) {
  const { error } = await supabase
    .from('offer_letters')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  return { error }
}

export async function expireOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_letters')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .eq('status', 'sent')
    .select()
    .single()

  return { data, error }
}

export async function revokeOffer(
  supabase: SupabaseClient,
  offerId: string,
  orgId: string,
  notes?: string
) {
  const updatePayload: Record<string, unknown> = {
    status: 'revoked',
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (notes) {
    updatePayload.response_notes = notes
  }

  const { data, error } = await supabase
    .from('offer_letters')
    .update(updatePayload)
    .eq('id', offerId)
    .eq('organization_id', orgId)
    .eq('status', 'sent')
    .select()
    .single()

  return { data, error }
}
