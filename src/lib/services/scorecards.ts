import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriteriaInput {
  name: string
  description?: string
  weight: number
  rating_type: 'rating' | 'yes_no' | 'text'
  display_order: number
  category?: string
}

interface ScorecardInput {
  title: string
  description?: string
  is_active?: boolean
  criteria: CriteriaInput[]
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getScorecards(
  supabase: SupabaseClient,
  orgId: string,
  activeOnly = false
) {
  let query = supabase
    .from('scorecards')
    .select(`
      *,
      scorecard_template_criteria(*)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  return { data, error }
}

export async function getScorecardById(
  supabase: SupabaseClient,
  scorecardId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('scorecards')
    .select(`
      *,
      scorecard_template_criteria(*)
    `)
    .eq('id', scorecardId)
    .eq('organization_id', orgId)
    .single()

  return { data, error }
}

export async function getScorecardCriteriaByInterviewId(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string
) {
  // Get the interview's scorecard_id
  const { data: interview, error: intError } = await supabase
    .from('interviews')
    .select('scorecard_id')
    .eq('id', interviewId)
    .eq('organization_id', orgId)
    .single()

  if (intError || !interview?.scorecard_id) {
    return { data: null, error: intError }
  }

  // Get the scorecard with its criteria
  const { data, error } = await supabase
    .from('scorecard_template_criteria')
    .select('*')
    .eq('scorecard_id', interview.scorecard_id)
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createScorecard(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  input: ScorecardInput
) {
  const { data: scorecard, error: scError } = await supabase
    .from('scorecards')
    .insert({
      organization_id: orgId,
      title: input.title,
      description: input.description || null,
      is_active: input.is_active ?? true,
      created_by: userId,
    })
    .select()
    .single()

  if (scError || !scorecard) {
    return { data: null, error: scError }
  }

  // Insert criteria
  if (input.criteria.length > 0) {
    const { error: crError } = await supabase
      .from('scorecard_template_criteria')
      .insert(
        input.criteria.map((c) => ({
          scorecard_id: scorecard.id,
          organization_id: orgId,
          name: c.name,
          description: c.description || null,
          weight: c.weight,
          rating_type: c.rating_type,
          display_order: c.display_order,
          category: c.category || 'General',
        }))
      )

    if (crError) {
      return { data: scorecard, error: crError }
    }
  }

  return { data: scorecard, error: null }
}

export async function updateScorecard(
  supabase: SupabaseClient,
  scorecardId: string,
  orgId: string,
  input: ScorecardInput
) {
  const { data: scorecard, error: scError } = await supabase
    .from('scorecards')
    .update({
      title: input.title,
      description: input.description || null,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scorecardId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (scError || !scorecard) {
    return { data: null, error: scError }
  }

  // Delete existing criteria and re-insert
  await supabase
    .from('scorecard_template_criteria')
    .delete()
    .eq('scorecard_id', scorecardId)
    .eq('organization_id', orgId)

  if (input.criteria.length > 0) {
    const { error: crError } = await supabase
      .from('scorecard_template_criteria')
      .insert(
        input.criteria.map((c) => ({
          scorecard_id: scorecardId,
          organization_id: orgId,
          name: c.name,
          description: c.description || null,
          weight: c.weight,
          rating_type: c.rating_type,
          display_order: c.display_order,
          category: c.category || 'General',
        }))
      )

    if (crError) {
      return { data: scorecard, error: crError }
    }
  }

  return { data: scorecard, error: null }
}

export async function deleteScorecard(
  supabase: SupabaseClient,
  scorecardId: string,
  orgId: string
) {
  // Criteria cascade-delete via FK
  const { error } = await supabase
    .from('scorecards')
    .delete()
    .eq('id', scorecardId)
    .eq('organization_id', orgId)

  return { error }
}
