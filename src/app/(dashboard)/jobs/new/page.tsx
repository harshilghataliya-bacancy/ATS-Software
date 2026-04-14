'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createJobSchema, type CreateJobInput } from '@/lib/validators/job'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createJob } from '@/lib/services/jobs'
import {
  getScorecards, cloneScorecardForJob, createScorecardForJob,
} from '@/lib/services/scorecards'
import {
  EMPLOYMENT_TYPES, CURRENCIES, EXPERIENCE_LEVELS, REMOTE_POLICIES,
  JOB_PRIORITIES, JOB_EDUCATION_LEVELS,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationInput } from '@/components/ui/location-input'
import { useToast } from '@/hooks/use-toast'
import { ScorecardEditorDialog, type ScorecardFormData } from '@/components/scorecards/scorecard-editor-dialog'
import { ArrowLeft, Sparkles, Loader2, X, ClipboardList, Plus, Copy, Pencil, Trash2 } from 'lucide-react'
import { getAssignableRecruiters } from '../actions'
import type { ScorecardWithCriteria, ScorecardTemplateCriteria } from '@/types/database'

interface Recruiter {
  id: string
  email: string
  full_name: string
  role: string
}

export default function NewJobPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user, organization } = useUser()
  const { isAdmin, canCreateJobs } = useRole()
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>([])
  const [jobOwnerId, setJobOwnerId] = useState<string | null>(null)

  // Default job owner to the current user (creator)
  useEffect(() => {
    if (user && !jobOwnerId) {
      setJobOwnerId(user.id)
    }
  }, [user, jobOwnerId])
  const [saving, setSaving] = useState(false)
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])

  // Scorecard selection state
  type PendingScorecard = {
    mode: 'clone' | 'new'
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
  const [orgScorecards, setOrgScorecards] = useState<ScorecardWithCriteria[]>([])
  const [pendingScorecards, setPendingScorecards] = useState<PendingScorecard[]>([])
  const [scorecardDialogOpen, setScorecardDialogOpen] = useState(false)
  const [editingScorecardIdx, setEditingScorecardIdx] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<PendingScorecard>({
    mode: 'new', title: '', label: '', description: '',
    criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: 'General' }],
  })

  // Load org scorecard templates
  useEffect(() => {
    if (!organization) return
    const supabase = createClient()
    getScorecards(supabase, organization.id, true).then(({ data }) => {
      if (data) setOrgScorecards(data as ScorecardWithCriteria[])
    })
  }, [organization])

  useEffect(() => {
    if (organization && isAdmin) {
      getAssignableRecruiters(organization.id).then(({ data }) => {
        if (data) setRecruiters(data)
      })
    }
  }, [organization, isAdmin])

  // AI JD Generator state
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  // Incrementing key forces uncontrolled Select components to re-mount with updated defaultValues
  const [formKey, setFormKey] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue, getValues, watch } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema) as any,
    defaultValues: {
      employment_type: 'full_time',
      salary_currency: 'INR',
      remote_policy: 'on_site',
      priority: 'medium',
      num_openings: 1,
      location: '',
      skills: [],
    },
  })

  async function handleGenerate() {
    if (!aiPrompt.trim() || generating) return
    setGenerating(true)

    try {
      const res = await fetch('/api/jobs/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Generation failed', description: json.error || 'Something went wrong' })
        setGenerating(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = json.data as Record<string, any>

      // Convert plain-text bullet lists (• or -) to HTML <ul><li> if not already HTML
      const toHtml = (text: string) => {
        if (!text) return text
        if (text.includes('<ul>') || text.includes('<li>') || text.includes('<p>')) return text
        const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
        const isBulletList = lines.every(l => /^[•\-\*]\s*/.test(l))
        if (isBulletList) {
          return '<ul>' + lines.map(l => `<li>${l.replace(/^[•\-\*]\s*/, '')}</li>`).join('') + '</ul>'
        }
        return lines.map(l => `<p>${l}</p>`).join('')
      }

      // Auto-fill all text fields
      if (d.title) setValue('title', d.title)
      if (d.department) setValue('department', d.department)
      if (d.location) setValue('location', d.location)
      if (d.description) setValue('description', toHtml(d.description))
      if (d.requirements) setValue('requirements', toHtml(d.requirements))
      if (d.nice_to_have) setValue('nice_to_have', toHtml(d.nice_to_have))
      if (d.benefits) setValue('benefits', toHtml(d.benefits))

      // Select fields — set form value; formKey bump will re-mount the select components
      if (d.employment_type) setValue('employment_type', d.employment_type)
      if (d.experience_level) setValue('experience_level', d.experience_level)
      if (d.remote_policy) setValue('remote_policy', d.remote_policy)
      if (d.education_level) setValue('education_level', d.education_level)
      if (d.priority) setValue('priority', d.priority)

      // Numeric fields
      if (d.experience_min != null) setValue('experience_min', d.experience_min)
      if (d.experience_max != null) setValue('experience_max', d.experience_max)
      if (d.salary_min != null) setValue('salary_min', d.salary_min)
      if (d.salary_max != null) setValue('salary_max', d.salary_max)

      // Skills array
      if (Array.isArray(d.skills) && d.skills.length > 0) {
        setSkills(d.skills)
        setValue('skills', d.skills)
      }

      // Force all uncontrolled Select components to re-mount with new defaultValues
      setFormKey((k) => k + 1)

      toast({ title: 'Job description generated', description: 'Review the auto-filled fields and edit as needed.' })
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to connect to AI service' })
    } finally {
      setGenerating(false)
    }
  }

  function addSkill() {
    const tag = skillInput.trim()
    if (tag && !skills.includes(tag)) {
      const updated = [...skills, tag]
      setSkills(updated)
      setValue('skills', updated, { shouldValidate: true })
    }
    setSkillInput('')
  }

  function removeSkill(tag: string) {
    const updated = skills.filter((s) => s !== tag)
    setSkills(updated)
    setValue('skills', updated, { shouldValidate: true })
  }

  async function onSubmit(data: CreateJobInput) {
    if (!organization || !user) return
    setSaving(true)

    // Normalize optional deadline
    if (!data.application_deadline) {
      data.application_deadline = null as unknown as string
    }

    const supabase = createClient()
    const { data: newJob, error: createError } = await createJob(supabase, organization.id, data, user.id)

    if (createError) {
      toast({ variant: 'destructive', title: 'Error', description: createError.message })
      setSaving(false)
      return
    }

    // Clone/create scorecards for the new job
    if (newJob && pendingScorecards.length > 0) {
      for (const sc of pendingScorecards) {
        if (sc.mode === 'clone' && sc.sourceId) {
          await cloneScorecardForJob(supabase, sc.sourceId, newJob.id, organization.id, user.id, {
            label: sc.label || undefined,
            title: sc.title || undefined,
          })
        } else {
          const validCriteria = sc.criteria.filter((c) => c.name.trim())
          if (validCriteria.length > 0 || sc.title.trim()) {
            await createScorecardForJob(supabase, newJob.id, organization.id, user.id, {
              title: sc.title,
              description: sc.description || undefined,
              label: sc.label || undefined,
              criteria: validCriteria,
            })
          }
        }
      }
    }

    toast({ title: 'Job created', description: `"${data.title}" has been created successfully.` })
    router.push('/jobs')
  }

  function submitAs(status: 'draft' | 'published') {
    setValue('status', status)
    handleSubmit(onSubmit)()
  }

  if (!canCreateJobs) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-1">Only administrators can create new jobs.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900 mb-3" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />Back
        </Button>
        <h1 className="text-xl font-semibold text-gray-900">Create New Job</h1>
        <p className="text-gray-500 mt-1">Fill in the details for your new job posting. All fields are required.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* AI Job Description Generator */}
        <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              AI Job Description Generator
            </CardTitle>
            <p className="text-sm text-gray-600">Describe the role in 2-3 lines and let AI generate a complete job posting. You can review and edit everything before publishing.</p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Textarea
                placeholder="e.g. Looking for a Python developer with 3+ years experience in Django and REST APIs, based in Bangalore..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                className="bg-white resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleGenerate()
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !aiPrompt.trim()}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 px-6"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </span>
                ) : 'Generate'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Press Ctrl+Enter to generate. Regeneration will overwrite current values.</p>
          </CardContent>
        </Card>

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
                  <Label htmlFor="title">Job Title *</Label>
                  <Input id="title" placeholder="Senior Frontend Engineer" {...register('title')} />
                  {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department *</Label>
                    <Input id="department" placeholder="Engineering" {...register('department')} />
                    {errors.department && <p className="text-sm text-red-600">{errors.department.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location *</Label>
                    <LocationInput id="location" value={watch('location') ?? ''} onChange={(v) => setValue('location', v, { shouldValidate: true })} placeholder="Remote / New York" />
                    {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Employment Type *</Label>
                    <Select key={`et-${formKey}`} defaultValue={getValues('employment_type') || 'full_time'} onValueChange={(val) => setValue('employment_type', val as CreateJobInput['employment_type'])}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.employment_type && <p className="text-sm text-red-600">{errors.employment_type.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Remote Policy *</Label>
                    <Select key={`rp-${formKey}`} defaultValue={getValues('remote_policy') || 'on_site'} onValueChange={(val) => setValue('remote_policy', val as CreateJobInput['remote_policy'])}>
                      <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                      <SelectContent>
                        {REMOTE_POLICIES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.remote_policy && <p className="text-sm text-red-600">{errors.remote_policy.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Experience Level *</Label>
                    <Select key={`el-${formKey}`} defaultValue={getValues('experience_level') || undefined} onValueChange={(val) => setValue('experience_level', val as CreateJobInput['experience_level'], { shouldValidate: true })}>
                      <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                      <SelectContent>
                        {EXPERIENCE_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.experience_level && <p className="text-sm text-red-600">{errors.experience_level.message}</p>}
                  </div>
                </div>

                {/* Skills / Tags */}
                <div className="space-y-2">
                  <Label>Skills / Tags *</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a skill and press Enter"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addSkill() }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addSkill}>Add</Button>
                  </div>
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeSkill(s)}>
                          {s} <span className="text-xs ml-0.5">&times;</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {errors.skills && <p className="text-sm text-red-600">{errors.skills.message}</p>}
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
                  <Label>Job Description *</Label>
                  <RichTextEditor
                    value={watch('description')}
                    onChange={(val) => setValue('description', val, { shouldValidate: true })}
                    placeholder="Describe the role, responsibilities, and what makes it exciting..."
                    rows={15}
                  />
                  {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Requirements *</Label>
                  <RichTextEditor
                    value={watch('requirements')}
                    onChange={(val) => setValue('requirements', val, { shouldValidate: true })}
                    placeholder="List the skills, experience, and qualifications needed..."
                    rows={9}
                  />
                  {errors.requirements && <p className="text-sm text-red-600">{errors.requirements.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Nice to Have</Label>
                  <RichTextEditor
                    value={watch('nice_to_have') ?? ''}
                    onChange={(val) => setValue('nice_to_have', val, { shouldValidate: true })}
                    placeholder="Preferred but not required qualifications..."
                    rows={5}
                  />
                  {errors.nice_to_have && <p className="text-sm text-red-600">{errors.nice_to_have.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Benefits & Perks</Label>
                  <RichTextEditor
                    value={watch('benefits') ?? ''}
                    onChange={(val) => setValue('benefits', val, { shouldValidate: true })}
                    placeholder="Health insurance, PTO, equity, remote work, etc."
                    rows={5}
                  />
                  {errors.benefits && <p className="text-sm text-red-600">{errors.benefits.message}</p>}
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
                  <Label>Priority *</Label>
                  <Select key={`pr-${formKey}`} defaultValue={getValues('priority') || 'medium'} onValueChange={(val) => setValue('priority', val as CreateJobInput['priority'])}>
                    <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                    <SelectContent>
                      {JOB_PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.priority && <p className="text-sm text-red-600">{errors.priority.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="num_openings">No. of Openings *</Label>
                  <Input id="num_openings" type="number" min={1} defaultValue={1} {...register('num_openings')} />
                  {errors.num_openings && <p className="text-sm text-red-600">{errors.num_openings.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="application_deadline">Application Deadline</Label>
                  <Input id="application_deadline" type="date" {...register('application_deadline')} />
                  {errors.application_deadline && <p className="text-sm text-red-600">{errors.application_deadline.message}</p>}
                </div>
                {recruiters.length > 0 && (
                  <div className="space-y-3">
                    <Label>Assign Recruiters</Label>
                    <div className="space-y-1 rounded-lg border border-gray-200 p-2 max-h-56 overflow-y-auto">
                      {recruiters.map((r) => {
                        const checked = selectedRecruiterIds.includes(r.id)
                        const isOwner = r.id === jobOwnerId
                        return (
                          <div key={r.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                            isOwner
                              ? 'bg-emerald-50/80 ring-1 ring-emerald-200'
                              : checked
                                ? 'bg-blue-50/50 ring-1 ring-blue-100'
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
                                  // If unchecking the current owner, reset to creator
                                  if (r.id === jobOwnerId) {
                                    const fallback = user?.id ?? (updated.length > 0 ? updated[0] : null)
                                    setJobOwnerId(fallback)
                                    setValue('assigned_to', fallback)
                                  }
                                } else {
                                  updated = [...selectedRecruiterIds, r.id]
                                }
                                setSelectedRecruiterIds(updated)
                                setValue('recruiter_ids', updated)
                              }}
                            />
                            <span className={`text-sm flex-1 ${isOwner ? 'text-emerald-700 font-semibold' : checked ? 'text-gray-800' : 'text-gray-600'}`}>
                              {r.full_name}
                            </span>
                            <span className="text-[11px] text-gray-400">{r.role}</span>
                            {(checked || isOwner) && (
                              <button
                                type="button"
                                title={isOwner ? 'Job Owner' : 'Set as Owner'}
                                className={`w-6 h-6 flex items-center justify-center rounded-full transition-all shrink-0 ${
                                  isOwner
                                    ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300'
                                    : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                                }`}
                                onClick={() => {
                                  setJobOwnerId(r.id)
                                  setValue('assigned_to', r.id)
                                }}
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
                              setValue('recruiter_ids', updated)
                              if (id === jobOwnerId) {
                                const newOwner = updated.length > 0 ? updated[0] : null
                                setJobOwnerId(newOwner)
                                setValue('assigned_to', newOwner)
                              }
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
              </CardContent>
            </Card>

            {/* Requirements & Qualifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Min Education *</Label>
                  <Select key={`edu-${formKey}`} defaultValue={getValues('education_level') || undefined} onValueChange={(val) => setValue('education_level', val as CreateJobInput['education_level'], { shouldValidate: true })}>
                    <SelectTrigger><SelectValue placeholder="Select education" /></SelectTrigger>
                    <SelectContent>
                      {JOB_EDUCATION_LEVELS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.education_level && <p className="text-sm text-red-600">{errors.education_level.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="experience_min">Min Exp (Yrs) *</Label>
                    <Input id="experience_min" type="number" min={0} placeholder="0" {...register('experience_min')} />
                    {errors.experience_min && <p className="text-sm text-red-600">{errors.experience_min.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience_max">Max Exp (Yrs) *</Label>
                    <Input id="experience_max" type="number" min={0} placeholder="10" {...register('experience_max')} />
                    {errors.experience_max && <p className="text-sm text-red-600">{errors.experience_max.message}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compensation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compensation (Annual CTC)</CardTitle>
                <p className="text-sm text-gray-500">Enter the annual Cost to Company (CTC) range for this role</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Min Annual CTC *</Label>
                  <Input id="salary_min" type="number" placeholder="e.g. 800000" {...register('salary_min')} />
                  {errors.salary_min && <p className="text-sm text-red-600">{errors.salary_min.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Annual CTC *</Label>
                  <Input id="salary_max" type="number" placeholder="e.g. 1200000" {...register('salary_max')} />
                  {errors.salary_max && <p className="text-sm text-red-600">{errors.salary_max.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Currency *</Label>
                  <Select key={`cur-${formKey}`} defaultValue={getValues('salary_currency') || 'INR'} onValueChange={(val) => setValue('salary_currency', val)}>
                    <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
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
                  Scorecards used to evaluate candidates during interviews for this job.
                  Each scorecard becomes a job-specific copy — editing won&apos;t affect other jobs.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Selected scorecards */}
                {pendingScorecards.map((sc, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate">{sc.title}</span>
                        {sc.label && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{sc.label}</Badge>
                        )}
                        {sc.mode === 'clone' && (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 shrink-0">
                            <Copy className="w-2.5 h-2.5 mr-0.5" /> From Template
                          </Badge>
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
                          onClick={() => setPendingScorecards(pendingScorecards.filter((_, i) => i !== idx))}
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

                {pendingScorecards.length === 0 && (
                  <div className="text-center py-4 text-sm text-gray-400">
                    No scorecards assigned yet. Add from templates or create a new one.
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {orgScorecards.length > 0 && (
                    <Select
                      value=""
                      onValueChange={(scorecardId) => {
                        const source = orgScorecards.find((s) => s.id === scorecardId)
                        if (!source) return
                        setPendingScorecards([...pendingScorecards, {
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
                const entry: PendingScorecard = {
                  ...editForm,
                  ...data,
                  criteria: data.criteria.map((c, i) => ({ ...c, display_order: i })),
                }
                if (editingScorecardIdx !== null) {
                  const updated = [...pendingScorecards]
                  updated[editingScorecardIdx] = entry
                  setPendingScorecards(updated)
                } else {
                  setPendingScorecards([...pendingScorecards, entry])
                }
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6 pt-6 border-t">
          <Button type="button" variant="outline" disabled={saving} onClick={() => submitAs('draft')}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button type="button" disabled={saving} onClick={() => submitAs('published')}>
            {saving ? 'Publishing...' : 'Publish'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push('/jobs')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
