'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createJobSchema, type CreateJobInput } from '@/lib/validators/job'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createJob, upsertScorecardCriteria } from '@/lib/services/jobs'
import {
  EMPLOYMENT_TYPES, CURRENCIES, EXPERIENCE_LEVELS, REMOTE_POLICIES,
  JOB_PRIORITIES, JOB_EDUCATION_LEVELS,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getAssignableRecruiters } from '../actions'

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
  const { isAdmin } = useRole()
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [saving, setSaving] = useState(false)
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [criteria, setCriteria] = useState<Array<{ name: string; description: string; weight: number }>>([
    { name: 'Technical Skills', description: '', weight: 8 },
    { name: 'Communication', description: '', weight: 6 },
    { name: 'Culture Fit', description: '', weight: 5 },
  ])

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
  const { register, handleSubmit, formState: { errors }, setValue, getValues } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema) as any,
    defaultValues: {
      employment_type: 'full_time',
      salary_currency: 'USD',
      remote_policy: 'on_site',
      priority: 'medium',
      num_openings: 1,
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

      // Auto-fill all text fields
      if (d.title) setValue('title', d.title)
      if (d.department) setValue('department', d.department)
      if (d.location) setValue('location', d.location)
      if (d.description) setValue('description', d.description)
      if (d.requirements) setValue('requirements', d.requirements)
      if (d.nice_to_have) setValue('nice_to_have', d.nice_to_have)
      if (d.benefits) setValue('benefits', d.benefits)

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

    const supabase = createClient()
    const { data: newJob, error: createError } = await createJob(supabase, organization.id, data, user.id)

    if (createError) {
      toast({ variant: 'destructive', title: 'Error', description: createError.message })
      setSaving(false)
      return
    }

    if (newJob && criteria.length > 0) {
      const validCriteria = criteria.filter((c) => c.name.trim())
      if (validCriteria.length > 0) {
        await upsertScorecardCriteria(supabase, newJob.id, organization.id, validCriteria)
      }
    }

    toast({ title: 'Job created', description: `"${data.title}" has been created successfully.` })
    router.push('/jobs')
  }

  function submitAs(status: 'draft' | 'published') {
    setValue('status', status)
    handleSubmit(onSubmit)()
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Job</h1>
        <p className="text-gray-500 mt-1">Fill in the details for your new job posting. All fields are required.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* AI Job Description Generator */}
        <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
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
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
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
                    <Input id="location" placeholder="Remote / New York" {...register('location')} />
                    {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Employment Type *</Label>
                    <Select key={`et-${formKey}`} defaultValue={getValues('employment_type') || 'full_time'} onValueChange={(val) => setValue('employment_type', val as CreateJobInput['employment_type'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
                  <Label htmlFor="description">Job Description *</Label>
                  <Textarea
                    id="description"
                    rows={15}
                    placeholder="Describe the role, responsibilities, and what makes it exciting..."
                    {...register('description')}
                  />
                  {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requirements">Requirements *</Label>
                  <Textarea
                    id="requirements"
                    rows={9}
                    placeholder="List the skills, experience, and qualifications needed..."
                    {...register('requirements')}
                  />
                  {errors.requirements && <p className="text-sm text-red-600">{errors.requirements.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nice_to_have">Nice to Have *</Label>
                  <Textarea
                    id="nice_to_have"
                    rows={5}
                    placeholder="Preferred but not required qualifications..."
                    {...register('nice_to_have')}
                  />
                  {errors.nice_to_have && <p className="text-sm text-red-600">{errors.nice_to_have.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="benefits">Benefits & Perks *</Label>
                  <Textarea
                    id="benefits"
                    rows={5}
                    placeholder="Health insurance, PTO, equity, remote work, etc."
                    {...register('benefits')}
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label htmlFor="application_deadline">Application Deadline *</Label>
                  <Input id="application_deadline" type="date" {...register('application_deadline')} />
                  {errors.application_deadline && <p className="text-sm text-red-600">{errors.application_deadline.message}</p>}
                </div>
                {isAdmin && recruiters.length > 0 && (
                  <div className="space-y-2">
                    <Label>Assign Recruiter</Label>
                    <Select
                      key={`ar-${formKey}`}
                      defaultValue={getValues('assigned_to') ?? '__unassigned'}
                      onValueChange={(val) => setValue('assigned_to', val === '__unassigned' ? null : val)}
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

            {/* Requirements & Qualifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Min Education *</Label>
                  <Select key={`edu-${formKey}`} defaultValue={getValues('education_level') || undefined} onValueChange={(val) => setValue('education_level', val as CreateJobInput['education_level'], { shouldValidate: true })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
                <CardTitle className="text-lg">Compensation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Min Salary *</Label>
                  <Input id="salary_min" type="number" placeholder="80000" {...register('salary_min')} />
                  {errors.salary_min && <p className="text-sm text-red-600">{errors.salary_min.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Max Salary *</Label>
                  <Input id="salary_max" type="number" placeholder="120000" {...register('salary_max')} />
                  {errors.salary_max && <p className="text-sm text-red-600">{errors.salary_max.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Currency *</Label>
                  <Select key={`cur-${formKey}`} defaultValue={getValues('salary_currency') || 'USD'} onValueChange={(val) => setValue('salary_currency', val)}>
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
