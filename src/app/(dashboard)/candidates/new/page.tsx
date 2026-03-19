'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCandidateSchema, type CreateCandidateInput, EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createCandidate } from '@/lib/services/candidates'
import { createApplication } from '@/lib/services/applications'
import { getJobById } from '@/lib/services/jobs'
import { CANDIDATE_SOURCES, ALLOWED_RESUME_TYPES, MAX_FILE_SIZE, CURRENCIES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationInput } from '@/components/ui/location-input'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Upload, FileText, Check, Sparkles, X, UserPlus } from 'lucide-react'

export default function NewCandidatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')
  const { toast } = useToast()
  const { user, organization } = useUser()
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(false)
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!jobId || !organization) return
    const supabase = createClient()
    getJobById(supabase, jobId, organization.id).then(({ data }) => {
      if (data) setJobTitle(data.title as string)
    })
  }, [jobId, organization])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema) as any,
    defaultValues: { source: 'direct', tags: [] },
  })

  const gdprConsent = watch('gdpr_consent')
  const [tagInput, setTagInput] = useState('')
  const tags = watch('tags') ?? []

  function addTag() {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setValue('tags', [...tags, tag])
      setTagInput('')
    }
  }

  function removeTag(tag: string) {
    setValue('tags', tags.filter((t) => t !== tag))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid File', description: 'Only PDF and Word documents are allowed' })
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'File size must be under 10MB' })
      return
    }

    setResumeFile(file)

    if (ALLOWED_RESUME_TYPES.includes(file.type)) {
      setParsing(true)
      setParsed(false)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/resumes/parse-preview', { method: 'POST', body: formData })
        if (res.ok) {
          const { data } = await res.json()
          if (data) {
            if (data.first_name) setValue('first_name', data.first_name)
            if (data.last_name) setValue('last_name', data.last_name)
            if (data.email) setValue('email', data.email)
            if (data.phone) setValue('phone', data.phone)
            if (data.current_title) setValue('current_title', data.current_title)
            if (data.current_company) setValue('current_company', data.current_company)
            if (data.location) setValue('location', data.location)
            if (data.linkedin_url) setValue('linkedin_url', data.linkedin_url)
            if (data.experience_years) setValue('experience_years', data.experience_years)
            if (data.notice_period) setValue('notice_period', data.notice_period as CreateCandidateInput['notice_period'])
            if (data.current_salary) setValue('current_salary', data.current_salary)
            if (data.expected_salary) setValue('expected_salary', data.expected_salary)
            if (data.skills && Array.isArray(data.skills) && data.skills.length > 0) {
              setValue('tags', data.skills)
            }
            setParsed(true)
          }
        }
      } catch {
        // Silently fail — user can fill manually
      } finally {
        setParsing(false)
      }
    }
  }

  async function onSubmit(data: CreateCandidateInput) {
    if (!organization || !user) return
    setSaving(true)

    const supabase = createClient()
    const { data: candidate, error: createError } = await createCandidate(supabase, organization.id, data, user.id)

    if (createError) {
      toast({ variant: 'destructive', title: 'Error', description: createError.message })
      setSaving(false)
      return
    }

    if (candidate?.id && resumeFile) {
      const fileExt = resumeFile.name.split('.').pop()
      const filePath = `${organization.id}/${candidate.id}/resume.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, resumeFile, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath)
        await supabase.from('candidates').update({ resume_url: publicUrl }).eq('id', candidate.id)

        fetch('/api/resumes/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id }),
        }).catch(() => {})
      }
    }

    if (candidate?.id && jobId) {
      const { error: appError } = await createApplication(supabase, organization.id, {
        candidate_id: candidate.id,
        job_id: jobId,
      })
      if (appError) {
        toast({ variant: 'destructive', title: 'Error', description: appError.message })
        setSaving(false)
        return
      }
      router.push(`/jobs/${jobId}/applications`)
      return
    }

    router.push('/candidates')
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900 mb-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-200">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
            <h1 className="text-xl font-semibold text-gray-900">New Candidate</h1>
            {jobTitle ? (
              <p className="text-sm text-gray-500 mt-1">
                Adding to <span className="font-medium text-gray-700">{jobTitle}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Fill in candidate details or upload a resume to auto-fill</p>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="hidden"
        />

        {parsing ? (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center animate-pulse">
              <Sparkles className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Parsing resume with AI...</p>
              <p className="text-xs text-gray-400 mt-0.5">Extracting candidate details automatically</p>
              <div className="flex gap-2 mt-3">
                <Skeleton className="h-2.5 w-24 rounded-full" />
                <Skeleton className="h-2.5 w-16 rounded-full" />
                <Skeleton className="h-2.5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        ) : resumeFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${parsed ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                {parsed ? (
                  <Check className="w-5 h-5 text-emerald-600" />
                ) : (
                  <FileText className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{resumeFile.name}</p>
                <p className="text-xs text-gray-400">
                  {parsed && 'Fields auto-filled from resume'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs"
            >
              Change file
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
              <Upload className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">Upload Resume</p>
              <p className="text-xs text-gray-400">PDF up to 10MB &mdash; AI will auto-fill fields</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="pointer-events-none text-xs">
              Browse
            </Button>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit, () => {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fix the highlighted fields before submitting' })
      })}>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

          {/* Section 1: Personal Information */}
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="first_name" className="text-xs font-medium text-gray-600">First Name <span className="text-red-500">*</span></Label>
                <Input id="first_name" placeholder="John" {...register('first_name')} className="h-9" />
                {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name" className="text-xs font-medium text-gray-600">Last Name <span className="text-red-500">*</span></Label>
                <Input id="last_name" placeholder="Doe" {...register('last_name')} className="h-9" />
                {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-gray-600">Email <span className="text-red-500">*</span></Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register('email')} className="h-9" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium text-gray-600">Phone <span className="text-red-500">*</span></Label>
                <Input id="phone" type="tel" placeholder="+91 98765 43210" {...register('phone')} className="h-9" />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location" className="text-xs font-medium text-gray-600">Location</Label>
                <LocationInput id="location" value={watch('location') ?? ''} onChange={(v) => setValue('location', v)} placeholder="Mumbai, India" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date_of_birth" className="text-xs font-medium text-gray-600">Date of Birth</Label>
                <Input id="date_of_birth" type="date" max={new Date().toISOString().split('T')[0]} {...register('date_of_birth')} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Gender</Label>
                <Select onValueChange={(val) => setValue('gender', val)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Professional Details */}
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Professional Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="current_company" className="text-xs font-medium text-gray-600">Current Company</Label>
                <Input id="current_company" placeholder="Acme Inc." {...register('current_company')} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_title" className="text-xs font-medium text-gray-600">Current Title</Label>
                <Input id="current_title" placeholder="Senior Engineer" {...register('current_title')} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="experience_years" className="text-xs font-medium text-gray-600">Years of Experience</Label>
                <Input id="experience_years" type="number" min={0} placeholder="5" {...register('experience_years', { valueAsNumber: true })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Education</Label>
                <Select onValueChange={(val) => setValue('education', val as CreateCandidateInput['education'])}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EDUCATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Notice Period</Label>
                <Select onValueChange={(val) => setValue('notice_period', val)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {NOTICE_PERIOD_OPTIONS.map((n) => (
                      <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="linkedin_url" className="text-xs font-medium text-gray-600">LinkedIn URL</Label>
                <Input id="linkedin_url" placeholder="https://linkedin.com/in/..." {...register('linkedin_url')} className="h-9" />
                {errors.linkedin_url && <p className="text-xs text-red-500">{errors.linkedin_url.message}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="portfolio_url" className="text-xs font-medium text-gray-600">Portfolio / Website</Label>
                <Input id="portfolio_url" placeholder="https://..." {...register('portfolio_url')} className="h-9" />
                {errors.portfolio_url && <p className="text-xs text-red-500">{errors.portfolio_url.message}</p>}
              </div>
            </div>
          </div>

          {/* Section 3: Compensation */}
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Compensation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="current_salary" className="text-xs font-medium text-gray-600">Current Salary ({CURRENCIES[0]})</Label>
                <Input id="current_salary" type="number" min={0} placeholder="0" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }} {...register('current_salary', { valueAsNumber: true })} className="h-9" />
                {errors.current_salary && <p className="text-xs text-red-500">{errors.current_salary.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expected_salary" className="text-xs font-medium text-gray-600">Expected Salary ({CURRENCIES[0]})</Label>
                <Input id="expected_salary" type="number" min={0} placeholder="0" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }} {...register('expected_salary', { valueAsNumber: true })} className="h-9" />
                {errors.expected_salary && <p className="text-xs text-red-500">{errors.expected_salary.message}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Source & Tags */}
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Source & Tags</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Source</Label>
                <Select
                  defaultValue="direct"
                  onValueChange={(val) => setValue('source', val as CreateCandidateInput['source'])}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANDIDATE_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source_details" className="text-xs font-medium text-gray-600">Source Details</Label>
                <Input id="source_details" placeholder="Referred by..." {...register('source_details')} className="h-9" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-gray-600">Tags / Skills</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    className="h-9"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addTag} className="h-9 px-4">
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs font-normal gap-1 pl-2.5 pr-1.5 py-1 bg-gray-100 text-gray-700 hover:bg-gray-100 border-0">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-600 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Additional Notes & Cover Letter */}
          <div className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Additional</h2>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="cover_letter" className="text-xs font-medium text-gray-600">Cover Letter</Label>
                <Textarea id="cover_letter" rows={3} placeholder="Candidate's cover letter or summary..." {...register('cover_letter')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-medium text-gray-600">Internal Notes</Label>
                <Textarea id="notes" rows={2} placeholder="Any private notes about this candidate..." {...register('notes')} />
              </div>
            </div>
          </div>
        </div>

        {/* GDPR Consent */}
        <div className="bg-white rounded-xl border border-gray-200 mt-6 p-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="gdpr_consent"
              checked={gdprConsent}
              onCheckedChange={(checked) => { if (checked === true) setValue('gdpr_consent', true) }}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="gdpr_consent" className="text-sm font-medium text-gray-900 cursor-pointer">
                Data Processing Consent <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-gray-400 mt-0.5">
                Candidate has given consent to store and process their personal data in accordance with GDPR.
              </p>
            </div>
          </div>
          {errors.gdpr_consent && (
            <p className="text-xs text-red-500 mt-2 ml-7">{errors.gdpr_consent.message}</p>
          )}
        </div>

        {/* Actions */}
        <Separator className="my-6" />
        <div className="flex items-center gap-3 pb-8">
          <Button type="submit" disabled={saving || parsing} className="h-9 px-6">
            {saving ? 'Saving...' : 'Add Candidate'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-9 px-6">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
