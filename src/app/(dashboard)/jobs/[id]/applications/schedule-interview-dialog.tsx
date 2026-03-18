'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getScorecards } from '@/lib/services/scorecards'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList } from 'lucide-react'

interface ScheduleInterviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  candidateName: string
  candidateEmail: string
  jobTitle: string
  onSuccess?: () => void
}

interface ScorecardOption {
  id: string
  title: string
  description: string | null
  scorecard_template_criteria: Array<{ name: string; rating_type: string }>
}

interface Member {
  user_id: string
  email: string
  full_name: string
  role: string
}

const DURATION_PRESETS = [30, 45, 60, 90]

const TYPE_ICONS: Record<string, React.ReactNode> = {
  video: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  onsite: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
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
  const [title, setTitle] = useState('')
  const [type, setType] = useState('video')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState('')
  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [scorecardId, setScorecardId] = useState<string>('')
  const [scorecards, setScorecards] = useState<ScorecardOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Member suggestions
  const [members, setMembers] = useState<Member[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch members once when dialog opens
  useEffect(() => {
    if (!open) return
    fetch('/api/members')
      .then((r) => r.json())
      .then(({ data }) => { if (data) setMembers(data) })
      .catch(() => {})
  }, [open])

  // Load available scorecards
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('organization_members')
      .select('organization_id')
      .limit(1)
      .single()
      .then(({ data: mem }: { data: { organization_id: string } | null }) => {
        if (mem) {
          getScorecards(supabase, mem.organization_id, true).then(({ data }) => {
            if (data) setScorecards(data as ScorecardOption[])
          })
        }
      })
  }, [open])

  const activeDuration = customDuration ? Number(customDuration) : duration

  // Filter members based on input
  const query = interviewerEmail.includes('@')
    ? interviewerEmail.split('@').slice(-1)[0]  // text after last @
    : interviewerEmail
  const filtered = members.filter((m) =>
    m.email.toLowerCase().includes(query.toLowerCase()) ||
    m.full_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6)

  function handleEmailChange(value: string) {
    setInterviewerEmail(value)
    setShowSuggestions(value.length > 0 && filtered.length > 0)
    setActiveIndex(0)
  }

  function selectMember(member: Member) {
    setInterviewerEmail(member.email)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectMember(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  function getLocalNow() {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  async function handleSchedule() {
    if (!title.trim()) { setError('Interview name is required'); return }
    if (!date) { setError('Date and time is required'); return }
    if (new Date(date) <= new Date()) { setError('Cannot schedule an interview in the past'); return }
    if (type === 'onsite' && !location.trim()) { setError('Location is required for face to face interviews'); return }
    if (!interviewerEmail) { setError('Interviewer email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interviewerEmail)) { setError('Please enter a valid email address'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          title: title.trim(),
          interview_type: type,
          scheduled_at: new Date(date).toISOString(),
          duration_minutes: activeDuration,
          interviewer_email: interviewerEmail,
          candidate_email: candidateEmail,
          candidate_name: candidateName,
          job_title: jobTitle,
          location: type === 'onsite' ? location.trim() : undefined,
          notes: notes || undefined,
          scorecard_id: scorecardId && scorecardId !== 'none' ? scorecardId : undefined,
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
    setTitle('')
    setType('video')
    setDate('')
    setDuration(60)
    setCustomDuration('')
    setInterviewerEmail('')
    setLocation('')
    setNotes('')
    setScorecardId('')
    setError(null)
    setShowSuggestions(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            {candidateName} · {jobTitle} · A Google Meet link will be auto-generated and emailed to both parties.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded-md">{error}</div>
        )}

        <div className="space-y-5">
          {/* Interview Name */}
          <div className="space-y-2">
            <Label>Interview Name <span className="text-red-500">*</span></Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Technical Round 1, HR Screening"
            />
          </div>

          {/* Interview Type — 2 options */}
          <div className="space-y-2">
            <Label>Interview Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {INTERVIEW_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                    type === t.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {TYPE_ICONS[t.value] ?? null}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date & Time *</Label>
              <input
                type="datetime-local"
                value={date}
                min={getLocalNow()}
                onChange={(e) => setDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex gap-1">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDuration(d); setCustomDuration('') }}
                    className={`flex-1 h-9 rounded-md text-xs font-medium border transition-all ${
                      duration === d && !customDuration
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {d < 60 ? `${d}m` : `${d / 60}h`}
                  </button>
                ))}
                <input
                  type="number"
                  min={15}
                  max={480}
                  placeholder="min"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className={`flex-1 h-9 w-0 rounded-md border text-xs text-center transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    customDuration
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-transparent border-input text-gray-700 placeholder:text-gray-300'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Interviewer Email with member suggestions */}
          <div className="space-y-2">
            <Label>Interviewer Email *</Label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={interviewerEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (interviewerEmail.length > 0 && filtered.length > 0) setShowSuggestions(true)
                  if (interviewerEmail.length === 0 && members.length > 0) setShowSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Type @ to search team members…"
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />

              {/* Suggestions dropdown */}
              {showSuggestions && filtered.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                >
                  {filtered.map((member, idx) => (
                    <button
                      key={member.user_id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectMember(member) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        idx === activeIndex ? 'bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {(member.full_name || member.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{member.full_name}</p>
                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 capitalize shrink-0">{member.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Location — only for face to face */}
          {type === 'onsite' && (
            <div className="space-y-2">
              <Label>Location <span className="text-red-500">*</span></Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Office, Room 3B, Building A"
              />
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
            {scorecardId && scorecardId !== 'none' && (() => {
              const selected = scorecards.find((s) => s.id === scorecardId)
              return selected?.scorecard_template_criteria?.length ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Criteria Preview</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.scorecard_template_criteria.map((c, i) => (
                      <span key={i} className="text-[10px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Topics to cover, preparation notes…"
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1 gap-1.5" onClick={handleSchedule} disabled={saving}>
              {saving ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scheduling…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Schedule Interview
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
