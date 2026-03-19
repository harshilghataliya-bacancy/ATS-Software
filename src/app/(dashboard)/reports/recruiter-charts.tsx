'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { BarChart3 } from 'lucide-react'

interface RecruiterChartData {
  name: string
  applications: number
  offers: number
  hired: number
  rejected: number
  avg_days: number
}

interface RecruiterChartsProps {
  data: RecruiterChartData[]
  isSingleRecruiter?: boolean
}

const COLORS = {
  applications: '#3b82f6',
  offers: '#8b5cf6',
  hired: '#22c55e',
  rejected: '#ef4444',
  avg_days: '#f59e0b',
}

const tooltipStyle = { borderRadius: 10, fontSize: 11, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }

export default function RecruiterCharts({ data, isSingleRecruiter }: RecruiterChartsProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12">
        <div className="flex flex-col items-center justify-center text-gray-300">
          <BarChart3 className="w-8 h-8 mb-2" />
          <p className="text-[11px] text-gray-400">No recruiter data to display</p>
        </div>
      </div>
    )
  }

  if (isSingleRecruiter && data.length === 1) {
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
        <BarChart3 className="w-4 h-4 text-gray-400" />
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900">Recruiter Comparison</h3>
          <p className="text-[10px] text-gray-400">Key metrics across team members</p>
        </div>
      </div>
      <div className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={Math.max(260, data.length * 68)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              width={95}
              tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v}
              axisLine={false} tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              {...{ payload: [
                { value: 'Applications', type: 'rect', color: COLORS.applications },
                { value: 'Offers', type: 'rect', color: COLORS.offers },
                { value: 'Hired', type: 'rect', color: COLORS.hired },
                { value: 'Rejected', type: 'rect', color: COLORS.rejected },
                { value: 'Avg Days', type: 'rect', color: COLORS.avg_days },
              ] } as any}
            />
            <Bar dataKey="applications" fill={COLORS.applications} name="Applications" radius={[0, 4, 4, 0]} />
            <Bar dataKey="offers" fill={COLORS.offers} name="Offers" radius={[0, 4, 4, 0]} />
            <Bar dataKey="hired" fill={COLORS.hired} name="Hired" radius={[0, 4, 4, 0]} />
            <Bar dataKey="rejected" fill={COLORS.rejected} name="Rejected" radius={[0, 4, 4, 0]} />
            <Bar dataKey="avg_days" fill={COLORS.avg_days} name="Avg Days" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
