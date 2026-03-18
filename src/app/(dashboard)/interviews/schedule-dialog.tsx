'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createInterview } from '@/lib/services/interviews'
import { getScorecards } from '@/lib/services/scorecards'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList } from 'lucide-react'

interface ScorecardOption {
  id: string
  title: string
  description: string | null
  scorecard_template_criteria: Array<{ name: string; rating_type: string }>
}

interface ScheduleInterviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  orgId: string
  userId: string
  candidateName: string
  jobTitle: string
  onSuccess?: () => void
}

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  orgId,
  userId,
  candidateName,
  jobTitle,
  onSuccess,
}: ScheduleInterviewDialogProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('video')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(60)
  const [location, setLocation] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [notes, setNotes] = useState('')
  const [scorecardId, setScorecardId] = useState<string>('')
  const [scorecards, setScorecards] = useState<ScorecardOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available scorecards
  useEffect(() => {
    if (!open || !orgId) return
    const supabase = createClient()
    getScorecards(supabase, orgId, true).then(({ data }) => {
      if (data) setScorecards(data as ScorecardOption[])
    })
  }, [open, orgId])

  function getLocalNow() {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  async function handleSchedule() {
    if (!title.trim()) {
      setError('Interview name is required')
      return
    }
    if (!date) {
      setError('Date and time is required')
      return
    }
    if (new Date(date) <= new Date()) {
      setError('Cannot schedule an interview in the past')
      return
    }
    if (type === 'onsite' && !location.trim()) {
      setError('Location is required for face to face interviews')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: interview, error: createError } = await createInterview(
      supabase,
      orgId,
      {
        application_id: applicationId,
        title: title.trim(),
        interview_type: type,
        scheduled_at: new Date(date).toISOString(),
        duration_minutes: duration,
        location: type === 'onsite' ? location.trim() : (location || undefined),
        meeting_link: meetingLink || undefined,
        notes: notes || undefined,
        panelists: [{ user_id: userId, role: 'interviewer' }],
      },
      userId
    )

    if (createError) {
      console.error('[Schedule Interview Error]', createError)
      setError(createError.message ?? 'Failed to schedule interview')
    } else {
      // Link scorecard to interview if selected
      if (scorecardId && scorecardId !== 'none' && interview?.id) {
        await supabase
          .from('interviews')
          .update({ scorecard_id: scorecardId })
          .eq('id', interview.id)
      }
      onOpenChange(false)
      resetForm()
      onSuccess?.()
    }
    setSaving(false)
  }

  function resetForm() {
    setTitle('')
    setType('video')
    setDate('')
    setDuration(60)
    setLocation('')
    setMeetingLink('')
    setNotes('')
    setScorecardId('')
    setError(null)
  }

  const selectedScorecard = scorecardId && scorecardId !== 'none' ? scorecards.find((s) => s.id === scorecardId) : null

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            Schedule an interview with {candidateName} for {jobTitle}.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Interview Name <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Technical Round 1, HR Screening" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVIEW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input type="number" min={15} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date & Time *</Label>
            <Input type="datetime-local" value={date} min={getLocalNow()} onChange={(e) => setDate(e.target.value)} />
          </div>

          {type === 'onsite' && (
            <div className="space-y-2">
              <Label>Location <span className="text-red-500">*</span></Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Office, Room 3B, Building A" />
            </div>
          )}

          {/* Scorecard Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
              Evaluation Scorecard
            </Label>
            <Select value={scorecardId} onValueChange={setScorecardId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scorecard (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No scorecard</SelectItem>
                {scorecards.map((sc) => (
                  <SelectItem key={sc.id} value={sc.id}>
                    {sc.title}
                    {sc.scorecard_template_criteria?.length > 0 && (
                      <span className="text-gray-400 ml-1">
                        ({sc.scorecard_template_criteria.length} criteria)
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedScorecard && selectedScorecard.scorecard_template_criteria?.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Criteria Preview</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedScorecard.scorecard_template_criteria.map((c, i) => (
                    <span key={i} className="text-[10px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interview preparation notes..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={saving}>
            {saving ? 'Scheduling...' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
