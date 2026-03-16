'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Filter, Briefcase, TrendingUp, Clock, Globe } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_COLORS = { active: '#3b82f6', hired: '#22c55e', rejected: '#ef4444' }

const SOURCE_COLORS = ['#818cf8', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316', '#6366f1']

interface PipelineStage {
  stage_name: string
  stage_type: string
  display_order: number
  current_count: number
  total_reached: number
  conversion_rate: number
}

interface TimeToHireData {
  average_days: number
  total_hires: number
  breakdown: Array<{ department: string; average_days: number; total_hires: number }>
}

interface VelocityPoint {
  month: string
  hires: number
}

interface JobStatusData {
  job_title: string
  active: number
  hired: number
  rejected: number
}

interface SourceData {
  source: string
  total: number
  hired: number
  rejected: number
  active: number
  hire_rate: number
}

interface ReportChartsProps {
  pipeline: PipelineStage[]
  jobStatusData: JobStatusData[]
  velocity: VelocityPoint[]
  timeToHire: TimeToHireData | null
  sourceData: SourceData[]
  selectedJobTitle?: string
}

// Custom label for funnel drop-off

export default function ReportCharts({ pipeline, jobStatusData, velocity, timeToHire, sourceData, selectedJobTitle }: ReportChartsProps) {
  return (
    <>
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel with Drop-off */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Pipeline Funnel</CardTitle>
            <CardDescription className="text-xs">
              Candidates currently at each stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pipeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <Filter className="w-10 h-10 mb-2" />
                <p className="text-sm text-gray-400">No pipeline data yet</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(280, pipeline.length * 48)}>
                  <BarChart data={pipeline} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="stage_name" type="category" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [value, name]}
                    />
                    <Bar dataKey="current_count" fill="#818cf8" name="Currently In" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Stage counts */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 px-1 text-xs text-gray-500">
                  {pipeline.map((s) => (
                    <span key={s.stage_name}>
                      {s.stage_name}: <span className="font-semibold text-gray-700">{s.current_count}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Application Status by Job */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {selectedJobTitle ? `Applications: ${selectedJobTitle}` : 'Application Status by Job'}
            </CardTitle>
            <CardDescription className="text-xs">
              Active, hired, and rejected candidates per job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobStatusData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <Briefcase className="w-10 h-10 mb-2" />
                <p className="text-sm text-gray-400">No application data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, jobStatusData.length * 40)}>
                <BarChart data={jobStatusData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="job_title"
                    tick={{ fontSize: 11 }}
                    width={120}
                    tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + '...' : v}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="active" stackId="a" fill={STATUS_COLORS.active} name="Active" />
                  <Bar dataKey="hired" stackId="a" fill={STATUS_COLORS.hired} name="Hired" />
                  <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hiring Velocity */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Hiring Velocity</CardTitle>
            <CardDescription className="text-xs">
              Monthly hires over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            {velocity.length === 0 || velocity.every((v) => v.hires === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <TrendingUp className="w-10 h-10 mb-2" />
                <p className="text-sm text-gray-400">No hiring data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={velocity} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => {
                      const [, m] = v.split('-')
                      return MONTHS[parseInt(m) - 1]
                    }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    labelFormatter={(v) => {
                      const s = String(v)
                      const [y, m] = s.split('-')
                      return `${MONTHS[parseInt(m) - 1]} ${y}`
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="hires"
                    stroke="#10b981"
                    fill="url(#velocityGradient)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#10b981' }}
                    name="Hires"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Time-to-Hire by Department */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Time-to-Hire by Department</CardTitle>
            <CardDescription className="text-xs">
              Average days from application to hire
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!timeToHire || timeToHire.breakdown.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <Clock className="w-10 h-10 mb-2" />
                <p className="text-sm text-gray-400">No hire data by department yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeToHire.breakdown} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="deptGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`${value} days`, 'Avg Time-to-Hire']}
                  />
                  <Bar dataKey="average_days" fill="url(#deptGradient)" name="Avg Days" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3 — Source Effectiveness */}
      {sourceData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Source Pie Chart */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Source Distribution</CardTitle>
              <CardDescription className="text-xs">
                Where your candidates come from
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    dataKey="total"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={({ source, total }: any) => `${source} (${total})`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _: any, entry: any) => {
                      const d = entry.payload
                      return [`Total: ${d.total} | Hired: ${d.hired} | Hire Rate: ${d.hire_rate}%`, d.source]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Source Effectiveness Bar Chart */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Source Effectiveness</CardTitle>
              <CardDescription className="text-xs">
                Hire rate and volume by source
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourceData.every((s) => s.total === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                  <Globe className="w-10 h-10 mb-2" />
                  <p className="text-sm text-gray-400">No source data yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sourceData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="source"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 10) + '...' : v}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="active" stackId="a" fill={STATUS_COLORS.active} name="Active" />
                    <Bar dataKey="hired" stackId="a" fill={STATUS_COLORS.hired} name="Hired" />
                    <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
