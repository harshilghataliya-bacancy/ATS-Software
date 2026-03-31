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
  const role = membership?.role ?? null
  return {
    role,
    isAdmin: role === 'admin',
    isRecruiter: role === 'recruiter',
    isHiringManager: role === 'hiring_manager',
    isInterviewer: role === 'interviewer',
    canManageJobs: role === 'admin' || role === 'recruiter',
    canEditJobs: role === 'admin',
    canCreateJobs: role === 'admin',
    canManageCandidates: role === 'admin' || role === 'recruiter',
    canManageOffers: role === 'admin' || role === 'recruiter',
    canSubmitFeedback: true,
    canManageMembers: role === 'admin',
    canViewReports: role === 'admin' || role === 'recruiter',
    canViewFullReports: role === 'admin',
    canViewDashboard: role === 'admin',
    canViewAllInterviews: role !== 'interviewer',
    canSendWhatsApp: role !== null && role !== 'interviewer',
    canAccessBanks: role === 'admin' || role === 'recruiter' || role === 'hiring_manager',
  }
}
