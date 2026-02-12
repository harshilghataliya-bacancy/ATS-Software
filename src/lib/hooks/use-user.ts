'use client'

import { createContext, useContext } from 'react'
import type { OrgRole } from '@/types/database'

type UserContextType = {
  user: { id: string; email: string; full_name: string; avatar_url?: string } | null
  organization: { id: string; name: string; slug: string; logo_url?: string } | null
  membership: { id: string; role: OrgRole } | null
  isLoading: boolean
}

export const UserContext = createContext<UserContextType>({
  user: null,
  organization: null,
  membership: null,
  isLoading: true,
})

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

export function useRole() {
  const { membership } = useUser()
  return {
    role: membership?.role ?? null,
    isAdmin: membership?.role === 'admin',
    isRecruiter: membership?.role === 'recruiter',
    isHiringManager: membership?.role === 'hiring_manager',
    canManageJobs: membership?.role === 'admin' || membership?.role === 'recruiter',
    canManageCandidates: membership?.role === 'admin' || membership?.role === 'recruiter',
    canManageOffers: membership?.role === 'admin' || membership?.role === 'recruiter',
    canSubmitFeedback: true,
    canManageMembers: membership?.role === 'admin',
    canViewReports: membership?.role === 'admin' || membership?.role === 'recruiter',
  }
}
