'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { EDUCATION_LABELS, GENDER_OPTIONS, NOTICE_PERIOD_OPTIONS } from '@/lib/validators/candidate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

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
    portfolio_url: '',
    current_company: '',
    current_title: '',
    location: '',
    current_salary: '',
    expected_salary: '',
    education: '',
    experience_years: '',
    notice_period: '',
    gender: '',
    date_of_birth: '',
    cover_letter: '',
  })
  const [gdprConsent, setGdprConsent] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Only PDF, DOC, and DOCX files are allowed', variant: 'destructive' })
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'File too large', description: 'File size must be under 10MB', variant: 'destructive' })
      return
    }
    setResumeFile(file)

    // Auto-fill form from resume
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/public/parse-resume', { method: 'POST', body: fd })
      if (res.ok) {
        const { data } = await res.json()
        if (data) {
          setForm((prev) => {
            const updated = { ...prev }
            const fieldMap: Record<string, string> = {
              first_name: 'first_name',
              last_name: 'last_name',
              email: 'email',
              phone: 'phone',
              current_title: 'current_title',
              current_company: 'current_company',
              location: 'location',
              experience_years: 'experience_years',
              education_level: 'education',
              linkedin_url: 'linkedin_url',
              current_salary: 'current_salary',
              expected_salary: 'expected_salary',
              notice_period: 'notice_period',
            }
            for (const [responseKey, formKey] of Object.entries(fieldMap)) {
              const val = data[responseKey]
              if (val != null && val !== '' && !updated[formKey as keyof typeof updated]) {
                updated[formKey as keyof typeof updated] = String(val)
              }
            }
            return updated
          })
          toast({ title: 'Resume parsed!', description: 'Please review the auto-filled fields.' })
        }
      } else {
        toast({ title: 'Could not auto-fill', description: 'Please fill the form manually.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not auto-fill', description: 'Please fill the form manually.', variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  function updateField(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gdprConsent) {
      toast({ title: 'Consent required', description: 'You must consent to data processing to apply', variant: 'destructive' })
      return
    }

    // Validate required fields
    const requiredFields = [
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'current_company', label: 'Current Company' },
      { key: 'current_title', label: 'Current Job Title' },
      { key: 'location', label: 'Location' },
      { key: 'current_salary', label: 'Current Salary' },
      { key: 'expected_salary', label: 'Expected Salary' },
      { key: 'education', label: 'Education' },
      { key: 'experience_years', label: 'Total Experience' },
      { key: 'notice_period', label: 'Notice Period' },
      { key: 'gender', label: 'Gender' },
    ]

    for (const { key, label } of requiredFields) {
      if (!form[key as keyof typeof form]) {
        toast({ title: 'Missing field', description: `${label} is required`, variant: 'destructive' })
        return
      }
    }

    if (!resumeFile) {
      toast({ title: 'Resume required', description: 'Please upload your resume', variant: 'destructive' })
      return
    }

    const currentSalary = parseFloat(form.current_salary)
    const expectedSalary = parseFloat(form.expected_salary)
    const experienceYears = parseFloat(form.experience_years)

    if (isNaN(currentSalary) || currentSalary <= 0) {
      toast({ title: 'Invalid salary', description: 'Please enter a valid current salary', variant: 'destructive' })
      return
    }
    if (isNaN(expectedSalary) || expectedSalary <= 0) {
      toast({ title: 'Invalid salary', description: 'Please enter a valid expected salary', variant: 'destructive' })
      return
    }
    if (isNaN(experienceYears) || experienceYears < 0) {
      toast({ title: 'Invalid experience', description: 'Please enter valid experience years', variant: 'destructive' })
      return
    }

    setSubmitting(true)

    // 1. Upload resume first (uses Supabase storage directly)
    let resumeUrl: string | undefined
    if (resumeFile) {
      const supabase = createClient()
      const fileExt = resumeFile.name.split('.').pop()
      const tempId = crypto.randomUUID()
      const filePath = `${orgId}/${tempId}/resume.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, resumeFile, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('resumes')
          .getPublicUrl(filePath)
        resumeUrl = publicUrl
      }
    }

    // 2. Submit application via server API (bypasses RLS)
    try {
      const res = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          orgId,
          form: {
            ...form,
            current_salary: String(currentSalary),
            expected_salary: String(expectedSalary),
            experience_years: String(experienceYears),
          },
          resumeUrl,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({ title: 'Application failed', description: data.error || 'Failed to submit application', variant: 'destructive' })
        setSubmitting(false)
        return
      }

      setSuccess(true)
    } catch {
      toast({ title: 'Error', description: 'Failed to submit application. Please try again.', variant: 'destructive' })
    }
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
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Resume Upload */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Resume</h3>
            <div className="space-y-1">
              <Label>Resume *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
              >
                {parsing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Parsing resume...
                  </span>
                ) : resumeFile ? resumeFile.name : 'Upload Resume (PDF, DOC, DOCX)'}
              </Button>
              {parsing && (
                <p className="text-xs text-blue-600 animate-pulse">Extracting information from your resume to auto-fill the form...</p>
              )}
              <p className="text-xs text-gray-400">PDF, DOC, DOCX — max 10MB. Upload first to auto-fill the form.</p>
            </div>
          </div>

          {/* Personal Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Personal Information</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    required
                    placeholder="John"
                    value={form.first_name}
                    onChange={(e) => updateField('first_name', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    required
                    placeholder="Doe"
                    value={form.last_name}
                    onChange={(e) => updateField('last_name', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="gender">Gender *</Label>
                  <Select value={form.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger id="gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={form.date_of_birth}
                    onChange={(e) => updateField('date_of_birth', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  required
                  placeholder="City, Country"
                  value={form.location}
                  onChange={(e) => updateField('location', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Professional Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Professional Details</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="current_company">Current Company *</Label>
                <Input
                  id="current_company"
                  required
                  placeholder="Acme Corp"
                  value={form.current_company}
                  onChange={(e) => updateField('current_company', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="current_title">Current Job Title *</Label>
                <Input
                  id="current_title"
                  required
                  placeholder="Software Engineer"
                  value={form.current_title}
                  onChange={(e) => updateField('current_title', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="experience_years">Total Experience (Years) *</Label>
                  <Input
                    id="experience_years"
                    type="number"
                    required
                    min="0"
                    step="0.5"
                    placeholder="5"
                    value={form.experience_years}
                    onChange={(e) => updateField('experience_years', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="notice_period">Notice Period *</Label>
                  <Select value={form.notice_period} onValueChange={(v) => updateField('notice_period', v)}>
                    <SelectTrigger id="notice_period">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTICE_PERIOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="education">Highest Education *</Label>
                <Select value={form.education} onValueChange={(v) => updateField('education', v)}>
                  <SelectTrigger id="education">
                    <SelectValue placeholder="Select education level" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EDUCATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Compensation */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Compensation</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="current_salary">Current Salary (Annual) *</Label>
                <Input
                  id="current_salary"
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 80000"
                  value={form.current_salary}
                  onChange={(e) => updateField('current_salary', e.target.value)}
                  onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expected_salary">Expected Salary (Annual) *</Label>
                <Input
                  id="expected_salary"
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 100000"
                  value={form.expected_salary}
                  onChange={(e) => updateField('expected_salary', e.target.value)}
                  onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault() }}
                />
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Links</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="linkedin">LinkedIn URL</Label>
                <Input
                  id="linkedin"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin_url}
                  onChange={(e) => updateField('linkedin_url', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="portfolio">Portfolio / Website</Label>
                <Input
                  id="portfolio"
                  placeholder="https://..."
                  value={form.portfolio_url}
                  onChange={(e) => updateField('portfolio_url', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Cover Letter */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Cover Letter</h3>
            <div className="space-y-1">
              <Label htmlFor="cover_letter">Cover Letter</Label>
              <Textarea
                id="cover_letter"
                rows={4}
                placeholder="Tell us why you're a great fit for this role..."
                value={form.cover_letter}
                onChange={(e) => updateField('cover_letter', e.target.value)}
              />
            </div>
          </div>

          {/* GDPR Consent */}
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

          <Button type="submit" className="w-full" disabled={submitting || parsing}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
