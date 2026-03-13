'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getCandidateById, updateCandidate } from '@/lib/services/candidates'
import { createApplication } from '@/lib/services/applications'
import { getCandidateActivityLog } from '@/lib/services/activity'
import { getJobs } from '@/lib/services/jobs'
import { CANDIDATE_SOURCES } from '@/lib/constants'
import { EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { LocationInput } from '@/components/ui/location-input'
import { SendEmailDialog } from '@/components/email/send-email-dialog'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { ResumeUpload } from './resume-upload'
import { ArrowLeft, Mail, MapPin, Download, PenLine, Briefcase, ArrowRightLeft, XCircle, ExternalLink, FileText, Brain } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

interface JobOption {
  id: string
  title: string
  department: string
  status: string
}

const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-blue-100 text-blue-800',
  screening: 'bg-yellow-100 text-yellow-800',
  interview: 'bg-purple-100 text-purple-800',
  offer: 'bg-emerald-100 text-emerald-800',
  hired: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  withdrawn: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
  hired: 'bg-emerald-100 text-emerald-800',
}

export default function CandidateDetailPage() {
  const params = useParams()
  const { user, organization, isLoading: userLoading } = useUser()
  const { canManageCandidates } = useRole()

  const [candidate, setCandidate] = useState<AnyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [editing, setEditing] = useState(false)

  // Apply to job
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJob, setSelectedJob] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)

  // AI scores (keyed by application_id)
  const [aiScores, setAiScores] = useState<Record<string, AnyData>>({})

  // Email dialog
  const [emailOpen, setEmailOpen] = useState(false)

  // Reject
  const [rejectingAppId, setRejectingAppId] = useState<string | null>(null)

  // Move to Job
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveAppId, setMoveAppId] = useState<string | null>(null)
  const [moveTargetJob, setMoveTargetJob] = useState<string>('')
  const [moving, setMoving] = useState(false)
  const [moveCurrentJobId, setMoveCurrentJobId] = useState<string | null>(null)

  // Activity log
  const [activityLogs, setActivityLogs] = useState<AnyData[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Edit form state
  const [formData, setFormData] = useState<AnyData>({})

  const loadCandidate = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getCandidateById(
      supabase, params.id as string, organization.id
    )
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      setCandidate(data)
      setFormData(data)

      // Fetch activity logs for this candidate (across all applications)
      setActivityLoading(true)
      const supabaseAct = createClient()
      const { data: activities } = await getCandidateActivityLog(supabaseAct, organization.id, data.id, 50)
      setActivityLogs(activities || [])
      setActivityLoading(false)

      // Fetch AI scores for all applications
      if (data.applications?.length > 0) {
        const appIds = data.applications.map((a: AnyData) => a.id)
        const { data: scores } = await supabase
          .from('candidate_match_scores')
          .select('application_id, overall_score, skill_score, experience_score, semantic_score, recommendation')
          .in('application_id', appIds)
        if (scores) {
          const map: Record<string, AnyData> = {}
          scores.forEach((s: AnyData) => { map[s.application_id] = s })
          setAiScores(map)
        }
      }
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadCandidate()
  }, [organization, loadCandidate])

  async function loadJobs() {
    if (!organization) return
    const supabase = createClient()
    const { data } = await getJobs(supabase, organization.id, { status: 'published' })
    if (data) setJobs(data as JobOption[])
  }

  async function handleSave() {
    if (!organization || !candidate) return
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please enter a valid email address')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const { data: updated, error: updateError } = await updateCandidate(
      supabase,
      candidate.id,
      organization.id,
      {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        linkedin_url: formData.linkedin_url,
        portfolio_url: formData.portfolio_url,
        current_company: formData.current_company,
        current_title: formData.current_title,
        location: formData.location,
        current_salary: formData.current_salary ? parseFloat(formData.current_salary) : null,
        expected_salary: formData.expected_salary ? parseFloat(formData.expected_salary) : null,
        education: formData.education || null,
        experience_years: formData.experience_years ? parseFloat(formData.experience_years) : null,
        notice_period: formData.notice_period || null,
        gender: formData.gender || null,
        date_of_birth: formData.date_of_birth || null,
        cover_letter: formData.cover_letter || null,
        notes: formData.notes,
      }
    )

    if (updateError) {
      setError(updateError.message)
    } else {
      setCandidate((prev) => prev ? { ...prev, ...updated } : prev)
      setFormData((prev) => ({ ...prev, ...updated }))
      setSuccess(true)
      setEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  async function handleApplyToJob() {
    if (!organization || !user || !candidate || !selectedJob) return
    setApplying(true)
    setError(null)

    const supabase = createClient()
    const { error: applyError } = await createApplication(supabase, organization.id, {
      candidate_id: candidate.id,
      job_id: selectedJob,
    })

    if (applyError) {
      setError(applyError.message)
    } else {
      setApplyDialogOpen(false)
      setSelectedJob('')
      await loadCandidate()
    }
    setApplying(false)
  }

  function openMoveDialog(applicationId: string, currentJobId: string) {
    setMoveAppId(applicationId)
    setMoveCurrentJobId(currentJobId)
    setMoveTargetJob('')
    setMoveDialogOpen(true)
    if (jobs.length === 0) loadJobs()
  }

  async function handleMoveToJob() {
    if (!moveAppId || !moveTargetJob) return
    setMoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/applications/${moveAppId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetJobId: moveTargetJob }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to move application')
      } else {
        setMoveDialogOpen(false)
        setMoveAppId(null)
        setMoveTargetJob('')
        await loadCandidate()
      }
    } catch {
      setError('Failed to move application')
    }
    setMoving(false)
  }

  async function handleRejectApplication(applicationId: string) {
    setRejectingAppId(applicationId)
    setError(null)
    try {
      const res = await fetch('/api/applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, reason: '' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to reject application')
      } else {
        await loadCandidate()
      }
    } catch {
      setError('Failed to reject application')
    }
    setRejectingAppId(null)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-60" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return <div className="text-center py-12 text-gray-500">Candidate not found</div>
  }

  const sourceLabel = CANDIDATE_SOURCES.find((s) => s.value === candidate.source)?.label ?? candidate.source
  const educationLabel = candidate.education ? (EDUCATION_LABELS[candidate.education] || candidate.education) : null
  const genderLabel = candidate.gender ? (GENDER_OPTIONS.find(g => g.value === candidate.gender)?.label || candidate.gender) : null
  const noticeLabel = candidate.notice_period ? (NOTICE_PERIOD_OPTIONS.find(n => n.value === candidate.notice_period)?.label || candidate.notice_period) : null
  const parsedResume = candidate.resume_parsed_data && Object.keys(candidate.resume_parsed_data).length > 0 ? candidate.resume_parsed_data : null

  return (
    <div className="max-w-7xl space-y-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-semibold shadow-sm shadow-blue-200">
            {candidate.first_name?.[0]}{candidate.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {candidate.first_name} {candidate.last_name}
            </h1>
            <p className="text-gray-500 text-sm">
              {candidate.current_title && candidate.current_company
                ? `${candidate.current_title} at ${candidate.current_company}`
                : candidate.current_title || candidate.email}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {candidate.location && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {candidate.location}
                </span>
              )}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{sourceLabel}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {canManageCandidates && (
          <div className="flex flex-wrap gap-2">
            {candidate.applications?.length > 0 && (
              <Link href={`/applications/${candidate.applications[0].id}`}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  View Application
                </Button>
              </Link>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEmailOpen(true)}>
              <Mail className="w-3.5 h-3.5" />
              Email
            </Button>

            {candidate.applications?.length > 0 && candidate.applications[0].status === 'active' ? (
              /* Active application — show Move to Job */
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  const app = candidate.applications[0]
                  openMoveDialog(app.id, app.job_id || app.job?.id)
                }}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Move to Job
              </Button>
            ) : candidate.applications?.length === 0 ? (
              /* No application yet — show Apply to Job */
              <Dialog open={applyDialogOpen} onOpenChange={(open) => { setApplyDialogOpen(open); if (open) loadJobs() }}>
                <DialogTrigger asChild>
                  <Button size="sm">Apply to Job</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply to Job</DialogTitle>
                    <DialogDescription>Select a published job to apply {candidate.first_name} to.</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Select value={selectedJob} onValueChange={setSelectedJob}>
                      <SelectTrigger><SelectValue placeholder="Select a job..." /></SelectTrigger>
                      <SelectContent>
                        {jobs.map((job) => (
                          <SelectItem key={job.id} value={job.id}>{job.title} - {job.department}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {jobs.length === 0 && <p className="text-sm text-gray-500 mt-2">No published jobs available.</p>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleApplyToJob} disabled={!selectedJob || applying}>
                      {applying ? 'Applying...' : 'Apply'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

            {!editing ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
                <PenLine className="w-3.5 h-3.5" />
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); setFormData(candidate) }}>Cancel</Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">Candidate updated successfully</div>}

      {/* ====== Two-Column Layout ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ====== LEFT COLUMN — Profile Cards ====== */}
        <div className="lg:col-span-3 space-y-6">
          {/* Personal Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Personal Information</h3></div>
            <div className="p-6 space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="First Name" value={formData.first_name} onChange={(v) => setFormData(p => ({ ...p, first_name: v }))} />
                    <FormField label="Last Name" value={formData.last_name} onChange={(v) => setFormData(p => ({ ...p, last_name: v }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Email" value={formData.email} onChange={(v) => setFormData(p => ({ ...p, email: v }))} />
                    <FormField label="Phone" value={formData.phone} onChange={(v) => setFormData(p => ({ ...p, phone: v }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <LocationInput value={formData.location ?? ''} onChange={(v) => setFormData(p => ({ ...p, location: v }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={formData.gender ?? ''} onValueChange={(v) => setFormData(p => ({ ...p, gender: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <FormField label="Date of Birth" type="date" value={formData.date_of_birth} onChange={(v) => setFormData(p => ({ ...p, date_of_birth: v }))} max={new Date().toISOString().split('T')[0]} />
                </>
              ) : (
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <InfoField label="Email" value={candidate.email} />
                  <InfoField label="Phone" value={candidate.phone} />
                  <InfoField label="Location" value={candidate.location} />
                  <InfoField label="Gender" value={genderLabel} />
                  <InfoField label="Date of Birth" value={candidate.date_of_birth ? new Date(candidate.date_of_birth).toLocaleDateString() : null} />
                  <InfoField label="Source" value={sourceLabel} />
                </div>
              )}
            </div>
          </div>

          {/* Professional Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Professional Details</h3></div>
            <div className="p-6 space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Current Company" value={formData.current_company} onChange={(v) => setFormData(p => ({ ...p, current_company: v }))} />
                    <FormField label="Current Title" value={formData.current_title} onChange={(v) => setFormData(p => ({ ...p, current_title: v }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Experience (Years)" type="number" value={formData.experience_years} onChange={(v) => setFormData(p => ({ ...p, experience_years: v }))} />
                    <div className="space-y-2">
                      <Label>Notice Period</Label>
                      <Select value={formData.notice_period ?? ''} onValueChange={(v) => setFormData(p => ({ ...p, notice_period: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {NOTICE_PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Highest Education</Label>
                    <Select value={formData.education ?? ''} onValueChange={(v) => setFormData(p => ({ ...p, education: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(EDUCATION_LABELS).map(([val, lab]) => <SelectItem key={val} value={val}>{lab}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="LinkedIn URL" value={formData.linkedin_url} onChange={(v) => setFormData(p => ({ ...p, linkedin_url: v }))} />
                    <FormField label="Portfolio URL" value={formData.portfolio_url} onChange={(v) => setFormData(p => ({ ...p, portfolio_url: v }))} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <InfoField label="Company" value={candidate.current_company} />
                  <InfoField label="Title" value={candidate.current_title} />
                  <InfoField label="Experience" value={candidate.experience_years != null ? `${candidate.experience_years} years` : null} />
                  <InfoField label="Notice Period" value={noticeLabel} />
                  <InfoField label="Education" value={educationLabel} />
                  <LinkField label="LinkedIn" url={candidate.linkedin_url} text="Profile" />
                  <LinkField label="Portfolio" url={candidate.portfolio_url} text="Website" />
                </div>
              )}
            </div>
          </div>

          {/* Compensation */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Compensation</h3></div>
            <div className="p-6 space-y-4">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Current Salary (Annual)" type="number" min={0} value={formData.current_salary} onChange={(v) => setFormData(p => ({ ...p, current_salary: v }))} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }} />
                  <FormField label="Expected Salary (Annual)" type="number" min={0} value={formData.expected_salary} onChange={(v) => setFormData(p => ({ ...p, expected_salary: v }))} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <InfoField label="Current Salary" value={candidate.current_salary != null ? `₹${Number(candidate.current_salary).toLocaleString('en-IN')}` : null} />
                  <InfoField label="Expected Salary" value={candidate.expected_salary != null ? `₹${Number(candidate.expected_salary).toLocaleString('en-IN')}` : null} />
                </div>
              )}
            </div>
          </div>

          {/* Cover Letter */}
          {(editing || candidate.cover_letter) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Cover Letter</h3></div>
              <div className="p-6">
                {editing ? (
                  <Textarea rows={6} value={formData.cover_letter ?? ''} onChange={(e) => setFormData(p => ({ ...p, cover_letter: e.target.value }))} />
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.cover_letter}</p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">Notes</h3></div>
            <div className="p-6">
              {editing ? (
                <Textarea rows={4} value={formData.notes ?? ''} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.notes || 'No notes added.'}</p>
              )}
            </div>
          </div>

          {/* AI Parsed Resume Data */}
          {parsedResume && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100"><h3 className="text-base font-semibold text-gray-900">AI-Parsed Resume Data</h3></div>
              <div className="p-6 space-y-4">
                {parsedResume.summary && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Summary</h4>
                    <p className="text-sm text-gray-600">{parsedResume.summary}</p>
                  </div>
                )}
                {parsedResume.skills?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedResume.skills.map((skill: string) => (
                        <span key={skill} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
                {parsedResume.experience?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Experience</h4>
                    <div className="space-y-3">
                      {parsedResume.experience.map((exp: AnyData, i: number) => (
                        <div key={i} className="border-l-2 border-blue-200 pl-3">
                          <p className="text-sm font-medium">{exp.title}</p>
                          <p className="text-xs text-gray-500">{exp.company}{exp.duration ? ` | ${exp.duration}` : ''}</p>
                          {exp.description && <p className="text-xs text-gray-600 mt-1">{exp.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {parsedResume.education?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Education</h4>
                    <div className="space-y-2">
                      {parsedResume.education.map((edu: AnyData, i: number) => (
                        <div key={i} className="border-l-2 border-green-200 pl-3">
                          <p className="text-sm font-medium">{edu.degree}</p>
                          <p className="text-xs text-gray-500">{edu.institution}{edu.year ? ` | ${edu.year}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resume Viewer + Upload */}
          <ResumeUpload
            candidateId={candidate.id}
            orgId={organization!.id}
            currentResumeUrl={candidate.resume_url}
            onUploadComplete={(url) => {
              setCandidate((prev) => prev ? { ...prev, resume_url: url } : prev)
            }}
          />
        </div>

        {/* ====== RIGHT COLUMN — Overview + Hiring Pipeline ====== */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6 space-y-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            {/* Hiring Pipeline Card — Now shows clickable links to /applications/[id] */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    Hiring Pipeline
                    <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {candidate.applications?.length || 0}
                    </span>
                  </h3>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {candidate.applications?.length > 0 ? (
                  candidate.applications.map((app: AnyData) => (
                    <div key={app.id} className="border rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                      <Link
                        href={`/applications/${app.id}?from=candidate`}
                        className="block"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">
                              {app.job?.title || 'Unknown Job'}
                            </p>
                            <p className="text-xs text-gray-500">{app.job?.department}</p>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-800'}`}>
                            {app.status}
                          </span>
                        </div>

                        {app.current_stage && (
                          <span className={`text-xs mt-2 inline-block px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[app.current_stage.stage_type] || 'bg-gray-100 text-gray-800'}`}>
                            {app.current_stage.name}
                          </span>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                          {app.interviews?.length > 0 && (
                            <span>{app.interviews.length} interview{app.interviews.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </Link>

                      {canManageCandidates && app.status === 'active' && (
                        <div className="mt-2 pt-2 border-t flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => openMoveDialog(app.id, app.job_id || app.job?.id)}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            Move to Job
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs gap-1"
                            disabled={rejectingAppId === app.id}
                            onClick={() => handleRejectApplication(app.id)}
                          >
                            <XCircle className="w-3 h-3" />
                            {rejectingAppId === app.id ? 'Rejecting...' : 'Reject'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                    <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No applications yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Overview Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Overview</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-sm space-y-2">
                  <InfoRow label="Added" value={new Date(candidate.created_at).toLocaleDateString()} />
                  <InfoRow label="Source" value={sourceLabel} />
                  <InfoRow label="Applications" value={String(candidate.applications?.length || 0)} />
                  {candidate.experience_years != null && <InfoRow label="Experience" value={`${candidate.experience_years} yrs`} />}
                  {noticeLabel && <InfoRow label="Notice" value={noticeLabel} />}
                  {educationLabel && <InfoRow label="Education" value={educationLabel} />}
                  {candidate.current_salary != null && <InfoRow label="Current CTC" value={`₹${Number(candidate.current_salary).toLocaleString('en-IN')}`} />}
                  {candidate.expected_salary != null && <InfoRow label="Expected CTC" value={`₹${Number(candidate.expected_salary).toLocaleString('en-IN')}`} />}
                </div>

                <Separator />

                {/* AI Scores */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" />
                    AI Score
                  </h4>
                  {candidate.applications?.length > 0 ? (
                    candidate.applications.map((app: AnyData) => {
                      const score = aiScores[app.id]
                      if (!score) return (
                        <p key={app.id} className="text-sm text-gray-400">Not scored yet</p>
                      )
                      const overall = score.overall_score
                      const color = overall >= 70 ? 'text-green-600' : overall >= 40 ? 'text-yellow-600' : 'text-red-600'
                      const barColor = overall >= 70 ? 'bg-green-500' : overall >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      return (
                        <div key={app.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-2xl font-bold ${color}`}>{overall}</span>
                            <span className="text-xs text-gray-400">/ 100</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${overall}%` }} />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center text-xs pt-1">
                            <div>
                              <p className="font-medium text-gray-700">{score.skill_score}</p>
                              <p className="text-gray-400">Skills</p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-700">{score.experience_score}</p>
                              <p className="text-gray-400">Exp.</p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-700">{score.semantic_score}</p>
                              <p className="text-gray-400">Semantic</p>
                            </div>
                          </div>
                          {score.recommendation && (
                            <p className="text-xs text-gray-500 italic">{score.recommendation}</p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-gray-400">No applications yet</p>
                  )}
                </div>

                <Separator />

                {/* Resume download link */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Resume</h4>
                  {candidate.resume_url ? (
                    <a
                      href={candidate.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                    >
                      <Download className="w-4 h-4" />
                      Download Resume (PDF)
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">No resume uploaded</p>
                  )}
                </div>
              </div>
            </div>

            {/* Activity Log Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">
                  Activity Log
                  {activityLogs.length > 0 && (
                    <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {activityLogs.length}
                    </span>
                  )}
                </h3>
              </div>
              <div className="p-5">
                <ActivityTimeline
                  activities={activityLogs}
                  loading={activityLoading}
                  emptyMessage="No activity recorded for this candidate yet"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== DIALOGS ====== */}

      {/* Send Email */}
      {emailOpen && (
        <SendEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          candidateId={candidate.id}
          candidateName={`${candidate.first_name} ${candidate.last_name}`}
          candidateEmail={candidate.email}
        />
      )}

      {/* Move to Job Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Job</DialogTitle>
            <DialogDescription>
              Select a published job to move this application to. The application will be placed in the first stage of the new job.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={moveTargetJob} onValueChange={setMoveTargetJob}>
              <SelectTrigger><SelectValue placeholder="Select a job..." /></SelectTrigger>
              <SelectContent>
                {jobs
                  .filter((job) => job.id !== moveCurrentJobId)
                  .map((job) => (
                    <SelectItem key={job.id} value={job.id}>{job.title} - {job.department}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {jobs.filter((j) => j.id !== moveCurrentJobId).length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No other published jobs available.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMoveToJob} disabled={!moveTargetJob || moving}>
              {moving ? 'Moving...' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ====== Helper Components ====== */

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="font-medium mt-0.5">{value || <span className="text-gray-300">-</span>}</p>
    </div>
  )
}

function LinkField({ label, url, text }: { label: string; url: string | null | undefined; text: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs uppercase tracking-wide">{label}</span>
      <p className="font-medium mt-0.5">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            {text}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : <span className="text-gray-300">-</span>}
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', max, min, onKeyDown }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string; max?: string; min?: number; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} max={max} min={min} onKeyDown={onKeyDown} />
    </div>
  )
}
