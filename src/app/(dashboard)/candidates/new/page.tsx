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

export default function NewCandidatePage() {
  const router = useRouter()
  const { user, organization } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema) as any,
    defaultValues: {
      source: 'direct',
      tags: [],
    },
  })

  const gdprConsent = watch('gdpr_consent')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
  }

  async function onSubmit(data: CreateCandidateInput) {
    if (!organization || !user) return
    if (!resumeFile) {
      setError('Please upload a resume')
      return
    }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: candidate, error: createError } = await createCandidate(supabase, organization.id, data, user.id)

    if (createError) {
      setError(createError.message)
      setSaving(false)
      return
    }

    // Upload resume
    if (candidate?.id) {
      const fileExt = resumeFile.name.split('.').pop()
      const filePath = `${organization.id}/${candidate.id}/resume.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, resumeFile, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('resumes')
          .getPublicUrl(filePath)
        await supabase
          .from('candidates')
          .update({ resume_url: publicUrl })
          .eq('id', candidate.id)
      }
    }

    router.push('/candidates')
  }

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

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Candidate</h1>
        <p className="text-gray-500 mt-1">Add a new candidate to your talent pool</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

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

            <div className="space-y-2">
              <Label>Resume *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                {resumeFile ? resumeFile.name : 'Upload Resume (PDF/Word)'}
              </Button>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTag}>Add</Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded"
                    >
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">
                        &times;
                      </button>
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
                <Label htmlFor="gdpr_consent" className="text-sm font-medium cursor-pointer">
                  GDPR Consent *
                </Label>
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
          <Button type="submit" disabled={saving}>
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
