'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useRole } from '@/lib/hooks/use-user'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Users, Calculator, ClipboardList } from 'lucide-react'
import { Suspense } from 'react'

import OrganizationPage from './organization/page'
import MembersPage from './members/page'
import SalaryStructuresPage from './salary-structures/page'
import ScorecardsPage from './scorecards/page'

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAdmin } = useRole()

  const tab = searchParams.get('tab') || 'organization'

  const handleTabChange = (value: string) => {
    router.push(`/settings?tab=${value}`, { scroll: false })
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">Only administrators can access settings.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your organization settings</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="bg-gray-100/80 p-1 rounded-lg mb-6">
          <TabsTrigger value="organization" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Building2 className="w-4 h-4" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="w-4 h-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="salary-structures" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Calculator className="w-4 h-4" />
            Salary Structures
          </TabsTrigger>
          <TabsTrigger value="scorecards" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ClipboardList className="w-4 h-4" />
            Scorecards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <OrganizationPage />
        </TabsContent>
        <TabsContent value="members">
          <MembersPage />
        </TabsContent>
        <TabsContent value="salary-structures">
          <SalaryStructuresPage />
        </TabsContent>
        <TabsContent value="scorecards">
          <ScorecardsPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
