'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getHiringVelocity,
  getPipelineConversion,
  getOfferAcceptanceRate,
} from '@/lib/services/reports'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DashboardCharts({ orgId }: { orgId: string }) {
  const [velocity, setVelocity] = useState<Array<{ month: string; hires: number }>>([])
  const [pipeline, setPipeline] = useState<Array<{ stage_name: string; current_count: number }>>([])
  const [offerRate, setOfferRate] = useState<{ accepted: number; declined: number; total_sent: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCharts = useCallback(async () => {
    const supabase = createClient()

    const [velocityResult, pipelineResult, offerResult] = await Promise.all([
      getHiringVelocity(supabase, orgId),
      getPipelineConversion(supabase, orgId),
      getOfferAcceptanceRate(supabase, orgId),
    ])

    if (velocityResult.data) setVelocity(velocityResult.data)
    if (pipelineResult.data) setPipeline(pipelineResult.data)
    if (offerResult.data) setOfferRate(offerResult.data)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Hiring Velocity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Hiring Velocity</CardTitle>
          <CardDescription className="text-xs">Hires per month (last 6 months)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : velocity.every((v) => v.hires === 0) ? (
            <p className="text-sm text-gray-500 text-center py-16">No hires recorded yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={velocity} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hiresGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(v) => {
                    const s = String(v)
                    const [y, m] = s.split('-')
                    return `${MONTHS[parseInt(m) - 1]} ${y}`
                  }}
                />
                <Area type="monotone" dataKey="hires" stroke="#6366f1" fill="url(#hiresGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Snapshot</CardTitle>
          <CardDescription className="text-xs">Active candidates by stage</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : pipeline.length === 0 || pipeline.every((p) => p.current_count === 0) ? (
            <p className="text-sm text-gray-500 text-center py-16">No pipeline data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pipeline} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage_name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="current_count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Candidates" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Offer Outcomes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Offer Outcomes</CardTitle>
          <CardDescription className="text-xs">Acceptance vs decline rate</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : !offerRate || offerRate.total_sent === 0 ? (
            <p className="text-sm text-gray-500 text-center py-16">No offers sent yet</p>
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
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#ef4444" />
                    <Cell fill="#d1d5db" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  <span className="text-gray-600">Accepted ({offerRate.accepted})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  <span className="text-gray-600">Declined ({offerRate.declined})</span>
                </div>
                {offerRate.total_sent - offerRate.accepted - offerRate.declined > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
                    <span className="text-gray-600">Pending ({offerRate.total_sent - offerRate.accepted - offerRate.declined})</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
