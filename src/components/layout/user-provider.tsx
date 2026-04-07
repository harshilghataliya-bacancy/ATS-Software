'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserOrganizations } from '@/lib/services/organization'
import { UserContext } from '@/lib/hooks/use-user'
import type { OrgRole } from '@/types/database'

const CACHE_KEY = 'hireflow_user_cache'

interface CachedData {
  user: { id: string; email: string; full_name: string; avatar_url?: string }
  organization: { id: string; name: string; slug: string; logo_url?: string }
  membership: { id: string; role: OrgRole }
  ts: number
}

function getCached(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedData
    // Cache valid for 30 minutes
    if (Date.now() - data.ts > 30 * 60 * 1000) return null
    return data
  } catch { return null }
}

function setCache(data: Omit<CachedData, 'ts'>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() })) } catch {}
}

// Use useLayoutEffect on client, useEffect on server (suppresses SSR warning)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; avatar_url?: string } | null>(null)
  const [organization, setOrganization] = useState<{ id: string; name: string; slug: string; logo_url?: string } | null>(null)
  const [membership, setMembership] = useState<{ id: string; role: OrgRole } | null>(null)

  // Hydrate from cache synchronously before paint to avoid loading flash
  useIsomorphicLayoutEffect(() => {
    const cached = getCached()
    if (cached) {
      setUser(cached.user)
      setOrganization(cached.organization)
      setMembership(cached.membership)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        localStorage.removeItem(CACHE_KEY)
        routerRef.current.push('/login')
        return
      }

      const userData = {
        id: authUser.id,
        email: authUser.email ?? '',
        full_name: authUser.user_metadata?.full_name ?? authUser.email ?? '',
        avatar_url: authUser.user_metadata?.avatar_url,
      }
      setUser(userData)

      // Load user organizations
      const { data: orgs } = await getUserOrganizations(supabase, authUser.id)

      if (!orgs || orgs.length === 0) {
        localStorage.removeItem(CACHE_KEY)
        routerRef.current.push('/org/new')
        return
      }

      // Use the first organization (or stored preference)
      const activeOrg = orgs[0] as Record<string, unknown>
      const orgData = {
        id: activeOrg.id as string,
        name: activeOrg.name as string,
        slug: activeOrg.slug as string,
        logo_url: activeOrg.logo_url as string | undefined,
      }
      const memberData = {
        id: activeOrg.id as string,
        role: activeOrg.user_role as OrgRole,
      }
      setOrganization(orgData)
      setMembership(memberData)
      setCache({ user: userData, organization: orgData, membership: memberData })

      setIsLoading(false)
    }

    loadUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <UserContext.Provider value={{ user, organization, membership, isLoading }}>
      {children}
    </UserContext.Provider>
  )
}
