'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getCandidateById, updateCandidate } from '@/lib/services/candidates'
import { createApplication } from '@/lib/services/applications'
import { getJobs } from '@/lib/services/jobs'
import { CANDIDATE_SOURCES } from '@/lib/constants'
import { EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { SendEmailDialog } from '@/components/email/send-email-dialog'
import { ResumeUpload } from './resume-upload'

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

  // Email dialog
  const [emailOpen, setEmailOpen] = useState(false)

  // Reject
  const [rejectingAppId, setRejectingAppId] = useState<string | null>(null)

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
      {/* Back link */}
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-semibold">
            {candidate.first_name?.[0]}{candidate.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {candidate.first_name} {candidate.last_name}
            </h1>
            <p className="text-gray-500">
              {candidate.current_title && candidate.current_company
                ? `${candidate.current_title} at ${candidate.current_company}`
                : candidate.current_title || candidate.email}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {candidate.location && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                  {candidate.location}
                </span>
              )}
              <Badge variant="secondary" className="text-xs">{sourceLabel}</Badge>
            </div>
          </div>
        </div>

        {/* Action Buttons — Email + Apply + Edit */}
        {canManageCandidates && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              Email
            </Button>
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
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
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
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg">Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
                    <FormField label="Location" value={formData.location} onChange={(v) => setFormData(p => ({ ...p, location: v }))} />
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
                  <FormField label="Date of Birth" type="date" value={formData.date_of_birth} onChange={(v) => setFormData(p => ({ ...p, date_of_birth: v }))} />
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
            </CardContent>
          </Card>

          {/* Professional Details */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg">Professional Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Compensation */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg">Compensation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Current Salary (Annual)" type="number" value={formData.current_salary} onChange={(v) => setFormData(p => ({ ...p, current_salary: v }))} />
                  <FormField label="Expected Salary (Annual)" type="number" value={formData.expected_salary} onChange={(v) => setFormData(p => ({ ...p, expected_salary: v }))} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <InfoField label="Current Salary" value={candidate.current_salary != null ? `$${Number(candidate.current_salary).toLocaleString()}` : null} />
                  <InfoField label="Expected Salary" value={candidate.expected_salary != null ? `$${Number(candidate.expected_salary).toLocaleString()}` : null} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cover Letter */}
          {(editing || candidate.cover_letter) && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-lg">Cover Letter</CardTitle></CardHeader>
              <CardContent>
                {editing ? (
                  <Textarea rows={6} value={formData.cover_letter ?? ''} onChange={(e) => setFormData(p => ({ ...p, cover_letter: e.target.value }))} />
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.cover_letter}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <Textarea rows={4} value={formData.notes ?? ''} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.notes || 'No notes added.'}</p>
              )}
            </CardContent>
          </Card>

          {/* AI Parsed Resume Data */}
          {parsedResume && (
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-lg">AI-Parsed Resume Data</CardTitle></CardHeader>
              <CardContent className="space-y-4">
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
                        <div key={i} className="border-l-2 border-indigo-200 pl-3">
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
              </CardContent>
            </Card>
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
            {/* Overview Card */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-2">
                  <InfoRow label="Added" value={new Date(candidate.created_at).toLocaleDateString()} />
                  <InfoRow label="Source" value={sourceLabel} />
                  <InfoRow label="Applications" value={String(candidate.applications?.length || 0)} />
                  {candidate.experience_years != null && <InfoRow label="Experience" value={`${candidate.experience_years} yrs`} />}
                  {noticeLabel && <InfoRow label="Notice" value={noticeLabel} />}
                  {educationLabel && <InfoRow label="Education" value={educationLabel} />}
                  {candidate.current_salary != null && <InfoRow label="Current CTC" value={`$${Number(candidate.current_salary).toLocaleString()}`} />}
                  {candidate.expected_salary != null && <InfoRow label="Expected CTC" value={`$${Number(candidate.expected_salary).toLocaleString()}`} />}
                </div>

                <Separator />

                {/* Tags */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags</h4>
                  {candidate.tags?.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.tags.map((tag: string) => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{tag}</span>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No tags</p>}
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
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      Download Resume (PDF)
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">No resume uploaded</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Hiring Pipeline Card — Now shows clickable links to /applications/[id] */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    Hiring Pipeline
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {candidate.applications?.length || 0}
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
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
                          <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-800'}`}>
                            {app.status}
                          </Badge>
                        </div>

                        {app.current_stage && (
                          <Badge className={`text-xs mt-2 ${STAGE_COLORS[app.current_stage.stage_type] || 'bg-gray-100 text-gray-800'}`}>
                            {app.current_stage.name}
                          </Badge>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                          {app.interviews?.length > 0 && (
                            <span>{app.interviews.length} interview{app.interviews.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </Link>

                      {canManageCandidates && app.status === 'active' && (
                        <div className="mt-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            disabled={rejectingAppId === app.id}
                            onClick={() => handleRejectApplication(app.id)}
                          >
                            {rejectingAppId === app.id ? 'Rejecting...' : 'Reject'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No applications yet
                  </p>
                )}
              </CardContent>
            </Card>
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
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{text}</a>
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

function FormField({ label, value, onChange, type = 'text' }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
