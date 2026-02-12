'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAggregatedScorecard } from '@/lib/services/feedback'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RECOMMENDATION_OPTIONS } from '@/lib/constants'

interface ScorecardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  candidateName: string
  orgId: string
}

interface CriteriaResult {
  name: string
  weight: number
  avg_rating: number
  ratings_by_interviewer: Array<{ user_id: string; rating: number }>
}

interface ScorecardData {
  criteria: CriteriaResult[]
  overall_avg: number
  feedback_count: number
  recommendation_counts: Record<string, number>
}

export function ScorecardDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  orgId,
}: ScorecardDialogProps) {
  const [data, setData] = useState<ScorecardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const supabase = createClient()
    getAggregatedScorecard(supabase, applicationId, orgId).then((result) => {
      if (result.data) setData(result.data)
      setLoading(false)
    })
  }, [open, applicationId, orgId])

  function getConsensusColor(ratings: Array<{ rating: number }>) {
    if (ratings.length < 2) return 'text-gray-400'
    const max = Math.max(...ratings.map((r) => r.rating))
    const min = Math.min(...ratings.map((r) => r.rating))
    const spread = max - min
    if (spread <= 1) return 'text-green-600'
    return 'text-yellow-600'
  }

  function renderStars(rating: number) {
    return (
      <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={`text-sm ${star <= Math.round(rating) ? 'text-yellow-500' : 'text-gray-200'}`}>
            &#9733;
          </span>
        ))}
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scorecard: {candidateName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-32" />
          </div>
        ) : !data ? (
          <p className="text-sm text-gray-500 text-center py-8">No feedback submitted yet</p>
        ) : (
          <div className="space-y-4">
            {/* Overall Score */}
            <div className="flex items-center gap-4 bg-gray-50 rounded-lg p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">{data.overall_avg}</p>
                <div>{renderStars(data.overall_avg)}</div>
              </div>
              <div className="text-sm text-gray-500">
                <p>Weighted average across {data.criteria.length} criteria</p>
                <p>{data.feedback_count} interviewer{data.feedback_count !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Criteria Table */}
            {data.criteria.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Criteria</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center">Weight</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center">Avg</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center">Consensus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.criteria.map((c, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className="text-[10px]">{c.weight}</Badge>
                        </td>
                        <td className="px-3 py-2 text-center font-medium">{c.avg_rating}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={getConsensusColor(c.ratings_by_interviewer)}>
                            {c.ratings_by_interviewer.length < 2
                              ? '-'
                              : Math.max(...c.ratings_by_interviewer.map((r) => r.rating)) -
                                  Math.min(...c.ratings_by_interviewer.map((r) => r.rating)) <=
                                1
                                ? 'Aligned'
                                : 'Divergent'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recommendation Summary */}
            {Object.keys(data.recommendation_counts).length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Recommendations</p>
                <div className="flex gap-2 flex-wrap">
                  {RECOMMENDATION_OPTIONS.map((opt) => {
                    const count = data.recommendation_counts[opt.value] ?? 0
                    if (count === 0) return null
                    return (
                      <span key={opt.value} className={`text-xs px-2 py-1 rounded ${opt.color}`}>
                        {opt.label}: {count}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
