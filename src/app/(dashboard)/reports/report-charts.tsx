'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const OFFER_COLORS = { accepted: '#22c55e', declined: '#ef4444', pending: '#f59e0b', expired: '#9ca3af' }

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

interface OfferRate {
  total_sent: number
  accepted: number
  declined: number
  acceptance_rate_pct: number
}

interface ReportChartsProps {
  pipeline: PipelineStage[]
  offerRate: OfferRate | null
  velocity: VelocityPoint[]
  timeToHire: TimeToHireData | null
}

export default function ReportCharts({ pipeline, offerRate, velocity, timeToHire }: ReportChartsProps) {
  const offerData = offerRate
    ? [
        { name: 'Accepted', value: offerRate.accepted, color: OFFER_COLORS.accepted },
        { name: 'Declined', value: offerRate.declined, color: OFFER_COLORS.declined },
        { name: 'Pending', value: offerRate.total_sent - offerRate.accepted - offerRate.declined, color: OFFER_COLORS.pending },
      ].filter((d) => d.value > 0)
    : []

  return (
    <>
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

        {/* Offer Outcomes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Offer Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            {!offerRate || offerRate.total_sent === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">No offers sent yet</p>
            ) : (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={offerData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {offerData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
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
    </>
  )
}
