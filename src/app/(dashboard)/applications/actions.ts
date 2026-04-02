'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActivityLog, getCandidateActivityLog } from '@/lib/services/activity'

export async function fetchApplicationActivities(orgId: string, applicationId: string, candidateId: string) {
  const supabase = await createClient()

  // Fetch activities for both the application entity AND the candidate entity
  // This gives a complete picture: stage changes, interviews, offers (application) + profile updates (candidate)
  const [appResult, candResult] = await Promise.all([
    getActivityLog(supabase, orgId, { entityType: 'application', entityId: applicationId, limit: 50 }),
    getCandidateActivityLog(supabase, orgId, candidateId, 50),
  ])

  // Merge and deduplicate by id, sort by created_at desc
  const allMap = new Map<string, Record<string, unknown>>()
  for (const a of appResult.data || []) allMap.set(a.id, a)
  for (const a of candResult.data || []) allMap.set(a.id, a)
  const activities = Array.from(allMap.values()).sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  )

  if (activities.length === 0) return { data: [], error: null }

  // Resolve user names
  const userIds = Array.from(new Set(activities.map((a) => a.user_id as string).filter(Boolean)))
  if (userIds.length === 0) return { data: activities, error: null }

  const adminSupabase = createAdminClient()
  const userMap: Record<string, string> = {}

  const settled = await Promise.allSettled(
    userIds.map((uid) => adminSupabase.auth.admin.getUserById(uid))
  )
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value.data?.user) {
      const u = res.value.data.user
      userMap[userIds[i]] = u.user_metadata?.full_name || u.email || 'Unknown'
    }
  })

  const enriched = activities.map((activity) => ({
    ...activity,
    metadata: {
      ...((activity.metadata as Record<string, unknown>) || {}),
      user_name: activity.user_id ? userMap[activity.user_id as string] || null : null,
    },
  }))

  return { data: enriched, error: null }
}
