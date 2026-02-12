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

interface OfferData {
  application_id: string
  candidate_id: string
  job_id: string
  salary: number
  salary_currency?: string
  start_date?: string
  expiry_date?: string
  template_html?: string
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
    .single()

  return { data, error }
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
    .eq('status', 'sent') // Can only respond to sent offers
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
    return { data: null, error: new Error('Offer not found or is not in sent status') }
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
    .delete()
    .eq('id', offerId)
    .eq('organization_id', orgId)

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
