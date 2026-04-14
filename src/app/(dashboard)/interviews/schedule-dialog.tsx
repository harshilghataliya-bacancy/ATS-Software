'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createInterview } from '@/lib/services/interviews'
import { getJobScorecards, getScorecards } from '@/lib/services/scorecards'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList, AlertCircle } from 'lucide-react'

interface ScorecardOption {
  id: string
  title: string
  label: string | null
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
  jobId?: string
  onSuccess?: () => void
}

function formatScorecardName(sc: ScorecardOption) {
  if (sc.label) return `${sc.title} - ${sc.label}`
  return sc.title
}

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  orgId,
  userId,
  candidateName,
  jobTitle,
  jobId,
  onSuccess,
}: ScheduleInterviewDialogProps) {
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

  // Load available scorecards: prefer job-specific, fall back to org templates
  useEffect(() => {
    if (!open || !orgId) return
    const supabase = createClient()
    if (jobId) {
      getJobScorecards(supabase, jobId, orgId).then(({ data }) => {
        if (data && data.length > 0) {
          setScorecards(data as ScorecardOption[])
        } else {
          getScorecards(supabase, orgId, true).then(({ data: orgData }) => {
            if (orgData) setScorecards(orgData as ScorecardOption[])
          })
        }
      })
    } else {
      getScorecards(supabase, orgId, true).then(({ data }) => {
        if (data) setScorecards(data as ScorecardOption[])
      })
    }
  }, [open, orgId, jobId])

  function getLocalNow() {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  async function handleSchedule() {
    if (!scorecardId || scorecardId === 'none') {
      setError('Please select an interview round')
      return
    }

    // Title comes from the selected scorecard
    const selectedSc = scorecards.find((s) => s.id === scorecardId)
    const finalTitle = selectedSc ? formatScorecardName(selectedSc) : ''

    if (!finalTitle) {
      setError('Please select an interview round')
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
        title: finalTitle,
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
          {/* Interview Round (single dropdown showing scorecard names) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
              Interview Round <span className="text-red-500">*</span>
            </Label>
            {scorecards.length > 0 ? (
              <Select value={scorecardId} onValueChange={setScorecardId}>
                <SelectTrigger className="focus:ring-0 focus:ring-offset-0 focus:border-blue-500">
                  <SelectValue placeholder="Select interview round" />
                </SelectTrigger>
                <SelectContent>
                  {scorecards.map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {formatScorecardName(sc)}
                      {sc.scorecard_template_criteria?.length > 0 && (
                        <span className="text-gray-400 ml-1">
                          ({sc.scorecard_template_criteria.length} criteria)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-700">
                  <p className="font-medium">No scorecards available</p>
                  <p className="text-xs mt-0.5">Add scorecards to this job or create org templates in Settings.</p>
                </div>
              </div>
            )}
            {selectedScorecard && selectedScorecard.scorecard_template_criteria?.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Evaluation Criteria</p>
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
