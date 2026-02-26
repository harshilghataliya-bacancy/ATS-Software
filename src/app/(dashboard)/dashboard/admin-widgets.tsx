'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const ROLE_CONFIG: Record<string, { label: string; dot: string }> = {
  admin: { label: 'Admin', dot: 'bg-purple-500' },
  recruiter: { label: 'Recruiter', dot: 'bg-blue-500' },
  hiring_manager: { label: 'Hiring Manager', dot: 'bg-green-500' },
  interviewer: { label: 'Interviewer', dot: 'bg-orange-500' },
}

interface RoleCount {
  role: string
  count: number
}

function TeamOverviewCard({ orgId }: { orgId: string }) {
  const [roles, setRoles] = useState<RoleCount[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .not('user_id', 'is', null)
      .is('deleted_at', null)

    if (data) {
      const map = new Map<string, number>()
      for (const row of data) {
        map.set(row.role, (map.get(row.role) ?? 0) + 1)
      }
      setRoles(
        Array.from(map.entries())
          .map(([role, count]) => ({ role, count }))
          .sort((a, b) => b.count - a.count)
      )
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  const total = roles.reduce((s, r) => s + r.count, 0)

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Team Overview</CardTitle>
          <span className="text-xs text-gray-400">{total} members</span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[100px] w-full" />
        ) : roles.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No team members yet</p>
        ) : (
          <div className="space-y-3">
            {roles.map((r) => {
              const cfg = ROLE_CONFIG[r.role] ?? { label: r.role, dot: 'bg-gray-400' }
              return (
                <div key={r.role} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-sm text-gray-700">{cfg.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{r.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ExpiringOffer {
  id: string
  expiry_date: string
  candidate_name: string
  job_title: string
}

function ExpiringOffersCard({ orgId }: { orgId: string }) {
  const [offers, setOffers] = useState<ExpiringOffer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const now = new Date()
    const in7Days = new Date()
    in7Days.setDate(in7Days.getDate() + 7)

    const { data } = await supabase
      .from('offer_letters')
      .select(`
        id, expiry_date,
        application:applications(
          candidate:candidates(first_name, last_name),
          job:jobs(title)
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'sent')
      .gte('expiry_date', now.toISOString().slice(0, 10))
      .lte('expiry_date', in7Days.toISOString().slice(0, 10))
      .order('expiry_date', { ascending: true })

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOffers(data.map((o: any) => ({
        id: o.id,
        expiry_date: o.expiry_date,
        candidate_name: `${o.application?.candidate?.first_name ?? ''} ${o.application?.candidate?.last_name ?? ''}`.trim(),
        job_title: o.application?.job?.title ?? 'Unknown',
      })))
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / 86400000))
  }

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-amber-400">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Expiring Offers</CardTitle>
          {offers.length > 0 && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {offers.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[100px] w-full" />
        ) : offers.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No offers expiring soon</p>
            <p className="text-xs text-gray-400 mt-1">All offers are in good standing</p>
          </div>
        ) : (
          <div className="space-y-2">
            {offers.map((offer) => {
              const days = daysUntil(offer.expiry_date)
              return (
                <Link key={offer.id} href="/offers">
                  <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-amber-50/50 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{offer.candidate_name}</p>
                      <p className="text-xs text-gray-500 truncate">{offer.job_title}</p>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ml-2 px-2 py-0.5 rounded-full ${
                      days <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {days === 0 ? 'Expires today' : `${days}d left`}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminWidgets({ orgId }: { orgId: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TeamOverviewCard orgId={orgId} />
      <ExpiringOffersCard orgId={orgId} />
    </div>
  )
}
