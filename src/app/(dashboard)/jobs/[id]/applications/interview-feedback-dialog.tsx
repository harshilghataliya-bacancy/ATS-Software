'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getFeedbackForApplication } from '@/lib/services/feedback'
import { RECOMMENDATION_OPTIONS, RATING_LABELS } from '@/lib/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface InterviewFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  candidateName: string
  orgId: string
}

interface FeedbackItem {
  id: string
  overall_rating: number
  recommendation: string
  strengths?: string | null
  weaknesses?: string | null
  notes?: string | null
  created_at: string
  interview?: {
    id: string
    interview_type: string
    scheduled_at: string
  } | null
}

export function InterviewFeedbackDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  orgId,
}: InterviewFeedbackDialogProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)

    const supabase = createClient()
    getFeedbackForApplication(supabase, applicationId, orgId).then(({ data }) => {
      setFeedback((data as FeedbackItem[]) ?? [])
      setLoading(false)
    })
  }, [open, applicationId, orgId])

  const recOption = (value: string) =>
    RECOMMENDATION_OPTIONS.find((r) => r.value === value)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Interview Feedback — {candidateName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : feedback.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            No feedback submitted yet.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-5">
              {feedback.map((fb) => {
                const rec = recOption(fb.recommendation)
                return (
                  <div key={fb.id} className="border rounded-lg p-4 space-y-3">
                    {/* Interview header */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm capitalize">
                        {fb.interview?.interview_type?.replace(/_/g, ' ') ?? 'Interview'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {fb.interview?.scheduled_at
                          ? new Date(fb.interview.scheduled_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : ''}
                      </span>
                    </div>

                    {/* Rating + Recommendation */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={
                              star <= fb.overall_rating
                                ? 'text-yellow-400'
                                : 'text-gray-200'
                            }
                          >
                            ★
                          </span>
                        ))}
                        <span className="text-xs text-gray-500 ml-1">
                          {RATING_LABELS[fb.overall_rating] ?? ''}
                        </span>
                      </div>
                      {rec && (
                        <Badge variant="outline" className={`text-xs ${rec.color}`}>
                          {rec.label}
                        </Badge>
                      )}
                    </div>

                    {/* Text blocks */}
                    {fb.strengths && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Strengths</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.strengths}</p>
                      </div>
                    )}
                    {fb.weaknesses && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Weaknesses</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.weaknesses}</p>
                      </div>
                    )}
                    {fb.notes && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Notes</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.notes}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
