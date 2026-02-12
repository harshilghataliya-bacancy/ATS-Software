'use client'

import { useState } from 'react'
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
  candidateName: string
  candidateEmail: string
  jobTitle: string
  onSuccess?: () => void
}

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  candidateEmail,
  jobTitle,
  onSuccess,
}: ScheduleInterviewDialogProps) {
  const [type, setType] = useState('video')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(60)
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSchedule() {
    if (!date) {
      setError('Date and time is required')
      return
    }
    if (!interviewerEmail) {
      setError('Interviewer email is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          interview_type: type,
          scheduled_at: new Date(date).toISOString(),
          duration_minutes: duration,
          interviewer_email: interviewerEmail,
          candidate_email: candidateEmail,
          candidate_name: candidateName,
          job_title: jobTitle,
          notes: notes || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to schedule interview')
      } else {
        onOpenChange(false)
        resetForm()
        onSuccess?.()
      }
    } catch {
      setError('Failed to schedule interview')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setType('video')
    setDate('')
    setDuration(60)
    setInterviewerEmail('')
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
            A Google Meet link will be auto-generated and email notifications sent to both parties.
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
              <Label>Duration (min) *</Label>
              <Input type="number" min={15} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date & Time *</Label>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Interviewer Email *</Label>
            <Input
              type="email"
              value={interviewerEmail}
              onChange={(e) => setInterviewerEmail(e.target.value)}
              placeholder="interviewer@company.com"
            />
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
