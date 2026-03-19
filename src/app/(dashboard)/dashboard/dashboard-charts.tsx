'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getHiringVelocity,
  getPipelineConversion,
  getOfferAcceptanceRate,
} from '@/lib/services/reports'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp, GitBranch, Target, BarChart3, Activity, Building2, Zap,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface JobApps {
  job_title: string
  total: number
  active: number
  hired: number
  rejected: number
}

interface DayPoint {
  date: string
  applications: number
}

interface DeptBreakdown {
  department: string
  open_jobs: number
  active_apps: number
}

export default function DashboardCharts({ orgId }: { orgId: string }) {
  const [velocity, setVelocity] = useState<Array<{ month: string; hires: number }>>([])
  const [pipeline, setPipeline] = useState<Array<{ stage_name: string; current_count: number }>>([])
  const [offerRate, setOfferRate] = useState<{ accepted: number; declined: number; total_sent: number } | null>(null)
  const [jobApps, setJobApps] = useState<JobApps[]>([])
  const [appTrend, setAppTrend] = useState<DayPoint[]>([])
  const [deptData, setDeptData] = useState<DeptBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  const loadCharts = useCallback(async () => {
    const supabase = createClient()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [velocityResult, pipelineResult, offerResult, appsResult, deptResult] = await Promise.all([
      getHiringVelocity(supabase, orgId),
      getPipelineConversion(supabase, orgId),
      getOfferAcceptanceRate(supabase, orgId),
      supabase
        .from('applications')
        .select('status, applied_at, job:jobs(title)')
        .eq('organization_id', orgId)
        .is('deleted_at', null),
      supabase
        .from('jobs')
        .select('department, status, applications(id, status)')
        .eq('organization_id', orgId)
        .eq('status', 'published')
        .is('deleted_at', null),
    ])

    if (velocityResult.data) setVelocity(velocityResult.data)
    if (pipelineResult.data) setPipeline(pipelineResult.data)
    if (offerResult.data) setOfferRate(offerResult.data)

    if (appsResult.data) {
      const jobMap = new Map<string, { total: number; active: number; hired: number; rejected: number }>()
      const dayMap = new Map<string, number>()

      for (const app of appsResult.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const title = (app.job as any)?.title ?? 'Unknown'
        const existing = jobMap.get(title) ?? { total: 0, active: 0, hired: 0, rejected: 0 }
        existing.total += 1
        if (app.status === 'active') existing.active += 1
        else if (app.status === 'hired') existing.hired += 1
        else if (app.status === 'rejected') existing.rejected += 1
        jobMap.set(title, existing)

        if (app.applied_at) {
          const appliedDate = new Date(app.applied_at)
          if (appliedDate >= thirtyDaysAgo) {
            const dayKey = appliedDate.toISOString().slice(0, 10)
            dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + 1)
          }
        }
      }

      setJobApps(
        Array.from(jobMap.entries())
          .map(([job_title, counts]) => ({ job_title, ...counts }))
          .sort((a, b) => b.total - a.total)
      )

      const trendData: DayPoint[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        trendData.push({ date: key, applications: dayMap.get(key) ?? 0 })
      }
      setAppTrend(trendData)
    }

    if (deptResult.data) {
      const deptMap = new Map<string, { open_jobs: number; active_apps: number }>()
      for (const job of deptResult.data) {
        const dept = (job.department as string) || 'Unassigned'
        const existing = deptMap.get(dept) ?? { open_jobs: 0, active_apps: 0 }
        existing.open_jobs += 1
        const apps = Array.isArray(job.applications) ? job.applications : []
        existing.active_apps += apps.filter((a: { status: string }) => a.status === 'active').length
        deptMap.set(dept, existing)
      }
      setDeptData(
        Array.from(deptMap.entries())
          .map(([department, counts]) => ({ department, ...counts }))
          .sort((a, b) => b.open_jobs - a.open_jobs)
      )
    }

    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  // Shared chart card wrapper
  function ChartCard({ children, title, subtitle, icon: Icon, className = '' }: {
    children: React.ReactNode
    title: string
    subtitle: string
    icon: React.ComponentType<{ className?: string }>
    className?: string
  }) {
    return (
      <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
            <p className="text-[10px] text-gray-300">{subtitle}</p>
          </div>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    )
  }

  const emptyState = (msg: string) => (
    <p className="text-[12px] text-gray-300 text-center py-16">{msg}</p>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Hiring Velocity */}
      <ChartCard title="Hiring Velocity" subtitle="Hires per month (last 6 months)" icon={TrendingUp}>
        {loading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : velocity.every((v) => v.hires === 0) ? (
          emptyState('No hires recorded yet')
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={velocity} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hiresGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: string) => {
                  const [, m] = v.split('-')
                  return MONTHS[parseInt(m) - 1]
                }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                labelFormatter={(v) => {
                  const s = String(v)
                  const [y, m] = s.split('-')
                  return `${MONTHS[parseInt(m) - 1]} ${y}`
                }}
              />
              <Area type="monotone" dataKey="hires" stroke="#6366f1" fill="url(#hiresGradient)" strokeWidth={2} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Pipeline Snapshot */}
      <ChartCard title="Pipeline Snapshot" subtitle="Active candidates by stage" icon={GitBranch}>
        {loading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : pipeline.length === 0 || pipeline.every((p) => p.current_count === 0) ? (
          emptyState('No pipeline data yet')
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, pipeline.length * 32)}>
            <BarChart data={pipeline} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="stage_name" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={80} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
              <Bar dataKey="current_count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Candidates" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Offer Outcomes */}
      <ChartCard title="Offer Outcomes" subtitle="Acceptance vs decline rate" icon={Target}>
        {loading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : !offerRate || offerRate.total_sent === 0 ? (
          emptyState('No offers sent yet')
        ) : (
          <div className="flex items-center justify-center gap-4">
            <ResponsiveContainer width="55%" height={180}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Accepted', value: offerRate.accepted },
                    { name: 'Declined', value: offerRate.declined },
                    { name: 'Pending', value: offerRate.total_sent - offerRate.accepted - offerRate.declined },
                  ].filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-gray-500">Accepted ({offerRate.accepted})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-500">Declined ({offerRate.declined})</span>
              </div>
              {offerRate.total_sent - offerRate.accepted - offerRate.declined > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-gray-500">Pending ({offerRate.total_sent - offerRate.accepted - offerRate.declined})</span>
                </div>
              )}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Applications by Job */}
      <ChartCard title="Applications by Job" subtitle="Candidate applications per posting" icon={BarChart3} className="lg:col-span-2">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : jobApps.length === 0 ? (
          emptyState('No applications yet')
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, jobApps.length * 40)}>
            <BarChart data={jobApps} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="job_title"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                width={140}
                tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '...' : v}
              />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
              <Bar dataKey="active" stackId="a" fill="#3b82f6" name="Active" />
              <Bar dataKey="hired" stackId="a" fill="#22c55e" name="Hired" />
              <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rejected" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Application Trend */}
      <ChartCard title="Application Trend" subtitle="Daily applications (last 30 days)" icon={Activity}>
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : appTrend.every((d) => d.applications === 0) ? (
          emptyState('No applications in last 30 days')
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={appTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="appTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: string) => {
                  const [, m, d] = v.split('-')
                  return `${parseInt(m)}/${parseInt(d)}`
                }}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                labelFormatter={(v) => {
                  const d = new Date(String(v))
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }}
              />
              <Area
                type="monotone"
                dataKey="applications"
                stroke="#10b981"
                fill="url(#appTrendGradient)"
                strokeWidth={2}
                dot={false}
                name="Applications"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Department Breakdown */}
      <ChartCard title="Department Breakdown" subtitle="Open jobs & active apps by department" icon={Building2} className="lg:col-span-2">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : deptData.length === 0 ? (
          emptyState('No published jobs yet')
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, deptData.length * 40)}>
            <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="department"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                width={100}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 14) + '...' : v}
              />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
              <Bar dataKey="open_jobs" fill="#6366f1" name="Open Jobs" />
              <Bar dataKey="active_apps" fill="#f59e0b" name="Active Apps" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Recruitment Summary */}
      <ChartCard title="Recruitment Summary" subtitle="Key hiring metrics at a glance" icon={Zap}>
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : (() => {
          const totalApps = jobApps.reduce((s, j) => s + j.total, 0)
          const totalHired = jobApps.reduce((s, j) => s + j.hired, 0)
          const totalRejected = jobApps.reduce((s, j) => s + j.rejected, 0)
          const hireRate = totalApps > 0 ? Math.round((totalHired / totalApps) * 100) : 0
          const acceptRate = offerRate && offerRate.total_sent > 0
            ? Math.round((offerRate.accepted / offerRate.total_sent) * 100)
            : null
          const metrics = [
            { label: 'Applications', value: totalApps, color: 'text-blue-600', dot: 'bg-blue-500' },
            { label: 'Hired', value: totalHired, color: 'text-emerald-600', dot: 'bg-emerald-500' },
            { label: 'Rejected', value: totalRejected, color: 'text-red-500', dot: 'bg-red-500' },
            { label: 'Hire Rate', value: `${hireRate}%`, color: 'text-violet-600', dot: 'bg-violet-500' },
            { label: 'Accept Rate', value: acceptRate !== null ? `${acceptRate}%` : 'N/A', color: 'text-amber-600', dot: 'bg-amber-500' },
            { label: 'Open Positions', value: deptData.reduce((s, d) => s + d.open_jobs, 0), color: 'text-indigo-600', dot: 'bg-indigo-500' },
          ]
          return (
            <div className="grid grid-cols-2 gap-2.5">
              {metrics.map((m) => (
                <div key={m.label} className="bg-gray-50/80 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                    <p className="text-[10px] text-gray-400">{m.label}</p>
                  </div>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          )
        })()}
      </ChartCard>
    </div>
  )
}
