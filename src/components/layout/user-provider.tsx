'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserOrganizations } from '@/lib/services/organization'
import { UserContext } from '@/lib/hooks/use-user'
import type { OrgRole } from '@/types/database'

export function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; avatar_url?: string } | null>(null)
  const [organization, setOrganization] = useState<{ id: string; name: string; slug: string; logo_url?: string } | null>(null)
  const [membership, setMembership] = useState<{ id: string; role: OrgRole } | null>(null)

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/login')
        return
      }

      setUser({
        id: authUser.id,
        email: authUser.email ?? '',
        full_name: authUser.user_metadata?.full_name ?? authUser.email ?? '',
        avatar_url: authUser.user_metadata?.avatar_url,
      })

      // Load user organizations
      const { data: orgs } = await getUserOrganizations(supabase, authUser.id)

      if (!orgs || orgs.length === 0) {
        // No organization — redirect to create one
        router.push('/org/new')
        return
      }

      // Use the first organization (or stored preference)
      const activeOrg = orgs[0] as Record<string, unknown>
      setOrganization({
        id: activeOrg.id as string,
        name: activeOrg.name as string,
        slug: activeOrg.slug as string,
        logo_url: activeOrg.logo_url as string | undefined,
      })
      setMembership({
        id: activeOrg.id as string,
        role: activeOrg.user_role as OrgRole,
      })

      setIsLoading(false)
    }

    loadUser()
  }, [router])

  return (
    <UserContext.Provider value={{ user, organization, membership, isLoading }}>
      {children}
    </UserContext.Provider>
  )
}
