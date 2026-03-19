'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox, Briefcase } from 'lucide-react'

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

interface AwaitingCandidate {
  id: string
  candidate_name: string
  job_title: string
  applied_at: string
  days_ago: number
}

function AwaitingReviewCard({ orgId }: { orgId: string }) {
  const [candidates, setCandidates] = useState<AwaitingCandidate[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('organization_id', orgId)
      .eq('stage_type', 'applied')

    if (!stages || stages.length === 0) {
      setLoading(false)
      return
    }

    const stageIds = stages.map((s: { id: string }) => s.id)

    const { data: apps } = await supabase
      .from('applications')
      .select(`
        id, applied_at,
        candidate:candidates(first_name, last_name),
        job:jobs(title)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('current_stage_id', stageIds)
      .is('deleted_at', null)
      .order('applied_at', { ascending: true })
      .limit(8)

    if (apps) {
      const now = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCandidates(apps.map((a: any) => {
        const daysAgo = Math.floor((now - new Date(a.applied_at).getTime()) / 86400000)
        return {
          id: a.id,
          candidate_name: `${a.candidate?.first_name ?? ''} ${a.candidate?.last_name ?? ''}`.trim(),
          job_title: a.job?.title ?? 'Unknown',
          applied_at: a.applied_at,
          days_ago: daysAgo,
        }
      }))
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">Awaiting Review</h3>
        </div>
        {candidates.length > 0 && (
          <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            {candidates.length}
          </span>
        )}
      </div>
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-[140px] w-full rounded-lg" />
        ) : candidates.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-[12px] font-medium text-emerald-600">All caught up!</p>
            <p className="text-[11px] text-gray-300 mt-0.5">No candidates in Applied stage</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {candidates.map((c) => (
              <Link key={c.id} href="/candidates">
                <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50/80 transition-colors group">
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(c.candidate_name)} flex items-center justify-center shrink-0`}>
                    <span className="text-[9px] font-semibold text-white">
                      {c.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">{c.candidate_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.job_title}</p>
                  </div>

                  <span className={`text-[10px] shrink-0 px-2 py-0.5 rounded-full font-medium ${
                    c.days_ago > 7
                      ? 'bg-amber-50 text-amber-600'
                      : c.days_ago > 3
                        ? 'bg-gray-50 text-gray-500'
                        : 'text-gray-400'
                  }`}>
                    {c.days_ago === 0 ? 'Today' : `${c.days_ago}d ago`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface MyJob {
  id: string
  title: string
  department: string | null
  total: number
  active: number
  hired: number
}

function MyJobsCard({ orgId, userId }: { orgId: string; userId: string }) {
  const [jobs, setJobs] = useState<MyJob[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data } = await supabase
      .from('jobs')
      .select(`
        id, title, department,
        applications(id, status)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(6)

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setJobs(data.map((j: any) => {
        const apps = Array.isArray(j.applications) ? j.applications : []
        return {
          id: j.id,
          title: j.title,
          department: j.department,
          total: apps.length,
          active: apps.filter((a: { status: string }) => a.status === 'active').length,
          hired: apps.filter((a: { status: string }) => a.status === 'hired').length,
        }
      }))
    }
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">My Jobs</h3>
        </div>
        {jobs.length > 0 && (
          <Link href="/jobs" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors">
            View all
          </Link>
        )}
      </div>
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-[140px] w-full rounded-lg" />
        ) : jobs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[12px] text-gray-400">No jobs assigned to you</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Jobs you create or are assigned will appear here</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {jobs.map((j) => {
              const maxApps = Math.max(...jobs.map(jj => jj.total), 1)
              const barWidth = Math.max(4, Math.round((j.total / maxApps) * 100))
              return (
                <Link key={j.id} href={`/jobs/${j.id}`}>
                  <div className="py-2.5 px-3 rounded-lg hover:bg-gray-50/80 transition-colors group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">{j.title}</p>
                        {j.department && (
                          <span className="text-[10px] text-gray-400 shrink-0">{j.department}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-[11px] text-gray-500">{j.total}</span>
                        <span className="text-[11px] text-blue-500">{j.active}</span>
                        <span className="text-[11px] text-emerald-500">{j.hired}</span>
                      </div>
                    </div>
                    {/* Mini progress bar */}
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                </Link>
              )
            })}
            <div className="flex items-center justify-end gap-3 px-3 pt-1">
              <span className="text-[10px] text-gray-300">Total</span>
              <span className="text-[10px] text-blue-300">Active</span>
              <span className="text-[10px] text-emerald-300">Hired</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RecruiterWidgets({ orgId, userId }: { orgId: string; userId: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AwaitingReviewCard orgId={orgId} />
      <MyJobsCard orgId={orgId} userId={userId} />
    </div>
  )
}
