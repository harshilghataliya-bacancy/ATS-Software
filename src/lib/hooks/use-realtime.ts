'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Table = 'applications' | 'interviews' | 'candidates' | 'jobs' | 'comments' | 'offer_letters'

export function useRealtimeSubscription<T extends Record<string, unknown>>(
  table: Table,
  organizationId: string | undefined,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  filter?: string
) {
  useEffect(() => {
    if (!organizationId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`${table}-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter || `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          callback(payload as RealtimePostgresChangesPayload<T>)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, organizationId, callback, filter])
}
