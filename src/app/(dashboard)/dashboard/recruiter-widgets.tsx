'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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

    // Get all "applied" stage IDs across jobs in this org
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
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Awaiting Review</CardTitle>
          {candidates.length > 0 && (
            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              {candidates.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[140px] w-full" />
        ) : candidates.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1">No candidates waiting in Applied stage</p>
          </div>
        ) : (
          <div className="space-y-1">
            {candidates.map((c) => (
              <Link key={c.id} href="/candidates">
                <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.candidate_name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.job_title}</p>
                  </div>
                  <span className={`text-xs shrink-0 ml-2 px-2 py-0.5 rounded-full ${
                    c.days_ago > 7
                      ? 'bg-amber-100 text-amber-700 font-medium'
                      : 'text-gray-500'
                  }`}>
                    {c.days_ago === 0 ? 'Today' : `${c.days_ago}d ago`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">My Jobs</CardTitle>
          {jobs.length > 0 && (
            <Link href="/jobs" className="text-xs text-blue-600 hover:underline">View all</Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[140px] w-full" />
        ) : jobs.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No jobs assigned to you</p>
            <p className="text-xs text-gray-400 mt-1">Jobs you create or are assigned will appear here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`}>
                <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                    {j.department && (
                      <Badge variant="secondary" className="text-[10px] mt-0.5">{j.department}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-gray-500" title="Total applications">{j.total}</span>
                    <span className="text-[10px] text-gray-300">/</span>
                    <span className="text-xs text-blue-600" title="Active">{j.active}</span>
                    <span className="text-[10px] text-gray-300">/</span>
                    <span className="text-xs text-green-600" title="Hired">{j.hired}</span>
                  </div>
                </div>
              </Link>
            ))}
            <p className="text-[10px] text-gray-400 text-right mt-1">Total / Active / Hired</p>
          </div>
        )}
      </CardContent>
    </Card>
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
