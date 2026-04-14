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
import { getJobById, updateJob, getJobRecruiters } from '@/lib/services/jobs'
import {
  getJobScorecards, getScorecards, cloneScorecardForJob,
  createScorecardForJob, updateScorecard, deleteJobScorecard,
} from '@/lib/services/scorecards'
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
import { ScorecardEditorDialog, type ScorecardFormData } from '@/components/scorecards/scorecard-editor-dialog'
import { useToast } from '@/hooks/use-toast'
import { BulkResumeUploadDialog } from '@/components/bulk-upload/bulk-resume-upload-dialog'
import {
  Upload, UserPlus, ArrowLeft, Briefcase, FileText, Link2, Check,
  ClipboardList, Plus, Copy, Pencil, Trash2,
} from 'lucide-react'
import type { ScorecardWithCriteria, ScorecardTemplateCriteria } from '@/types/database'

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
  const { canManageJobs, canEditJobs, isAdmin } = useRole()
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Scorecard state for job edit
  type EditScorecard = {
    id?: string // existing scorecard id (for update/delete)
    mode: 'existing' | 'clone' | 'new'
    sourceId?: string
    title: string
    label: string
    description: string
    criteria: Array<{
      name: string
      description: string
      weight: number
      rating_type: 'rating' | 'yes_no' | 'text'
      display_order: number
      category: string
    }>
  }
  const [jobScorecards, setJobScorecards] = useState<EditScorecard[]>([])
  const [orgScorecards, setOrgScorecards] = useState<ScorecardWithCriteria[]>([])
  const [scorecardsLoaded, setScorecardsLoaded] = useState(false)
  const [scorecardDialogOpen, setScorecardDialogOpen] = useState(false)
  const [editingScorecardIdx, setEditingScorecardIdx] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditScorecard>({
    mode: 'new', title: '', label: '', description: '',
    criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: 'General' }],
  })
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>([])
  const [jobOwnerId, setJobOwnerId] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const initialScorecardsRef = useRef<string>('')
  const initialSkillsRef = useRef<string>('')
  const initialRecruiterIdsRef = useRef<string>('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors, isDirty }, setValue, reset, watch } = useForm<UpdateJobInput>({
    resolver: zodResolver(updateJobSchema) as any,
  })

  useEffect(() => {
    const scorecardsDirty = JSON.stringify(jobScorecards) !== initialScorecardsRef.current
    const skillsDirty = JSON.stringify(skills) !== initialSkillsRef.current
    const recruitersDirty = JSON.stringify(selectedRecruiterIds) !== initialRecruiterIdsRef.current
    const ownerDirty = jobOwnerId !== (job?.assigned_to as string | null)
    setHasChanges(isDirty || scorecardsDirty || skillsDirty || recruitersDirty || ownerDirty)
  }, [isDirty, jobScorecards, skills, selectedRecruiterIds, jobOwnerId, job])

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

      // Load job recruiters, job scorecards, and org scorecard templates in parallel
      const [recruiterIds, jobScResult, orgScResult] = await Promise.all([
        getJobRecruiters(supabase, params.id as string),
        !scorecardsLoaded ? getJobScorecards(supabase, params.id as string, organization.id) : Promise.resolve({ data: null }),
        !scorecardsLoaded ? getScorecards(supabase, organization.id, true) : Promise.resolve({ data: null }),
      ])
      setSelectedRecruiterIds(recruiterIds)
      setJobOwnerId((data.assigned_to as string) ?? (recruiterIds.length > 0 ? recruiterIds[0] : null))
      initialRecruiterIdsRef.current = JSON.stringify(recruiterIds)

      if (!scorecardsLoaded) {
        if (orgScResult.data) setOrgScorecards(orgScResult.data as ScorecardWithCriteria[])
        const scData = jobScResult.data as ScorecardWithCriteria[] | null
        if (scData && scData.length > 0) {
          const loaded: EditScorecard[] = scData.map((sc) => ({
            id: sc.id,
            mode: 'existing' as const,
            sourceId: sc.source_scorecard_id || undefined,
            title: sc.title,
            label: sc.label || '',
            description: sc.description || '',
            criteria: (sc.scorecard_template_criteria || []).map((c: ScorecardTemplateCriteria) => ({
              name: c.name,
              description: c.description || '',
              weight: c.weight,
              rating_type: c.rating_type,
              display_order: c.display_order,
              category: c.category || 'General',
            })),
          }))
          setJobScorecards(loaded)
          initialScorecardsRef.current = JSON.stringify(loaded)
        } else {
          initialScorecardsRef.current = JSON.stringify([])
        }
        setScorecardsLoaded(true)
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

      // Sync job scorecards: update existing, create new, delete removed
      const existingIds = jobScorecards.filter((s) => s.id).map((s) => s.id!)
      const originalIds = (JSON.parse(initialScorecardsRef.current || '[]') as EditScorecard[])
        .filter((s) => s.id).map((s) => s.id!)
      // Delete removed scorecards
      for (const oldId of originalIds) {
        if (!existingIds.includes(oldId)) {
          await deleteJobScorecard(supabase, oldId, organization.id)
        }
      }
      // Update existing and create new scorecards
      for (const sc of jobScorecards) {
        const validCriteria = sc.criteria.filter((c) => c.name.trim())
        if (sc.id && sc.mode === 'existing') {
          // Update existing job scorecard
          await updateScorecard(supabase, sc.id, organization.id, {
            title: sc.title,
            description: sc.description || undefined,
            label: sc.label || undefined,
            criteria: validCriteria,
          })
        } else if (sc.mode === 'clone' && sc.sourceId) {
          await cloneScorecardForJob(supabase, sc.sourceId, params.id as string, organization.id, (job as Record<string, unknown>).created_by as string, {
            label: sc.label || undefined,
            title: sc.title || undefined,
          })
        } else if (sc.mode === 'new' && (validCriteria.length > 0 || sc.title.trim())) {
          await createScorecardForJob(supabase, params.id as string, organization.id, (job as Record<string, unknown>).created_by as string, {
            title: sc.title,
            description: sc.description || undefined,
            label: sc.label || undefined,
            criteria: validCriteria,
          })
        }
      }

      // Reload scorecards to get fresh IDs
      const { data: freshScorecards } = await getJobScorecards(supabase, params.id as string, organization.id)
      if (freshScorecards) {
        const reloaded: EditScorecard[] = (freshScorecards as ScorecardWithCriteria[]).map((sc) => ({
          id: sc.id,
          mode: 'existing' as const,
          sourceId: sc.source_scorecard_id || undefined,
          title: sc.title,
          label: sc.label || '',
          description: sc.description || '',
          criteria: (sc.scorecard_template_criteria || []).map((c: ScorecardTemplateCriteria) => ({
            name: c.name,
            description: c.description || '',
            weight: c.weight,
            rating_type: c.rating_type,
            display_order: c.display_order,
            category: c.category || 'General',
          })),
        }))
        setJobScorecards(reloaded)
        initialScorecardsRef.current = JSON.stringify(reloaded)
      }

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
              <p className="text-xs text-gray-400 mt-0.5">{canEditJobs ? 'Edit job details' : 'View job details'}</p>
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
                  <Input id="title" {...register('title')} disabled={!canEditJobs} />
                  {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" {...register('department')} disabled={!canEditJobs} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" {...register('location')} disabled={!canEditJobs} />
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
                      disabled={!canEditJobs}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addSkill} disabled={!canEditJobs}>Add</Button>
                  </div>
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 cursor-pointer" onClick={() => canEditJobs && removeSkill(s)}>
                          {s} {canEditJobs && <span className="text-xs ml-0.5">&times;</span>}
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
                  {canEditJobs ? (
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
                  {canEditJobs ? (
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
                  {canEditJobs ? (
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
                  {canEditJobs ? (
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
                  <Input id="num_openings" type="number" min={1} {...register('num_openings')} disabled={!canEditJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="application_deadline">Application Deadline</Label>
                  <Input id="application_deadline" type="date" {...register('application_deadline')} disabled={!canEditJobs} />
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
                    <Input id="experience_min" type="number" min={0} {...register('experience_min')} disabled={!canEditJobs} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience_max">Max Exp (Yrs)</Label>
                    <Input id="experience_max" type="number" min={0} {...register('experience_max')} disabled={!canEditJobs} />
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
                  <Input id="salary_min" type="number" placeholder="e.g. 800000" {...register('salary_min')} disabled={!canEditJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Annual CTC</Label>
                  <Input id="salary_max" type="number" placeholder="e.g. 1200000" {...register('salary_max')} disabled={!canEditJobs} />
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

            {/* Evaluation Scorecards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-gray-400" />
                  Evaluation Scorecards
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Scorecards for evaluating candidates. Each is job-specific — editing won&apos;t affect other jobs.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobScorecards.map((sc, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate">{sc.title}</span>
                        {sc.label && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{sc.label}</Badge>
                        )}
                        {sc.mode === 'existing' && (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 shrink-0">Saved</Badge>
                        )}
                        {sc.mode === 'clone' && (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 shrink-0">
                            <Copy className="w-2.5 h-2.5 mr-0.5" /> From Template
                          </Badge>
                        )}
                        {sc.mode === 'new' && !sc.id && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 shrink-0">New</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                          onClick={() => {
                            setEditingScorecardIdx(idx)
                            setEditForm({ ...sc, criteria: sc.criteria.map((c) => ({ ...c })) })
                            setScorecardDialogOpen(true)
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                          onClick={() => setJobScorecards(jobScorecards.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sc.criteria.filter((c) => c.name.trim()).map((c, ci) => (
                        <span key={ci} className="text-[10px] font-medium text-gray-600 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                          {c.name} <span className="text-gray-400">(w{c.weight})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {jobScorecards.length === 0 && (
                  <div className="text-center py-4 text-sm text-gray-400">
                    No scorecards assigned yet.
                  </div>
                )}

                <div className="flex gap-2">
                  {orgScorecards.length > 0 && (
                    <Select
                      value=""
                      onValueChange={(scorecardId) => {
                        const source = orgScorecards.find((s) => s.id === scorecardId)
                        if (!source) return
                        setJobScorecards([...jobScorecards, {
                          mode: 'clone',
                          sourceId: source.id,
                          title: source.title,
                          label: source.label || '',
                          description: source.description || '',
                          criteria: (source.scorecard_template_criteria || []).map((c: ScorecardTemplateCriteria) => ({
                            name: c.name,
                            description: c.description || '',
                            weight: c.weight,
                            rating_type: c.rating_type,
                            display_order: c.display_order,
                            category: c.category || 'General',
                          })),
                        }])
                      }}
                    >
                      <SelectTrigger className="flex-1 text-sm">
                        <SelectValue placeholder="Select from templates…" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgScorecards.map((sc) => (
                          <SelectItem key={sc.id} value={sc.id}>
                            {sc.title}
                            <span className="text-gray-400 ml-1">
                              ({sc.scorecard_template_criteria?.length || 0} criteria)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => {
                      setEditingScorecardIdx(null)
                      setEditForm({
                        mode: 'new', title: '', label: '', description: '',
                        criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: 'General' }],
                      })
                      setScorecardDialogOpen(true)
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Create New
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scorecard Editor Dialog */}
            <ScorecardEditorDialog
              open={scorecardDialogOpen}
              onOpenChange={setScorecardDialogOpen}
              initial={editForm}
              isEditing={editingScorecardIdx !== null}
              onSave={(data: ScorecardFormData) => {
                const entry: EditScorecard = {
                  ...editForm,
                  ...data,
                  criteria: data.criteria.map((c, i) => ({ ...c, display_order: i })),
                }
                if (editingScorecardIdx !== null) {
                  const updated = [...jobScorecards]
                  updated[editingScorecardIdx] = entry
                  setJobScorecards(updated)
                } else {
                  setJobScorecards([...jobScorecards, entry])
                }
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-6 border-t border-gray-200">
          {canEditJobs && (
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
