'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

interface ApplyFormProps {
  jobId: string
  orgId: string
}

export function ApplyForm({ jobId, orgId }: ApplyFormProps) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    linkedin_url: '',
  })
  const [gdprConsent, setGdprConsent] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gdprConsent) {
      setError('You must consent to data processing to apply')
      return
    }
    if (!form.first_name || !form.last_name || !form.email || !form.phone) {
      setError('Please fill in all required fields')
      return
    }
    if (!resumeFile) {
      setError('Please upload your resume')
      return
    }

    setSubmitting(true)
    setError(null)

    const supabase = createClient()

    // 1. Create or find candidate
    // Check if candidate already exists by email in this org
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', form.email)
      .maybeSingle()

    let candidateId: string

    if (existingCandidate) {
      candidateId = existingCandidate.id
    } else {
      const { data: newCandidate, error: createError } = await supabase
        .from('candidates')
        .insert({
          organization_id: orgId,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone || null,
          linkedin_url: form.linkedin_url || null,
          source: 'careers_page',
          gdpr_consent: true,
          gdpr_consent_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createError) {
        setError(createError.message)
        setSubmitting(false)
        return
      }
      candidateId = newCandidate.id
    }

    // 2. Upload resume if provided
    if (resumeFile) {
      const fileExt = resumeFile.name.split('.').pop()
      const filePath = `${orgId}/${candidateId}/resume.${fileExt}`

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
          .eq('id', candidateId)
      }
    }

    // 3. Find first pipeline stage
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('job_id', jobId)
      .order('display_order', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) {
      setError('Unable to process application. Please try again later.')
      setSubmitting(false)
      return
    }

    // 4. Check for duplicate application
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingApp) {
      setError('You have already applied for this position.')
      setSubmitting(false)
      return
    }

    // 5. Create application
    const { error: appError } = await supabase
      .from('applications')
      .insert({
        organization_id: orgId,
        candidate_id: candidateId,
        job_id: jobId,
        current_stage_id: firstStage.id,
        status: 'active',
        applied_at: new Date().toISOString(),
      })

    if (appError) {
      setError(appError.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
  }

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="text-green-600 text-3xl mb-3">&#10003;</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Application Submitted!</h3>
          <p className="text-sm text-gray-500">
            Thank you for applying. We&apos;ll review your application and get back to you.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Apply Now</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2 rounded mb-3">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              required
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              required
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              required
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn URL</Label>
            <Input
              id="linkedin"
              value={form.linkedin_url}
              onChange={(e) => setForm((p) => ({ ...p, linkedin_url: e.target.value }))}
            />
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

          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="gdpr"
              checked={gdprConsent}
              onCheckedChange={(checked) => setGdprConsent(checked === true)}
            />
            <Label htmlFor="gdpr" className="text-xs text-gray-500 cursor-pointer leading-tight">
              I consent to the storage and processing of my personal data for recruitment purposes. *
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
