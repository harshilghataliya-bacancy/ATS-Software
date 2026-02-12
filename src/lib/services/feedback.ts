import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriteriaRating {
  criteria_id: string
  rating: number
  notes?: string
}

interface FeedbackData {
  interview_id: string
  application_id: string
  overall_rating: number
  recommendation: string
  strengths?: string
  weaknesses?: string
  notes?: string
  criteria_ratings?: CriteriaRating[]
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getFeedbackForInterview(
  supabase: SupabaseClient,
  interviewId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .select('*')
    .eq('interview_id', interviewId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function getFeedbackForApplication(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .select(
      `
      *,
      interview:interviews(
        id,
        interview_type,
        scheduled_at
      )
    `
    )
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function submitFeedback(
  supabase: SupabaseClient,
  orgId: string,
  data: FeedbackData,
  userId: string
) {
  // Check if this user already submitted feedback for this interview
  const { data: existing } = await supabase
    .from('interview_feedback')
    .select('id')
    .eq('interview_id', data.interview_id)
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (existing) {
    return {
      data: null,
      error: new Error('Feedback already submitted for this interview'),
    }
  }

  // Extract criteria_ratings before inserting feedback (DB doesn't have this column)
  const criteriaRatings = data.criteria_ratings
  const feedbackPayload = { ...data }
  delete feedbackPayload.criteria_ratings

  const { data: feedback, error } = await supabase
    .from('interview_feedback')
    .insert({
      ...feedbackPayload,
      organization_id: orgId,
      user_id: userId,
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !feedback) {
    return { data: null, error }
  }

  // Insert criteria ratings if provided
  if (criteriaRatings && criteriaRatings.length > 0) {
    await supabase
      .from('scorecard_ratings')
      .insert(
        criteriaRatings.map((cr) => ({
          feedback_id: feedback.id,
          criteria_id: cr.criteria_id,
          organization_id: orgId,
          rating: cr.rating,
          notes: cr.notes || null,
        }))
      )
  }

  return { data: feedback, error: null }
}

// ---------------------------------------------------------------------------
// Aggregated Scorecard
// ---------------------------------------------------------------------------

export async function getAggregatedScorecard(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  // Fetch all feedback for this application
  const { data: feedbackList, error: fbError } = await supabase
    .from('interview_feedback')
    .select('id, overall_rating, recommendation, user_id')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)

  if (fbError) return { data: null, error: fbError }
  if (!feedbackList || feedbackList.length === 0) {
    return { data: null, error: null }
  }

  const feedbackIds = feedbackList.map((f) => f.id)

  // Fetch all scorecard ratings for these feedbacks
  const { data: ratings, error: ratingsError } = await supabase
    .from('scorecard_ratings')
    .select('feedback_id, criteria_id, rating, criteria:scorecard_criteria(name, weight)')
    .in('feedback_id', feedbackIds)
    .eq('organization_id', orgId)

  if (ratingsError) return { data: null, error: ratingsError }

  // Build per-criteria aggregation
  const criteriaMap = new Map<string, {
    name: string
    weight: number
    ratings: Array<{ user_id: string; rating: number }>
  }>()

  ratings?.forEach((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criteria = r.criteria as any
    if (!criteria) return

    const fb = feedbackList.find((f) => f.id === r.feedback_id)
    if (!fb) return

    if (!criteriaMap.has(r.criteria_id)) {
      criteriaMap.set(r.criteria_id, {
        name: criteria.name,
        weight: criteria.weight,
        ratings: [],
      })
    }

    criteriaMap.get(r.criteria_id)!.ratings.push({
      user_id: fb.user_id,
      rating: r.rating,
    })
  })

  const criteriaResults = Array.from(criteriaMap.entries()).map(([, data]) => {
    const avg = data.ratings.reduce((sum, r) => sum + r.rating, 0) / data.ratings.length
    return {
      name: data.name,
      weight: data.weight,
      avg_rating: Math.round(avg * 10) / 10,
      ratings_by_interviewer: data.ratings,
    }
  })

  // Calculate weighted overall average
  let weightedSum = 0
  let totalWeight = 0
  criteriaResults.forEach((c) => {
    weightedSum += c.avg_rating * c.weight
    totalWeight += c.weight
  })
  const overallAvg = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0

  // Count recommendations
  const recCounts: Record<string, number> = {}
  feedbackList.forEach((f) => {
    recCounts[f.recommendation] = (recCounts[f.recommendation] ?? 0) + 1
  })

  return {
    data: {
      criteria: criteriaResults,
      overall_avg: overallAvg,
      feedback_count: feedbackList.length,
      recommendation_counts: recCounts,
    },
    error: null,
  }
}

export async function updateFeedback(
  supabase: SupabaseClient,
  feedbackId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: feedback, error } = await supabase
    .from('interview_feedback')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', feedbackId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data: feedback, error }
}
