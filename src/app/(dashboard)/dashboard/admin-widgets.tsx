'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, AlertTriangle } from 'lucide-react'

/* ── Gradient avatars ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
]
function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

const ROLE_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  admin: { label: 'Admin', dot: 'bg-violet-500', bg: 'bg-violet-50' },
  recruiter: { label: 'Recruiter', dot: 'bg-blue-500', bg: 'bg-blue-50' },
  hiring_manager: { label: 'Hiring Mgr', dot: 'bg-emerald-500', bg: 'bg-emerald-50' },
  interviewer: { label: 'Interviewer', dot: 'bg-amber-500', bg: 'bg-amber-50' },
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
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">Team Overview</h3>
        </div>
        <span className="text-[11px] text-gray-300">{total} members</span>
      </div>
      <div className="p-4">
        {loading ? (
          <Skeleton className="h-[100px] w-full rounded-lg" />
        ) : roles.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-8">No team members yet</p>
        ) : (
          <div className="space-y-3">
            {roles.map((r) => {
              const cfg = ROLE_CONFIG[r.role] ?? { label: r.role, dot: 'bg-gray-400', bg: 'bg-gray-50' }
              const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
              return (
                <div key={r.role} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className="text-[12px] text-gray-600">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-gray-900">{r.count}</span>
                      <span className="text-[10px] text-gray-300">{pct}%</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cfg.dot} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
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
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Orange accent for urgency */}
      <div className="h-[2px] bg-gradient-to-r from-amber-400 to-orange-500" />
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-[13px] font-semibold text-gray-900">Expiring Offers</h3>
        </div>
        {offers.length > 0 && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            {offers.length}
          </span>
        )}
      </div>
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-[100px] w-full rounded-lg" />
        ) : offers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[12px] text-gray-400">No offers expiring soon</p>
            <p className="text-[11px] text-gray-300 mt-0.5">All offers are in good standing</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {offers.map((offer) => {
              const days = daysUntil(offer.expiry_date)
              const urgent = days <= 2
              return (
                <Link key={offer.id} href="/offers">
                  <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-amber-50/40 transition-colors group">
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(offer.candidate_name)} flex items-center justify-center shrink-0`}>
                      <span className="text-[9px] font-semibold text-white">
                        {offer.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-900 truncate">{offer.candidate_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{offer.job_title}</p>
                    </div>

                    <span className={`text-[10px] font-semibold shrink-0 px-2 py-0.5 rounded-full ${
                      urgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {days === 0 ? 'Today' : `${days}d left`}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
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
