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
import { getJobById, updateJob, getScorecardCriteria, upsertScorecardCriteria } from '@/lib/services/jobs'
import {
  EMPLOYMENT_TYPES, CURRENCIES, JOB_STATUS_CONFIG, EXPERIENCE_LEVELS,
  REMOTE_POLICIES, JOB_PRIORITIES, JOB_EDUCATION_LEVELS,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { BulkResumeUploadDialog } from '@/components/bulk-upload/bulk-resume-upload-dialog'
import { Upload } from 'lucide-react'

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
  const [hasChanges, setHasChanges] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)

  const initialCriteriaRef = useRef<string>('')
  const initialSkillsRef = useRef<string>('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors, isDirty }, setValue, reset } = useForm<UpdateJobInput>({
    resolver: zodResolver(updateJobSchema) as any,
  })

  useEffect(() => {
    const criteriaDirty = JSON.stringify(criteria) !== initialCriteriaRef.current
    const skillsDirty = JSON.stringify(skills) !== initialSkillsRef.current
    setHasChanges(isDirty || criteriaDirty || skillsDirty)
  }, [isDirty, criteria, skills])

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
        salary_currency: data.salary_currency ?? 'USD',
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
        testgorilla_assessment_id: data.testgorilla_assessment_id ?? null,
      })

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

    const updateData: Record<string, unknown> = { ...data }
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

      const validCriteria = criteria.filter((c) => c.name.trim())
      await upsertScorecardCriteria(supabase, params.id as string, organization.id, validCriteria)

      initialCriteriaRef.current = JSON.stringify(criteria)
      initialSkillsRef.current = JSON.stringify(skills)

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
    <div>
      {/* Top bar */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{job.title as string}</h1>
              <Badge variant={statusConfig?.variant ?? 'secondary'} className={statusConfig?.className}>
                {statusConfig?.label ?? (job.status as string)}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">{canManageJobs ? 'Edit job details' : 'View job details'}</p>
          </div>
          <div className="flex gap-2">
            {canManageJobs && (
              <Button variant="outline" onClick={() => setBulkUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
            )}
            <Link href={`/jobs/${params.id}/applications`}>
              <Button variant="outline">Applications</Button>
            </Link>
            <Link href={`/jobs/${params.id}/pipeline`}>
              <Button variant="outline">Pipeline</Button>
            </Link>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <Label htmlFor="description">Job Description</Label>
                  <Textarea id="description" rows={15} {...register('description')} disabled={!canManageJobs} />
                  {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requirements">Requirements</Label>
                  <Textarea id="requirements" rows={9} {...register('requirements')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nice_to_have">Nice to Have</Label>
                  <Textarea id="nice_to_have" rows={5} {...register('nice_to_have')} disabled={!canManageJobs} placeholder="Preferred but not required qualifications..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="benefits">Benefits & Perks</Label>
                  <Textarea id="benefits" rows={5} {...register('benefits')} disabled={!canManageJobs} placeholder="Health insurance, PTO, equity, etc." />
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
                  <div className="space-y-2">
                    <Label>Assign Recruiter</Label>
                    <Select
                      defaultValue={(job.assigned_to as string) ?? '__unassigned'}
                      onValueChange={(val) => setValue('assigned_to', val === '__unassigned' ? null : val, { shouldDirty: true })}
                    >
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned">Unassigned</SelectItem>
                        {recruiters.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.full_name} ({r.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <CardTitle className="text-lg">Compensation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Min Salary</Label>
                  <Input id="salary_min" type="number" {...register('salary_min')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Salary</Label>
                  <Input id="salary_max" type="number" {...register('salary_max')} disabled={!canManageJobs} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    defaultValue={(job.salary_currency as string) ?? 'USD'}
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

            {/* Assessment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assessment</CardTitle>
                <p className="text-sm text-gray-500">Link a TestGorilla assessment to this job</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="testgorilla_assessment_id">TestGorilla Assessment ID</Label>
                <Input
                  id="testgorilla_assessment_id"
                  placeholder="Paste Assessment ID from TestGorilla"
                  {...register('testgorilla_assessment_id')}
                  disabled={!canManageJobs}
                />
                <p className="text-xs text-gray-500">
                  Optional. Get this from your TestGorilla dashboard.
                </p>
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
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
        <div className="flex gap-3 mt-6 pt-6 border-t">
          {canManageJobs && (
            <Button type="submit" disabled={saving || !hasChanges}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Back
          </button>
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
