'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function RecruiterCharts({ data, isSingleRecruiter }: RecruiterChartsProps) {
  if (data.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-gray-300">
            <BarChart3 className="w-10 h-10 mb-2" />
            <p className="text-sm text-gray-400">No recruiter data to display</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Single recruiter: not shown (removed per user request)
  if (isSingleRecruiter && data.length === 1) {
    return null
  }

  // Multi-recruiter: horizontal grouped bar chart comparing recruiters
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Recruiter Comparison</CardTitle>
        <CardDescription className="text-xs">
          Key metrics across team members
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(280, data.length * 72)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11 }}
              width={100}
              tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '...' : v}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
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
      </CardContent>
    </Card>
  )
}
