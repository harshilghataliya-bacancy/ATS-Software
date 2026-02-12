'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createInterview } from '@/lib/services/interviews'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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
  const [type, setType] = useState('video')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(60)
  const [location, setLocation] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSchedule() {
    if (!date) {
      setError('Date and time is required')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: createError } = await createInterview(
      supabase,
      orgId,
      {
        application_id: applicationId,
        interview_type: type,
        scheduled_at: new Date(date).toISOString(),
        duration_minutes: duration,
        location: location || undefined,
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
    setError(null)
  }

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
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, Room 3B" />
            </div>
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." />
            </div>
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
