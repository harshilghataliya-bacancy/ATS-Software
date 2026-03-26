'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateJobSchema, type UpdateJobInput } from '@/lib/validators/job'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { getAssignableRecruiters } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { getJobById, updateJob, getScorecardCriteria, upsertScorecardCriteria, getJobRecruiters } from '@/lib/services/jobs'
import {
  EMPLOYMENT_TYPES, CURRENCIES, JOB_STATUS_CONFIG, EXPERIENCE_LEVELS,
  REMOTE_POLICIES, JOB_PRIORITIES, JOB_EDUCATION_LEVELS,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { BulkResumeUploadDialog } from '@/components/bulk-upload/bulk-resume-upload-dialog'
import {
  Upload, UserPlus, ArrowLeft, X, Briefcase, FileText, Link2, Check,
} from 'lucide-react'

interface Recruiter {
  id: string
  email: string
  full_name: string
  role: string
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const { organization, isLoading: userLoading } = useUser()
  const { canManageJobs, isAdmin } = useRole()
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [criteria, setCriteria] = useState<Array<{ name: string; description: string; weight: number }>>([])
  const [criteriaLoaded, setCriteriaLoaded] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>([])
  const [jobOwnerId, setJobOwnerId] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const initialCriteriaRef = useRef<string>('')
  const initialSkillsRef = useRef<string>('')
  const initialRecruiterIdsRef = useRef<string>('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors, isDirty }, setValue, reset, watch } = useForm<UpdateJobInput>({
    resolver: zodResolver(updateJobSchema) as any,
  })

  useEffect(() => {
    const criteriaDirty = JSON.stringify(criteria) !== initialCriteriaRef.current
    const skillsDirty = JSON.stringify(skills) !== initialSkillsRef.current
    const recruitersDirty = JSON.stringify(selectedRecruiterIds) !== initialRecruiterIdsRef.current
    const ownerDirty = jobOwnerId !== (job?.assigned_to as string | null)
    setHasChanges(isDirty || criteriaDirty || skillsDirty || recruitersDirty || ownerDirty)
  }, [isDirty, criteria, skills, selectedRecruiterIds, jobOwnerId, job])

  useEffect(() => {
    if (organization && isAdmin) {
      getAssignableRecruiters(organization.id).then(({ data }) => {
        if (data) setRecruiters(data)
      })
    }
  }, [organization, isAdmin])

  useEffect(() => {
    if (!organization) return
    loadJob()
  }, [organization])

  async function loadJob() {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getJobById(supabase, params.id as string, organization.id)
    if (fetchError) {
      toast({ variant: 'destructive', title: 'Error', description: fetchError.message })
    } else if (data) {
      setJob(data)
      const jobSkills = (data.skills as string[]) ?? []
      setSkills(jobSkills)
      initialSkillsRef.current = JSON.stringify(jobSkills)
      reset({
        title: data.title,
        department: data.department,
        location: data.location,
        employment_type: data.employment_type,
        description: data.description,
        requirements: data.requirements ?? '',
        salary_min: data.salary_min,
        salary_max: data.salary_max,
        salary_currency: data.salary_currency ?? 'INR',
        status: data.status,
        experience_level: data.experience_level ?? undefined,
        num_openings: data.num_openings ?? 1,
        application_deadline: data.application_deadline ?? '',
        remote_policy: data.remote_policy ?? 'on_site',
        skills: jobSkills,
        benefits: data.benefits ?? '',
        nice_to_have: data.nice_to_have ?? '',
        education_level: data.education_level ?? undefined,
        experience_min: data.experience_min ?? null,
        experience_max: data.experience_max ?? null,
        priority: data.priority ?? 'medium',
        assigned_to: data.assigned_to ?? null,
      })

      // Load job recruiters
      const recruiterIds = await getJobRecruiters(supabase, params.id as string)
      setSelectedRecruiterIds(recruiterIds)
      setJobOwnerId((data.assigned_to as string) ?? (recruiterIds.length > 0 ? recruiterIds[0] : null))
      initialRecruiterIdsRef.current = JSON.stringify(recruiterIds)

      if (!criteriaLoaded) {
        const { data: criteriaData } = await getScorecardCriteria(supabase, params.id as string, organization.id)
        if (criteriaData && criteriaData.length > 0) {
          const loaded = criteriaData.map((c: Record<string, unknown>) => ({
            name: c.name as string,
            description: (c.description as string) ?? '',
            weight: c.weight as number,
          }))
          setCriteria(loaded)
          initialCriteriaRef.current = JSON.stringify(loaded)
        } else {
          initialCriteriaRef.current = JSON.stringify([])
        }
        setCriteriaLoaded(true)
      }
    }
    setLoading(false)
  }

  function addSkill() {
    const tag = skillInput.trim()
    if (tag && !skills.includes(tag)) {
      const updated = [...skills, tag]
      setSkills(updated)
      setValue('skills', updated, { shouldDirty: true })
    }
    setSkillInput('')
  }

  function removeSkill(tag: string) {
    const updated = skills.filter((s) => s !== tag)
    setSkills(updated)
    setValue('skills', updated, { shouldDirty: true })
  }

  async function onSubmit(data: UpdateJobInput) {
    if (!organization || !job) return
    setSaving(true)

    const supabase = createClient()

    const updateData: Record<string, unknown> = { ...data, recruiter_ids: selectedRecruiterIds, assigned_to: jobOwnerId }
    if (updateData.application_deadline === '' || updateData.application_deadline === undefined) {
      updateData.application_deadline = null
    }
    if (updateData.nice_to_have === '') updateData.nice_to_have = null
    if (updateData.benefits === '') updateData.benefits = null
    if (data.status === 'published' && job.status !== 'published') {
      updateData.published_at = new Date().toISOString()
    }
    if (data.status === 'closed' && job.status !== 'closed') {
      updateData.closed_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await updateJob(
      supabase, params.id as string, organization.id, updateData
    )

    if (updateError) {
      toast({ variant: 'destructive', title: 'Error', description: updateError.message })
    } else {
      setJob(updated)

      // When job is closed or archived, reject all active candidates and send emails
      if (data.status === 'closed' || data.status === 'archived') {
        // Reject all active applications and send rejection emails
        fetch('/api/applications/reject-by-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: params.id }),
        }).catch((err) => console.error('[Auto reject on job close]', err))
      }

      const validCriteria = criteria.filter((c) => c.name.trim())
      await upsertScorecardCriteria(supabase, params.id as string, organization.id, validCriteria)

      initialCriteriaRef.current = JSON.stringify(criteria)
      initialSkillsRef.current = JSON.stringify(skills)
      initialRecruiterIdsRef.current = JSON.stringify(selectedRecruiterIds)

      reset(data)
      setHasChanges(false)

      toast({ title: 'Job updated', description: `"${data.title}" has been saved successfully.` })
    }
    setSaving(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><Skeleton className="h-96" /></div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-500">Job not found</div>
  }

  const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold text-gray-900">{job.title as string}</h1>
                <Badge variant={statusConfig?.variant ?? 'secondary'} className={statusConfig?.className}>
                  {statusConfig?.label ?? (job.status as string)}
                </Badge>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{canManageJobs ? 'Edit job details' : 'View job details'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageJobs && (
            <>
              <Link href={`/candidates/new?jobId=${params.id}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Candidate
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => setBulkUploadOpen(true)} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Bulk Upload
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const url = `${window.location.origin}/careers/${organization?.slug}/${params.id}`
              navigator.clipboard.writeText(url)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 2000)
            }}
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />}
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Link href={`/jobs/${params.id}/applications`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Applications
            </Button>
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* ===== LEFT COLUMN (2/3) ===== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Job Title</Label>
                  <Input id="title" {...register('title')} disabled={!canManageJobs} />
                  {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" {...register('department')} disabled={!canManageJobs} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" {...register('location')} disabled={!canManageJobs} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Employment Type</Label>
                    <Select
                      defaultValue={job.employment_type as string}
                      onValueChange={(val) => setValue('employment_type', val as UpdateJobInput['employment_type'], { shouldDirty: true })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Remote Policy</Label>
                    <Select
                      defaultValue={(job.remote_policy as string) ?? 'on_site'}
                      onValueChange={(val) => setValue('remote_policy', val as UpdateJobInput['remote_policy'], { shouldDirty: true })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REMOTE_POLICIES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Experience Level</Label>
                    <Select
                      defaultValue={(job.experience_level as string) ?? ''}
                      onValueChange={(val) => setValue('experience_level', val as UpdateJobInput['experience_level'], { shouldDirty: true })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {EXPERIENCE_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Skills / Tags */}
                <div className="space-y-2">
                  <Label>Skills / Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a skill and press Enter"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addSkill() }
                      }}
                      disabled={!canManageJobs}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addSkill} disabled={!canManageJobs}>Add</Button>
                  </div>
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 cursor-pointer" onClick={() => canManageJobs && removeSkill(s)}>
                          {s} {canManageJobs && <span className="text-xs ml-0.5">&times;</span>}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Job Description</Label>
                  {canManageJobs ? (
                    <RichTextEditor
                      value={watch('description')}
                      onChange={(val) => setValue('description', val, { shouldDirty: true })}
                      placeholder="Describe the role, responsibilities, and what makes it exciting..."
                      rows={15}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none rounded-md border p-3 bg-gray-50 text-[13px]" dangerouslySetInnerHTML={{ __html: watch('description') || '' }} />
                  )}
                  {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Requirements</Label>
                  {canManageJobs ? (
                    <RichTextEditor
                      value={watch('requirements')}
                      onChange={(val) => setValue('requirements', val, { shouldDirty: true })}
                      placeholder="List the skills, experience, and qualifications needed..."
                      rows={12}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none rounded-md border p-3 bg-gray-50 text-[13px]" dangerouslySetInnerHTML={{ __html: watch('requirements') || '' }} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Nice to Have</Label>
                  {canManageJobs ? (
                    <RichTextEditor
                      value={watch('nice_to_have') ?? undefined}
                      onChange={(val) => setValue('nice_to_have', val, { shouldDirty: true })}
                      placeholder="Preferred but not required qualifications..."
                      rows={8}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none rounded-md border p-3 bg-gray-50 text-[13px]" dangerouslySetInnerHTML={{ __html: watch('nice_to_have') || '' }} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Benefits & Perks</Label>
                  {canManageJobs ? (
                    <RichTextEditor
                      value={watch('benefits') ?? undefined}
                      onChange={(val) => setValue('benefits', val, { shouldDirty: true })}
                      placeholder="Health insurance, PTO, equity, etc."
                      rows={8}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none rounded-md border p-3 bg-gray-50 text-[13px]" dangerouslySetInnerHTML={{ __html: watch('benefits') || '' }} />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===== RIGHT COLUMN (1/3) ===== */}
          <div className="space-y-6">
            {/* Job Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    defaultValue={job.status as string}
                    onValueChange={(val) => setValue('status', val as UpdateJobInput['status'], { shouldDirty: true })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    defaultValue={(job.priority as string) ?? 'medium'}
                    onValueChange={(val) => setValue('priority', val as UpdateJobInput['priority'], { shouldDirty: true })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="num_openings">No. of Openings</Label>
                  <Input id="num_openings" type="number" min={1} {...register('num_openings')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="application_deadline">Application Deadline</Label>
                  <Input id="application_deadline" type="date" {...register('application_deadline')} disabled={!canManageJobs} />
                </div>
                {isAdmin && recruiters.length > 0 && (
                  <div className="space-y-3">
                    <Label>Assigned Recruiters</Label>
                    <div className="space-y-1 rounded-lg border border-gray-200 p-2 max-h-56 overflow-y-auto">
                      {recruiters.map((r) => {
                        const checked = selectedRecruiterIds.includes(r.id)
                        const isOwner = r.id === jobOwnerId
                        return (
                          <div key={r.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                            checked
                              ? isOwner
                                ? 'bg-emerald-50/80 ring-1 ring-emerald-200'
                                : 'bg-blue-50/50 ring-1 ring-blue-100'
                              : 'hover:bg-gray-50'
                          }`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                              onChange={() => {
                                let updated: string[]
                                if (checked) {
                                  updated = selectedRecruiterIds.filter((id) => id !== r.id)
                                  if (r.id === jobOwnerId) {
                                    setJobOwnerId(updated.length > 0 ? updated[0] : null)
                                  }
                                } else {
                                  updated = [...selectedRecruiterIds, r.id]
                                  if (!jobOwnerId) setJobOwnerId(r.id)
                                }
                                setSelectedRecruiterIds(updated)
                              }}
                            />
                            <span className={`text-sm flex-1 ${isOwner ? 'text-emerald-700 font-semibold' : checked ? 'text-gray-800' : 'text-gray-600'}`}>
                              {r.full_name}
                            </span>
                            <span className="text-[11px] text-gray-400">{r.role}</span>
                            {checked && (
                              <button
                                type="button"
                                title={isOwner ? 'Job Owner' : 'Set as Owner'}
                                className={`w-6 h-6 flex items-center justify-center rounded-full transition-all shrink-0 ${
                                  isOwner
                                    ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                    : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                                }`}
                                onClick={() => setJobOwnerId(r.id)}
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isOwner ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isOwner ? 0 : 2}>
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Selected badges */}
                    {selectedRecruiterIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRecruiterIds.map((id) => {
                          const r = recruiters.find((rec) => rec.id === id)
                          const isOwner = id === jobOwnerId
                          return r ? (
                            <Badge key={id} variant="secondary" className={`gap-1 cursor-pointer text-xs ${
                              isOwner ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''
                            }`} onClick={() => {
                              const updated = selectedRecruiterIds.filter((rid) => rid !== id)
                              setSelectedRecruiterIds(updated)
                              if (id === jobOwnerId) setJobOwnerId(updated.length > 0 ? updated[0] : null)
                            }}>
                              {isOwner && <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" /></svg>}
                              {r.full_name} <span className="text-xs ml-0.5">&times;</span>
                            </Badge>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Job Owner display for non-admin */}
                {!isAdmin && jobOwnerId && recruiters.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Job Owner</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        ★ {recruiters.find((r) => r.id === jobOwnerId)?.full_name ?? 'Unknown'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Qualifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Min Education</Label>
                  <Select
                    defaultValue={(job.education_level as string) ?? ''}
                    onValueChange={(val) => setValue('education_level', val as UpdateJobInput['education_level'], { shouldDirty: true })}
                  >
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      {JOB_EDUCATION_LEVELS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="experience_min">Min Exp (Yrs)</Label>
                    <Input id="experience_min" type="number" min={0} {...register('experience_min')} disabled={!canManageJobs} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience_max">Max Exp (Yrs)</Label>
                    <Input id="experience_max" type="number" min={0} {...register('experience_max')} disabled={!canManageJobs} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compensation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compensation (Annual CTC)</CardTitle>
                <p className="text-sm text-gray-500">Annual Cost to Company (CTC) range</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Min Annual CTC</Label>
                  <Input id="salary_min" type="number" placeholder="e.g. 800000" {...register('salary_min')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Annual CTC</Label>
                  <Input id="salary_max" type="number" placeholder="e.g. 1200000" {...register('salary_max')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    defaultValue={(job.salary_currency as string) ?? 'INR'}
                    onValueChange={(val) => setValue('salary_currency', val, { shouldDirty: true })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Evaluation Criteria */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Evaluation Criteria</CardTitle>
                <p className="text-sm text-gray-500">Criteria interviewers will rate candidates on</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {criteria.map((c, idx) => (
                  <div key={idx} className="space-y-1.5 p-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Criteria name"
                        value={c.name}
                        className="text-sm"
                        onChange={(e) => {
                          const updated = [...criteria]
                          updated[idx] = { ...updated[idx], name: e.target.value }
                          setCriteria(updated)
                        }}
                      />
                      <div className="w-16 flex-shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={c.weight}
                          className="text-sm text-center"
                          title="Weight (1-10)"
                          onChange={(e) => {
                            const updated = [...criteria]
                            updated[idx] = { ...updated[idx], weight: Number(e.target.value) }
                            setCriteria(updated)
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 px-1.5 h-8"
                        onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Description (optional)"
                      value={c.description}
                      className="text-xs"
                      onChange={(e) => {
                        const updated = [...criteria]
                        updated[idx] = { ...updated[idx], description: e.target.value }
                        setCriteria(updated)
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setCriteria([...criteria, { name: '', description: '', weight: 5 }])}
                >
                  + Add Criteria
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-6 border-t border-gray-200">
          {canManageJobs && (
            <Button type="submit" disabled={saving || !hasChanges} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Button>
        </div>
      </form>

      <BulkResumeUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        jobId={params.id as string}
        jobTitle={job.title as string}
      />

    </div>
  )
}
