'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
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

/* ── Shared chart wrapper ── */
function ChartCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
        <span className="text-gray-400">{icon}</span>
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
          <p className="text-[10px] text-gray-400">{description}</p>
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-300">
      {icon}
      <p className="text-[11px] text-gray-400 mt-2">{label}</p>
    </div>
  )
}

const tooltipStyle = { borderRadius: 10, fontSize: 11, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }

export default function ReportCharts({ pipeline, jobStatusData, velocity, timeToHire, sourceData, selectedJobTitle }: ReportChartsProps) {
  return (
    <>
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <ChartCard icon={<Filter className="w-4 h-4" />} title="Pipeline Funnel" description="Candidates currently at each stage">
          {pipeline.length === 0 ? (
            <EmptyState icon={<Filter className="w-8 h-8" />} label="No pipeline data yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(260, pipeline.length * 44)}>
                <BarChart data={pipeline} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis dataKey="stage_name" type="category" width={85} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [value, name]}
                  />
                  <Bar dataKey="current_count" fill="#818cf8" name="Currently In" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 px-1">
                {pipeline.map((s) => (
                  <span key={s.stage_name} className="text-[10px] text-gray-400">
                    {s.stage_name}: <span className="font-semibold text-gray-600">{s.current_count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        {/* Application Status by Job */}
        <ChartCard icon={<Briefcase className="w-4 h-4" />} title={selectedJobTitle ? `Applications: ${selectedJobTitle}` : 'Application Status by Job'} description="Active, hired, and rejected per job">
          {jobStatusData.length === 0 ? (
            <EmptyState icon={<Briefcase className="w-8 h-8" />} label="No application data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, jobStatusData.length * 38)}>
              <BarChart data={jobStatusData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="job_title"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  width={110}
                  tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 14) + '…' : v}
                  axisLine={false} tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="active" stackId="a" fill={STATUS_COLORS.active} name="Active" />
                <Bar dataKey="hired" stackId="a" fill={STATUS_COLORS.hired} name="Hired" />
                <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hiring Velocity */}
        <ChartCard icon={<TrendingUp className="w-4 h-4" />} title="Hiring Velocity" description="Monthly hires over the last 6 months">
          {velocity.length === 0 || velocity.every((v) => v.hires === 0) ? (
            <EmptyState icon={<TrendingUp className="w-8 h-8" />} label="No hiring data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={velocity} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(v: string) => {
                    const [, m] = v.split('-')
                    return MONTHS[parseInt(m) - 1]
                  }}
                  axisLine={false} tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
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
                  dot={{ r: 3.5, fill: '#10b981', strokeWidth: 0 }}
                  name="Hires"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Time-to-Hire by Department */}
        <ChartCard icon={<Clock className="w-4 h-4" />} title="Time-to-Hire by Department" description="Average days from application to hire">
          {!timeToHire || timeToHire.breakdown.length === 0 ? (
            <EmptyState icon={<Clock className="w-8 h-8" />} label="No hire data by department yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timeToHire.breakdown} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="deptGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' } }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${value} days`, 'Avg Time-to-Hire']}
                />
                <Bar dataKey="average_days" fill="url(#deptGradient)" name="Avg Days" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 3 — Source Effectiveness */}
      {sourceData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Source Pie Chart */}
          <ChartCard icon={<Globe className="w-4 h-4" />} title="Source Distribution" description="Where your candidates come from">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={sourceData}
                  dataKey="total"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={40}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={({ source, total }: any) => `${source} (${total})`}
                  labelLine={{ strokeWidth: 1, stroke: '#d1d5db' }}
                >
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, _: any, entry: any) => {
                    const d = entry.payload
                    return [`Total: ${d.total} | Hired: ${d.hired} | Hire Rate: ${d.hire_rate}%`, d.source]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Source Effectiveness Bar Chart */}
          <ChartCard icon={<Globe className="w-4 h-4" />} title="Source Effectiveness" description="Hire rate and volume by source">
            {sourceData.every((s) => s.total === 0) ? (
              <EmptyState icon={<Globe className="w-8 h-8" />} label="No source data yet" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sourceData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis
                    dataKey="source"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 10) + '…' : v}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="active" stackId="a" fill={STATUS_COLORS.active} name="Active" />
                  <Bar dataKey="hired" stackId="a" fill={STATUS_COLORS.hired} name="Hired" />
                  <Bar dataKey="rejected" stackId="a" fill={STATUS_COLORS.rejected} name="Rejected" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </>
  )
}
