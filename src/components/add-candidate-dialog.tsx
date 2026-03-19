'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCandidateSchema, type CreateCandidateInput } from '@/lib/validators/candidate'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createCandidate } from '@/lib/services/candidates'
import { createApplication } from '@/lib/services/applications'
import { CANDIDATE_SOURCES, ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface AddCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  jobTitle: string
  onSuccess?: () => void
}

export function AddCandidateDialog({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onSuccess,
}: AddCandidateDialogProps) {
  const { user, organization } = useUser()
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema) as any,
    defaultValues: { source: 'direct', tags: [] },
  })

  const gdprConsent = watch('gdpr_consent')
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

  function resetForm() {
    reset({ source: 'direct', tags: [] })
    setResumeFile(null)
    setParsing(false)
    setParsed(false)
    setSaving(false)
    setError(null)
    setTagInput('')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
      setError('Only PDF and Word documents are allowed')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File size must be under 10MB')
      return
    }
    setError(null)
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
            // Set tags from parsed skills
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
    setError(null)

    const supabase = createClient()

    // 1. Create candidate
    const { data: candidate, error: createError } = await createCandidate(supabase, organization.id, data, user.id)

    if (createError) {
      setError(createError.message)
      setSaving(false)
      return
    }

    // 2. Upload resume if provided
    if (candidate?.id && resumeFile) {
      const fileExt = resumeFile.name.split('.').pop()
      const filePath = `${organization.id}/${candidate.id}/resume.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, resumeFile, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath)
        await supabase.from('candidates').update({ resume_url: publicUrl }).eq('id', candidate.id)

        // Trigger full parse in background
        fetch('/api/resumes/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id }),
        }).catch(() => {})
      }
    }

    // 3. Create application for this job
    if (candidate?.id) {
      const { error: appError } = await createApplication(supabase, organization.id, {
        candidate_id: candidate.id,
        job_id: jobId,
      })

      if (appError) {
        setError(appError.message)
        setSaving(false)
        return
      }
    }

    onOpenChange(false)
    resetForm()
    onSuccess?.()
  }

  const req = <span className="text-red-500">*</span>

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
          <DialogDescription>
            Add a candidate to <strong>{jobTitle}</strong>. Upload a resume to auto-fill details.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded-md">{error}</div>
        )}

        {/* Resume Upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            className="flex flex-col items-center text-center p-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50 cursor-pointer hover:border-gray-300 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              <div className="w-full space-y-2">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2 animate-pulse">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-indigo-700">Parsing resume with AI...</p>
                <Skeleton className="h-3 w-1/2 mx-auto" />
                <Skeleton className="h-3 w-1/3 mx-auto" />
              </div>
            ) : resumeFile ? (
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${parsed ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {parsed ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">{resumeFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {parsed ? 'Details auto-filled from resume' : 'Uploaded'}
                    {' · '}
                    <span className="text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>Change file</span>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">Upload Resume to Auto-Fill</p>
                <p className="text-xs text-gray-400">PDF, DOC, DOCX - up to 10MB</p>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Personal Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Personal Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acd-first_name">First Name {req}</Label>
                <Input id="acd-first_name" placeholder="John" {...register('first_name')} />
                {errors.first_name && <p className="text-xs text-red-600">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acd-last_name">Last Name {req}</Label>
                <Input id="acd-last_name" placeholder="Doe" {...register('last_name')} />
                {errors.last_name && <p className="text-xs text-red-600">{errors.last_name.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acd-email">Email {req}</Label>
                <Input id="acd-email" type="email" placeholder="john@example.com" {...register('email')} />
                {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acd-phone">Phone {req}</Label>
                <Input id="acd-phone" type="tel" placeholder="+91 98765 43210" {...register('phone')} />
                {errors.phone && <p className="text-xs text-red-600">{errors.phone.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acd-location">Location</Label>
              <Input id="acd-location" placeholder="Mumbai, India" {...register('location')} />
            </div>
          </div>

          {/* Professional Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Professional Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acd-current_company">Current Company</Label>
                <Input id="acd-current_company" placeholder="Acme Inc." {...register('current_company')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acd-current_title">Current Title</Label>
                <Input id="acd-current_title" placeholder="Senior Engineer" {...register('current_title')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acd-linkedin_url">LinkedIn URL</Label>
                <Input id="acd-linkedin_url" placeholder="https://linkedin.com/in/..." {...register('linkedin_url')} />
                {errors.linkedin_url && <p className="text-xs text-red-600">{errors.linkedin_url.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acd-portfolio_url">Portfolio URL</Label>
                <Input id="acd-portfolio_url" placeholder="https://..." {...register('portfolio_url')} />
                {errors.portfolio_url && <p className="text-xs text-red-600">{errors.portfolio_url.message}</p>}
              </div>
            </div>
          </div>

          {/* Source & Tags */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Source & Tags</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select
                  defaultValue="direct"
                  onValueChange={(val) => setValue('source', val as CreateCandidateInput['source'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANDIDATE_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acd-source_details">Source Details</Label>
                <Input id="acd-source_details" placeholder="Referred by..." {...register('source_details')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag (press Enter)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag} <span className="text-xs">&times;</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acd-notes">Notes</Label>
              <Textarea id="acd-notes" rows={2} placeholder="Any additional notes..." {...register('notes')} />
            </div>
          </div>

          {/* GDPR Consent */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <Checkbox
              id="acd-gdpr"
              checked={gdprConsent}
              onCheckedChange={(checked) => { if (checked === true) setValue('gdpr_consent', true) }}
            />
            <div>
              <Label htmlFor="acd-gdpr" className="text-sm font-medium cursor-pointer">GDPR Consent {req}</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Candidate has given consent to store and process their personal data.
              </p>
            </div>
          </div>
          {errors.gdpr_consent && (
            <p className="text-xs text-red-600">{errors.gdpr_consent.message}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving || parsing}>
              {saving ? 'Adding...' : 'Add Candidate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
