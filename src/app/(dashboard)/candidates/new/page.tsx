'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCandidateSchema, type CreateCandidateInput } from '@/lib/validators/candidate'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES, ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewCandidatePage() {
  const router = useRouter()
  const { user, organization } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setError('Only PDF and Word documents are allowed')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File size must be under 10MB')
      return
    }
    setError(null)
    setResumeFile(file)

    // Auto-parse only PDFs (Word docs not supported by unpdf)
    if (file.type === 'application/pdf') {
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
    const { data: candidate, error: createError } = await createCandidate(supabase, organization.id, data, user.id)

    if (createError) {
      setError(createError.message)
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

        // Trigger full parse in background to store resume_parsed_data
        fetch('/api/resumes/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id }),
        }).catch(() => {})
      }
    }

    router.push('/candidates')
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add Candidate</h1>
        <p className="text-gray-500 mt-1">Upload a resume to auto-fill details, or fill in manually</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      {/* ── Resume Upload (first, prominent) ── */}
      <Card className="mb-6 border-2 border-dashed border-gray-200 bg-gray-50/50">
        <CardContent className="pt-6 pb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            className="flex flex-col items-center text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              <div className="w-full space-y-2">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-indigo-700">Parsing resume with AI…</p>
                <p className="text-xs text-gray-400">Extracting candidate details</p>
                <div className="space-y-2 mt-3 text-left">
                  <Skeleton className="h-3 w-3/4 mx-auto" />
                  <Skeleton className="h-3 w-1/2 mx-auto" />
                  <Skeleton className="h-3 w-2/3 mx-auto" />
                </div>
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
                    {parsed ? '✓ Details auto-filled from resume · ' : ''}
                    <span className="text-indigo-600 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                      Change file
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Upload Resume to Auto-Fill</p>
                <p className="text-xs text-gray-400 mb-3">PDF, DOC, DOCX · up to 10MB</p>
                <Button type="button" size="sm" variant="outline" className="pointer-events-none">
                  Choose File
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" placeholder="John" {...register('first_name')} />
                {errors.first_name && <p className="text-sm text-red-600">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" placeholder="Doe" {...register('last_name')} />
                {errors.last_name && <p className="text-sm text-red-600">{errors.last_name.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register('email')} />
                {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" placeholder="+1 555 123 4567" {...register('phone')} />
                {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="New York, NY" {...register('location')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Professional Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current_company">Current Company</Label>
                <Input id="current_company" placeholder="Acme Inc." {...register('current_company')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_title">Current Title</Label>
                <Input id="current_title" placeholder="Senior Engineer" {...register('current_title')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input id="linkedin_url" placeholder="https://linkedin.com/in/..." {...register('linkedin_url')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portfolio_url">Portfolio URL</Label>
                <Input id="portfolio_url" placeholder="https://..." {...register('portfolio_url')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source & Tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="source_details">Source Details</Label>
                <Input id="source_details" placeholder="Referred by..." {...register('source_details')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag (press Enter)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                />
                <Button type="button" variant="outline" onClick={addTag}>Add</Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} placeholder="Any additional notes..." {...register('notes')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Checkbox
                id="gdpr_consent"
                checked={gdprConsent}
                onCheckedChange={(checked) => { if (checked === true) setValue('gdpr_consent', true) }}
              />
              <div>
                <Label htmlFor="gdpr_consent" className="text-sm font-medium cursor-pointer">GDPR Consent *</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Candidate has given consent to store and process their personal data.
                </p>
              </div>
            </div>
            {errors.gdpr_consent && (
              <p className="text-sm text-red-600 mt-2">{errors.gdpr_consent.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving || parsing}>
            {saving ? 'Adding...' : 'Add Candidate'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
