'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import {
  getDashboardStats,
  getTimeToHire,
  getPipelineConversion,
  getSourceBreakdown,
  getOfferAcceptanceRate,
  getHiringVelocity,
} from '@/lib/services/reports'
import { getJobs } from '@/lib/services/jobs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280']

interface Stats {
  open_jobs: number
  active_candidates: number
  interviews_this_week: number
  pending_offers: number
}

interface PipelineStage {
  stage_name: string
  stage_type: string
  display_order: number
  current_count: number
  total_reached: number
  conversion_rate: number
}

interface SourceRow {
  source: string
  total: number
  hired: number
  rejected: number
  active: number
  hire_rate: number
}

interface TimeToHireData {
  average_days: number
  total_hires: number
  breakdown: Array<{ department: string; average_days: number; total_hires: number }>
}

interface OfferRate {
  total_sent: number
  accepted: number
  declined: number
  acceptance_rate_pct: number
}

interface VelocityPoint {
  month: string
  hires: number
}

interface JobOption {
  id: string
  title: string
}

export default function ReportsPage() {
  const { organization, isLoading: userLoading } = useUser()
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState<Stats | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [sources, setSources] = useState<SourceRow[]>([])
  const [timeToHire, setTimeToHire] = useState<TimeToHireData | null>(null)
  const [offerRate, setOfferRate] = useState<OfferRate | null>(null)
  const [velocity, setVelocity] = useState<VelocityPoint[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('all')

  const loadReports = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()

    const [statsRes, pipelineRes, sourcesRes, tthRes, offerRes, velRes, jobsRes] =
      await Promise.all([
        getDashboardStats(supabase, organization.id),
        getPipelineConversion(supabase, organization.id, selectedJobId !== 'all' ? selectedJobId : undefined),
        getSourceBreakdown(supabase, organization.id),
        getTimeToHire(supabase, organization.id),
        getOfferAcceptanceRate(supabase, organization.id),
        getHiringVelocity(supabase, organization.id),
        getJobs(supabase, organization.id, { limit: 100 }),
      ])

    if (statsRes.data) setStats(statsRes.data)
    if (pipelineRes.data) setPipeline(pipelineRes.data)
    if (sourcesRes.data) setSources(sourcesRes.data)
    if (tthRes.data) setTimeToHire(tthRes.data)
    if (offerRes.data) setOfferRate(offerRes.data)
    if (velRes.data) setVelocity(velRes.data)
    if (jobsRes.data) setJobs(jobsRes.data.map((j: Record<string, unknown>) => ({ id: j.id as string, title: j.title as string })))
    setLoading(false)
  }, [organization, selectedJobId])

  useEffect(() => {
    if (organization) loadReports()
  }, [organization, loadReports])

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Hiring analytics and metrics</p>
        </div>
        <div className="w-64">
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Total Hires</p>
            <p className="text-3xl font-bold">{timeToHire?.total_hires ?? 0}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400">All-time completed hires</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Avg Time-to-Hire</p>
            <p className="text-3xl font-bold">{timeToHire?.average_days ?? 0}<span className="text-base font-normal text-gray-400 ml-1">days</span></p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400">From application to hire</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Offer Acceptance Rate</p>
            <p className="text-3xl font-bold">{offerRate?.acceptance_rate_pct ?? 0}<span className="text-base font-normal text-gray-400 ml-1">%</span></p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400">{offerRate?.accepted ?? 0} accepted / {offerRate?.total_sent ?? 0} sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-gray-500">Active Pipeline</p>
            <p className="text-3xl font-bold">{stats?.active_candidates ?? 0}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-400">{stats?.open_jobs ?? 0} open jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">No pipeline data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pipeline} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="stage_name" type="category" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total_reached" fill="#3b82f6" name="Total Reached" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="current_count" fill="#93c5fd" name="Currently In" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Source Effectiveness */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source Effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">No source data yet</p>
            ) : (
              <div className="flex gap-4">
                <ResponsiveContainer width="50%" height={300}>
                  <PieChart>
                    <Pie
                      data={sources}
                      dataKey="total"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    >
                      {sources.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-1/2 overflow-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-1.5 pr-2">Source</th>
                        <th className="py-1.5 pr-2">Total</th>
                        <th className="py-1.5 pr-2">Hired</th>
                        <th className="py-1.5">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s) => (
                        <tr key={s.source} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 capitalize">{s.source.replace(/_/g, ' ')}</td>
                          <td className="py-1.5 pr-2">{s.total}</td>
                          <td className="py-1.5 pr-2">{s.hired}</td>
                          <td className="py-1.5">{s.hire_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hiring Velocity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hiring Velocity</CardTitle>
          </CardHeader>
          <CardContent>
            {velocity.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">No hiring data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={velocity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hires" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Hires" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Time-to-Hire by Department */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Time-to-Hire by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {!timeToHire || timeToHire.breakdown.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">No hire data by department yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeToHire.breakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                  <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Bar dataKey="average_days" fill="#f59e0b" name="Avg Days" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
