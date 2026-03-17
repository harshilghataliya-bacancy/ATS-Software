'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCandidateActivityLog } from '@/lib/services/activity'

export async function fetchCandidateActivities(orgId: string, candidateId: string) {
  const supabase = await createClient()
  const { data: activities, error } = await getCandidateActivityLog(supabase, orgId, candidateId, 100)

  if (error || !activities || activities.length === 0) {
    return { data: activities || [], error }
  }

  // Resolve user names from user_ids
  const userIds = Array.from(new Set(activities.map((a: { user_id?: string }) => a.user_id).filter(Boolean))) as string[]

  if (userIds.length === 0) return { data: activities, error: null }

  const adminSupabase = createAdminClient()
  const userMap: Record<string, string> = {}

  // Batch fetch user details
  for (const uid of userIds) {
    try {
      const { data } = await adminSupabase.auth.admin.getUserById(uid)
      if (data?.user) {
        userMap[uid] = data.user.user_metadata?.full_name || data.user.email || 'Unknown'
      }
    } catch {
      // skip
    }
  }

  // Enrich activities with user_name in metadata
  const enriched = activities.map((activity) => ({
    ...activity,
    metadata: {
      ...(activity.metadata || {}),
      user_name: activity.user_id ? userMap[activity.user_id] || null : null,
    },
  }))

  return { data: enriched, error: null }
}
