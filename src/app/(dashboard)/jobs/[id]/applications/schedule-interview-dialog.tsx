'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getJobScorecards, getScorecards } from '@/lib/services/scorecards'
import { INTERVIEW_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList, X, AlertCircle } from 'lucide-react'

interface ScheduleInterviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  candidateName: string
  candidateEmail: string
  jobTitle: string
  jobId?: string
  jobDescription?: string
  onSuccess?: () => void
}

interface ScorecardOption {
  id: string
  title: string
  label: string | null
  description: string | null
  scorecard_template_criteria: Array<{ name: string; rating_type: string; category: string | null }>
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

/** Format scorecard display name: "{Title} - {Label}" or "{Title}" */
function formatScorecardName(sc: ScorecardOption) {
  if (sc.label) return `${sc.title} - ${sc.label}`
  return sc.title
}

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  candidateEmail,
  jobTitle,
  jobId,
  jobDescription,
  onSuccess,
}: ScheduleInterviewDialogProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('video')
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState('')
  const [selectedInterviewers, setSelectedInterviewers] = useState<Member[]>([])
  const [inputValue, setInputValue] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [scorecardId, setScorecardId] = useState<string>('')
  const [scorecards, setScorecards] = useState<ScorecardOption[]>([])
  const [interviewLocations, setInterviewLocations] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Member suggestions
  const [members, setMembers] = useState<Member[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch members and interview locations once when dialog opens
  useEffect(() => {
    if (!open) return
    fetch('/api/members')
      .then((r) => r.json())
      .then(({ data }) => { if (data) setMembers(data) })
      .catch(() => {})
    fetch('/api/interview-locations')
      .then((r) => r.json())
      .then(({ data }) => { if (data) setInterviewLocations(data) })
      .catch(() => {})
  }, [open])

  // Load scorecards: prefer job-specific, fall back to org templates
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('organization_members')
      .select('organization_id')
      .limit(1)
      .single()
      .then(({ data: mem }: { data: { organization_id: string } | null }) => {
        if (!mem) return
        if (jobId) {
          // Try job-specific scorecards first
          getJobScorecards(supabase, jobId, mem.organization_id).then(({ data }) => {
            if (data && data.length > 0) {
              setScorecards(data as ScorecardOption[])
            } else {
              // Fall back to org templates if no job scorecards assigned
              getScorecards(supabase, mem.organization_id, true).then(({ data: orgData }) => {
                if (orgData) setScorecards(orgData as ScorecardOption[])
              })
            }
          })
        } else {
          // No jobId provided, use org templates
          getScorecards(supabase, mem.organization_id, true).then(({ data }) => {
            if (data) setScorecards(data as ScorecardOption[])
          })
        }
      })
  }, [open, jobId])

  const activeDuration = customDuration ? Number(customDuration) : duration

  // Filter members: exclude already-selected ones
  const selectedIds = new Set(selectedInterviewers.map((m) => m.user_id))
  const query = inputValue.includes('@')
    ? inputValue.split('@').slice(-1)[0]
    : inputValue
  const filtered = members.filter((m) =>
    !selectedIds.has(m.user_id) && (
      m.email.toLowerCase().includes(query.toLowerCase()) ||
      m.full_name.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 6)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  /** Add a raw email as a chip (for external emails not in member list) */
  function addEmailAsChip(email: string) {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return false
    if (!emailRegex.test(trimmed)) return false
    // Skip if already selected
    const alreadySelected = selectedInterviewers.some((m) => m.email.toLowerCase() === trimmed)
    if (alreadySelected) return true // consumed but skip duplicate
    setSelectedInterviewers((prev) => [...prev, {
      user_id: `ext-${trimmed}`, // external marker
      email: trimmed,
      full_name: trimmed.split('@')[0],
      role: 'external',
    }])
    return true
  }

  function handleInputChange(value: string) {
    // Support comma/semicolon separated emails (e.g. paste "a@x.com, b@x.com")
    if (value.includes(',') || value.includes(';')) {
      const parts = value.split(/[,;]/)
      // Add all complete parts as chips, keep last part as input
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].trim()
        if (part) {
          // Try matching a member first
          const matchedMember = members.find((m) =>
            !selectedIds.has(m.user_id) &&
            m.email.toLowerCase() === part.toLowerCase()
          )
          if (matchedMember) {
            selectMember(matchedMember)
          } else {
            addEmailAsChip(part)
          }
        }
      }
      const remaining = parts[parts.length - 1].trim()
      setInputValue(remaining)
      setShowSuggestions(remaining.length > 0 && filtered.length > 0)
      setActiveIndex(0)
      return
    }
    setInputValue(value)
    setShowSuggestions(value.length > 0 && filtered.length > 0)
    setActiveIndex(0)
  }

  function selectMember(member: Member) {
    setSelectedInterviewers((prev) => [...prev, member])
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  function removeMember(userId: string) {
    setSelectedInterviewers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Backspace on empty input removes last chip
    if (e.key === 'Backspace' && inputValue === '' && selectedInterviewers.length > 0) {
      setSelectedInterviewers((prev) => prev.slice(0, -1))
      return
    }

    // Enter/Tab with dropdown open → select from dropdown
    if ((e.key === 'Enter' || e.key === 'Tab') && showSuggestions && filtered.length > 0) {
      e.preventDefault()
      selectMember(filtered[activeIndex])
      return
    }

    // Enter/Tab with no dropdown → add typed email as chip
    if ((e.key === 'Enter' || e.key === 'Tab') && inputValue.trim()) {
      e.preventDefault()
      const trimmed = inputValue.trim()
      // Try matching a member first
      const matchedMember = members.find((m) =>
        !selectedIds.has(m.user_id) &&
        m.email.toLowerCase() === trimmed.toLowerCase()
      )
      if (matchedMember) {
        selectMember(matchedMember)
      } else if (emailRegex.test(trimmed)) {
        addEmailAsChip(trimmed)
        setInputValue('')
        setShowSuggestions(false)
      } else {
        setError('Please enter a valid email address')
      }
      return
    }

    if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
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
    if (!scorecardId || scorecardId === 'none') {
      setError('Please select an interview round'); return
    }
    if (!date) { setError('Date and time is required'); return }
    if (new Date(date) <= new Date()) { setError('Cannot schedule an interview in the past'); return }
    if (type === 'onsite' && !location.trim()) { setError('Location is required for face to face interviews'); return }

    // Title comes from the selected scorecard
    const selected = scorecards.find((s) => s.id === scorecardId)
    const finalTitle = selected ? formatScorecardName(selected) : ''

    if (!finalTitle) { setError('Please select an interview round'); return }

    // Validate interviewers: either chips or typed email
    const interviewerEmails: string[] = selectedInterviewers.map((m) => m.email)
    // If user typed an email but didn't select from dropdown, treat it as an email
    const trimmedInput = inputValue.trim()
    if (trimmedInput) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmedInput)) {
        setError('Please enter a valid email address or select from suggestions')
        return
      }
      // Avoid duplicates
      if (!interviewerEmails.includes(trimmedInput.toLowerCase())) {
        interviewerEmails.push(trimmedInput)
      }
    }

    if (interviewerEmails.length === 0) {
      setError('At least one interviewer is required')
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
          title: finalTitle,
          interview_type: type,
          scheduled_at: new Date(date).toISOString(),
          duration_minutes: activeDuration,
          interviewer_emails: interviewerEmails,
          candidate_email: candidateEmail,
          candidate_name: candidateName,
          job_title: jobTitle,
          job_description: jobDescription || undefined,
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
    setSelectedInterviewers([])
    setInputValue('')
    setLocation('')
    setNotes('')
    setScorecardId('')
    setError(null)
    setShowSuggestions(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            {candidateName} · {jobTitle} · A Google Meet link will be auto-generated and emailed to all parties.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded-md">{error}</div>
        )}

        <div className="space-y-5 overflow-hidden">
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
                  <p className="font-medium">No scorecards assigned to this job</p>
                  <p className="text-xs mt-0.5">Add scorecards in Job Settings to schedule interviews.</p>
                </div>
              </div>
            )}
            {scorecardId && scorecardId !== 'none' && (() => {
              const selected = scorecards.find((s) => s.id === scorecardId)
              return selected?.scorecard_template_criteria?.length ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Evaluation Criteria</p>
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

          {/* Interviewers — Multi-select with chips */}
          <div className="space-y-2">
            <Label>Interviewers <span className="text-red-500">*</span></Label>
            <div className="relative">
              {/* Selected interviewer chips + input */}
              <div
                className="flex flex-wrap gap-1.5 min-h-[36px] w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {selectedInterviewers.map((member) => (
                  <span
                    key={member.user_id}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full"
                  >
                    {member.full_name || member.email}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeMember(member.user_id) }}
                      className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (inputValue.length > 0 && filtered.length > 0) setShowSuggestions(true)
                    if (inputValue.length === 0 && filtered.length > 0) setShowSuggestions(true)
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={selectedInterviewers.length === 0 ? 'Type email or name, separate with comma…' : 'Add another…'}
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                />
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && filtered.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-52"
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
            {selectedInterviewers.length > 0 && (
              <p className="text-[11px] text-gray-400">{selectedInterviewers.length} interviewer{selectedInterviewers.length > 1 ? 's' : ''} selected</p>
            )}
          </div>

          {/* Location — only for face to face */}
          {type === 'onsite' && (
            <div className="space-y-2">
              <Label>Location <span className="text-red-500">*</span></Label>
              {interviewLocations.length > 0 ? (
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="w-full min-w-0 [&>span:first-child]:truncate [&>span:first-child]:block [&>span:first-child]:max-w-[calc(100%-1.5rem)]">
                    <SelectValue placeholder="Select interview location" />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.name}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Office, Room 3B, Building A"
                />
              )}
              {interviewLocations.length === 0 && (
                <p className="text-[11px] text-gray-400">Tip: Add locations in Settings → Locations for a quick dropdown.</p>
              )}
            </div>
          )}

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
