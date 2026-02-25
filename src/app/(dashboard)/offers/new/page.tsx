'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getApplicationById } from '@/lib/services/applications'
import { getEmailTemplates } from '@/lib/services/email'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import {
  DEFAULT_OFFER_TEMPLATE, SALARY_STRUCTURE_CONFIG,
  EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS, REMUNERATION_TYPES, CURRENCIES, CANDIDATE_SOURCES,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section: string // 'earnings' | 'deduction' | 'employer'
}

interface BonusComponent {
  name: string
  amount: number
  frequency: string
}

interface OfferFormData {
  // Step 1 — Job Details
  jobTitle: string
  department: string
  businessUnit: string
  employmentType: string
  workType: string
  location: string
  reportingManager: string
  startDate: string
  expiryDate: string
  // Step 2 — Compensation
  currency: string
  remunerationType: string
  totalSalary: number
  pfApplicable: boolean
  salaryComponents: SalaryComponent[]
  bonusComponents: BonusComponent[]
  // Step 3 — Offer Details
  templateHtml: string
}

const STEP_LABELS = ['Job Details', 'Compensation', 'Offer Details', 'Preview & Send']

// Build salary components from CTC — matches standard Indian payroll structure
// Structure: Earnings → SUB TOTAL (Gross) → Gratuity/PF → TOTAL (CTC)
// Deductions: Employee PF, Professional Tax → NET PAY
function buildSalaryComponents(ctc: number, pfApplicable: boolean): SalaryComponent[] {
  if (ctc <= 0) return []

  const cfg = SALARY_STRUCTURE_CONFIG

  // Basic = 30% of CTC
  const basic = Math.round(ctc * cfg.basicPctOfCtc / 100)

  // Employer contributions
  const gratuity = Math.round(basic * cfg.gratuityPctOfBasic / 100)
  const employerPf = pfApplicable ? Math.round(basic * cfg.employerPfPctOfBasic / 100) : 0

  // Gross (SUB TOTAL) = CTC - employer contributions
  const gross = ctc - gratuity - employerPf

  // Fixed earning components
  const hra = Math.round(basic * cfg.hraPctOfBasic / 100)
  const lta = Math.round(ctc * cfg.ltaPctOfCtc / 100)
  const uniform = cfg.uniformMonthly * 12
  const bonusAllowance = Math.round(basic * cfg.bonusAllowancePctOfBasic / 100)
  const flexiPay = Math.round(ctc * cfg.flexiPayPctOfCtc / 100)

  // Special Allowance = balancing figure
  const specialAllowance = Math.max(0, gross - basic - hra - lta - uniform - bonusAllowance - flexiPay)

  const components: SalaryComponent[] = [
    // Earnings
    { name: 'Basic', monthly: Math.round(basic / 12), annual: basic, section: 'earnings' },
    { name: 'HRA', monthly: Math.round(hra / 12), annual: hra, section: 'earnings' },
    { name: 'Special Allowance', monthly: Math.round(specialAllowance / 12), annual: specialAllowance, section: 'earnings' },
    { name: 'Travel Reimbursement (LTA)', monthly: Math.round(lta / 12), annual: lta, section: 'earnings' },
    { name: 'Uniform', monthly: Math.round(uniform / 12), annual: uniform, section: 'earnings' },
    { name: 'Bonus Allowance', monthly: Math.round(bonusAllowance / 12), annual: bonusAllowance, section: 'earnings' },
    { name: 'Flexi Pay', monthly: Math.round(flexiPay / 12), annual: flexiPay, section: 'earnings' },
    // Employer contributions (shown after SUB TOTAL)
    { name: 'Gratuity', monthly: Math.round(gratuity / 12), annual: gratuity, section: 'employer' },
  ]

  if (pfApplicable) {
    components.push(
      { name: 'Employer PF', monthly: Math.round(employerPf / 12), annual: employerPf, section: 'employer' },
    )
    // Employee PF deduction
    const employeePf = Math.round(basic * cfg.employeePfPctOfBasic / 100)
    components.push(
      { name: 'Employee PF', monthly: Math.round(employeePf / 12), annual: employeePf, section: 'deduction' },
    )
  }

  // Professional Tax deduction
  components.push(
    { name: 'Professional Tax', monthly: Math.round(cfg.professionalTaxAnnual / 12), annual: cfg.professionalTaxAnnual, section: 'deduction' },
  )

  return components
}

export default function NewOfferWizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const applicationId = searchParams.get('applicationId')
  const { organization, isLoading: userLoading } = useUser()
  const { connected: gmailConnected } = useGmailStatus()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Application data
  const [application, setApplication] = useState<AnyData | null>(null)
  const [templates, setTemplates] = useState<AnyData[]>([])

  // Form state
  const [form, setForm] = useState<OfferFormData>({
    jobTitle: '',
    department: '',
    businessUnit: '',
    employmentType: 'full_time',
    workType: 'on_site',
    location: '',
    reportingManager: '',
    startDate: '',
    expiryDate: '',
    currency: 'INR',
    remunerationType: 'annual',
    totalSalary: 0,
    pfApplicable: true,
    salaryComponents: [],
    bonusComponents: [],
    templateHtml: DEFAULT_OFFER_TEMPLATE,
  })

  const [showPreview, setShowPreview] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const candidate = application?.candidate
  const job = application?.job
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : ''

  // Load application + templates
  const loadData = useCallback(async () => {
    if (!organization || !applicationId) return
    setLoading(true)
    const supabase = createClient()

    const [appResult, templatesResult] = await Promise.all([
      getApplicationById(supabase, applicationId, organization.id),
      getEmailTemplates(supabase, organization.id, 'offer'),
    ])

    if (appResult.error || !appResult.data) {
      setError(appResult.error?.message || 'Application not found')
      setLoading(false)
      return
    }

    const app = appResult.data
    setApplication(app)
    setTemplates(templatesResult.data || [])

    // Pre-fill form from application data
    setForm((prev) => ({
      ...prev,
      jobTitle: app.job?.title || '',
      department: app.job?.department || '',
      employmentType: app.job?.employment_type || 'full_time',
      location: app.candidate?.location || app.job?.location || '',
    }))

    setLoading(false)
  }, [organization, applicationId])

  useEffect(() => {
    if (!organization) return
    if (!applicationId) {
      setError('No application ID provided')
      setLoading(false)
      return
    }
    loadData()
  }, [organization, applicationId, loadData])

  // Rebuild salary structure when CTC or PF changes
  function handleTotalSalaryChange(value: number) {
    const components = buildSalaryComponents(value, form.pfApplicable)
    setForm((prev) => ({ ...prev, totalSalary: value, salaryComponents: components }))
  }

  function handlePfToggle(checked: boolean) {
    const components = buildSalaryComponents(form.totalSalary, checked)
    setForm((prev) => ({ ...prev, pfApplicable: checked, salaryComponents: components }))
  }

  function handleComponentChange(index: number, field: 'name' | 'monthly' | 'annual', value: string | number) {
    setForm((prev) => {
      const updated = [...prev.salaryComponents]
      if (field === 'name') {
        updated[index] = { ...updated[index], name: value as string }
      } else if (field === 'annual') {
        const annual = Number(value) || 0
        updated[index] = { ...updated[index], annual, monthly: Math.round(annual / 12) }
      } else if (field === 'monthly') {
        const monthly = Number(value) || 0
        updated[index] = { ...updated[index], monthly, annual: monthly * 12 }
      }
      return { ...prev, salaryComponents: updated }
    })
  }

  function addSalaryComponent(section: string) {
    setForm((prev) => ({
      ...prev,
      salaryComponents: [...prev.salaryComponents, { name: '', monthly: 0, annual: 0, section }],
    }))
  }

  function removeSalaryComponent(index: number) {
    setForm((prev) => ({
      ...prev,
      salaryComponents: prev.salaryComponents.filter((_, i) => i !== index),
    }))
  }

  function addBonusComponent() {
    setForm((prev) => ({
      ...prev,
      bonusComponents: [...prev.bonusComponents, { name: '', amount: 0, frequency: 'annual' }],
    }))
  }

  function removeBonusComponent(index: number) {
    setForm((prev) => ({
      ...prev,
      bonusComponents: prev.bonusComponents.filter((_, i) => i !== index),
    }))
  }

  function handleBonusChange(index: number, field: 'name' | 'amount' | 'frequency', value: string | number) {
    setForm((prev) => {
      const updated = [...prev.bonusComponents]
      if (field === 'amount') {
        updated[index] = { ...updated[index], amount: Number(value) || 0 }
      } else {
        updated[index] = { ...updated[index], [field]: value as string }
      }
      return { ...prev, bonusComponents: updated }
    })
  }

  function handleTemplateSelect(templateId: string) {
    if (templateId === 'default') {
      setForm((prev) => ({ ...prev, templateHtml: DEFAULT_OFFER_TEMPLATE }))
      return
    }
    const t = templates.find((t) => t.id === templateId)
    if (t) {
      setForm((prev) => ({ ...prev, templateHtml: t.body_html }))
    }
  }

  // Computed values
  const earnings = form.salaryComponents.filter((c) => c.section === 'earnings')
  const deductions = form.salaryComponents.filter((c) => c.section === 'deduction')
  const employerContribs = form.salaryComponents.filter((c) => c.section === 'employer')
  const grossAnnual = earnings.reduce((s, c) => s + c.annual, 0)
  const deductionsAnnual = deductions.reduce((s, c) => s + c.annual, 0)
  const employerAnnual = employerContribs.reduce((s, c) => s + c.annual, 0)
  const netPayAnnual = grossAnnual - deductionsAnnual
  const totalCtc = grossAnnual + employerAnnual

  // Build email body preview (simple — full details are in the PDF)
  const previewHtml = substituteOfferVariables(form.templateHtml, {
    candidate_name: candidateName,
    job_title: form.jobTitle,
    department: form.department,
    salary: formatSalary(totalCtc || form.totalSalary, form.currency),
    start_date: form.startDate ? new Date(form.startDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    expiry_date: form.expiryDate ? new Date(form.expiryDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    company_name: organization?.name || '',
    location: form.location,
  })

  // Validation per step
  function canProceed(): boolean {
    if (step === 0) {
      return !!(form.jobTitle && form.startDate && form.expiryDate)
    }
    if (step === 1) {
      return form.totalSalary > 0
    }
    if (step === 2) {
      return form.templateHtml.length >= 10
    }
    return true
  }

  async function handleSubmit() {
    if (!applicationId) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          salary: totalCtc || form.totalSalary,
          salary_currency: form.currency,
          start_date: form.startDate,
          expiry_date: form.expiryDate,
          template_html: form.templateHtml,
          salary_components: form.salaryComponents,
          bonus_components: form.bonusComponents.filter((b) => b.name && b.amount > 0),
          reporting_manager: form.reportingManager || undefined,
          employment_type: form.employmentType,
          location: form.location || undefined,
          remuneration_type: form.remunerationType,
          pf_applicable: form.pfApplicable,
          work_type: form.workType,
          business_unit: form.businessUnit || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create offer')
        setSubmitting(false)
        return
      }

      const offerId = data.data?.id
      if (!offerId) {
        router.push('/offers')
        return
      }

      // Auto-send via Gmail if connected
      if (gmailConnected) {
        const sendRes = await fetch(`/api/offers/${offerId}/send`, { method: 'POST' })
        if (!sendRes.ok) {
          router.push(`/offers/${offerId}`)
          return
        }
      }

      router.push(`/offers/${offerId}`)
    } catch {
      setError('Failed to create offer')
    } finally {
      setSubmitting(false)
    }
  }

  // Build PDF preview payload
  function buildPdfPayload() {
    const empLabel = EMPLOYMENT_TYPE_OPTIONS.find((e) => e.value === form.employmentType)?.label || form.employmentType
    const workLabel = WORK_TYPE_OPTIONS.find((w) => w.value === form.workType)?.label || form.workType
    return {
      companyName: organization?.name || '',
      candidateName,
      candidateEmail: candidate?.email || '',
      jobTitle: form.jobTitle,
      department: form.department,
      businessUnit: form.businessUnit || undefined,
      employmentType: empLabel,
      workType: workLabel,
      location: form.location || undefined,
      reportingManager: form.reportingManager || undefined,
      salary: formatSalary(totalCtc || form.totalSalary, form.currency),
      salaryCurrency: form.currency,
      startDate: form.startDate ? new Date(form.startDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'TBD',
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'TBD',
      createdDate: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      salaryComponents: form.salaryComponents,
      bonusComponents: form.bonusComponents.filter((b) => b.name && b.amount > 0),
      pfApplicable: form.pfApplicable,
    }
  }

  async function loadPdfPreview() {
    setPdfLoading(true)
    setError(null)
    // Revoke old blob URL
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl(null)
    }
    try {
      const res = await fetch('/api/offers/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPdfPayload()),
      })
      if (!res.ok) {
        setError('Failed to generate PDF preview')
        setPdfLoading(false)
        return
      }
      const blob = await res.blob()
      setPdfPreviewUrl(window.URL.createObjectURL(blob))
    } catch {
      setError('Failed to generate PDF preview')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadPdf() {
    setError(null)
    try {
      const res = await fetch('/api/offers/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPdfPayload()),
      })
      if (!res.ok) {
        setError('Failed to generate PDF')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `offer-${candidate?.last_name?.toLowerCase() || 'letter'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download PDF')
    }
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!application) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{error || 'Application not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    )
  }

  const sourceLabel = CANDIDATE_SOURCES.find((s) => s.value === candidate?.source)?.label ?? candidate?.source

  return (
    <div className="max-w-6xl space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900">Create Offer</h1>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0 flex-1">
          {STEP_LABELS.map((label, idx) => (
            <div key={idx} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    idx < step
                      ? 'bg-green-500 text-white'
                      : idx === step
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    idx === step ? 'text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div className={`flex-1 h-px mx-3 ${idx < step ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 ml-6 shrink-0">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Continue
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Step content */}
        <div className="lg:col-span-3 space-y-6">
          {/* ====== STEP 1: Job Details ====== */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Read-only candidate info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">Candidate Email</Label>
                    <Input value={candidate?.email || ''} readOnly className="bg-gray-50" />
                  </div>
                  <div>
                    <Label className="text-gray-500">Phone</Label>
                    <Input value={candidate?.phone || ''} readOnly className="bg-gray-50" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Job Title <span className="text-red-500">*</span></Label>
                    <Input
                      value={form.jobTitle}
                      onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                      placeholder="e.g. Senior Software Engineer"
                    />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Input
                      value={form.department}
                      onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                      placeholder="e.g. Engineering"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Business Unit</Label>
                    <Input
                      value={form.businessUnit}
                      onChange={(e) => setForm((p) => ({ ...p, businessUnit: e.target.value }))}
                      placeholder="e.g. Product & Technology"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={form.location}
                      onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                      placeholder="e.g. Bangalore, India"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Employment Type</Label>
                    <Select
                      value={form.employmentType}
                      onValueChange={(v) => setForm((p) => ({ ...p, employmentType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Work Type</Label>
                    <Select
                      value={form.workType}
                      onValueChange={(v) => setForm((p) => ({ ...p, workType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Reporting Manager</Label>
                  <Input
                    value={form.reportingManager}
                    onChange={(e) => setForm((p) => ({ ...p, reportingManager: e.target.value }))}
                    placeholder="e.g. John Smith"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Joining Date <span className="text-red-500">*</span></Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Offer Valid Until <span className="text-red-500">*</span></Label>
                    <Input
                      type="date"
                      value={form.expiryDate}
                      onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ====== STEP 2: Compensation ====== */}
          {step === 1 && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Compensation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Currency</Label>
                      <Select
                        value={form.currency}
                        onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Remuneration Type</Label>
                      <Select
                        value={form.remunerationType}
                        onValueChange={(v) => setForm((p) => ({ ...p, remunerationType: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REMUNERATION_TYPES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Total CTC (Annual) <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.totalSalary || ''}
                        onChange={(e) => handleTotalSalaryChange(Number(e.target.value) || 0)}
                        placeholder="e.g. 1300000"
                      />
                    </div>
                  </div>

                  {/* PF Toggle */}
                  <div className="flex items-center justify-between border rounded-lg p-4 bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">Provident Fund (PF) Applicable</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Employee PF: 12% of Basic (deducted) &bull; Employer PF: 12% of Basic (added to CTC)
                      </p>
                    </div>
                    <Switch
                      checked={form.pfApplicable}
                      onCheckedChange={handlePfToggle}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Salary Structure — matches Keka-style layout */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Salary Structure</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => addSalaryComponent('earnings')}>
                      + Add Component
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {form.salaryComponents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Enter a total CTC above to auto-generate the salary structure
                    </p>
                  ) : (
                    <div className="space-y-0">
                      {/* ---- MAIN TABLE: Earnings + SUB TOTAL + Employer + TOTAL ---- */}
                      <div className="border rounded-lg overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_140px_140px_36px] bg-gray-100 border-b">
                          <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</span>
                          <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Monthly</span>
                          <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Annually</span>
                          <span />
                        </div>

                        {/* Earning rows */}
                        {form.salaryComponents
                          .map((comp, i) => ({ ...comp, idx: i }))
                          .filter((c) => c.section === 'earnings')
                          .map((comp) => (
                            <div key={comp.idx} className="grid grid-cols-[1fr_140px_140px_36px] border-b hover:bg-gray-50">
                              <div className="px-3 py-2">
                                <Input
                                  value={comp.name}
                                  onChange={(e) => handleComponentChange(comp.idx, 'name', e.target.value)}
                                  className="h-8 text-sm border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                  placeholder="Component name"
                                />
                              </div>
                              <div className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={comp.monthly || ''}
                                  onChange={(e) => handleComponentChange(comp.idx, 'monthly', e.target.value)}
                                  className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                />
                              </div>
                              <div className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={comp.annual || ''}
                                  onChange={(e) => handleComponentChange(comp.idx, 'annual', e.target.value)}
                                  className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                />
                              </div>
                              <div className="px-1 py-2 flex items-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"
                                  onClick={() => removeSalaryComponent(comp.idx)}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </Button>
                              </div>
                            </div>
                          ))}

                        {/* SUB TOTAL (Gross) */}
                        <div className="grid grid-cols-[1fr_140px_140px_36px] bg-gray-100 border-b font-bold text-sm">
                          <span className="px-3 py-2.5">SUB TOTAL</span>
                          <span className="px-3 py-2.5 text-right">{form.currency} {Math.round(grossAnnual / 12).toLocaleString('en-IN')}</span>
                          <span className="px-3 py-2.5 text-right">{form.currency} {grossAnnual.toLocaleString('en-IN')}</span>
                          <span />
                        </div>

                        {/* Employer contributions (Gratuity, Employer PF) */}
                        {employerContribs.length > 0 && form.salaryComponents
                          .map((comp, i) => ({ ...comp, idx: i }))
                          .filter((c) => c.section === 'employer')
                          .map((comp) => (
                            <div key={comp.idx} className="grid grid-cols-[1fr_140px_140px_36px] border-b hover:bg-gray-50">
                              <div className="px-3 py-2">
                                <Input
                                  value={comp.name}
                                  onChange={(e) => handleComponentChange(comp.idx, 'name', e.target.value)}
                                  className="h-8 text-sm border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                />
                              </div>
                              <div className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={comp.monthly || ''}
                                  onChange={(e) => handleComponentChange(comp.idx, 'monthly', e.target.value)}
                                  className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                />
                              </div>
                              <div className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={comp.annual || ''}
                                  onChange={(e) => handleComponentChange(comp.idx, 'annual', e.target.value)}
                                  className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                />
                              </div>
                              <div className="px-1 py-2 flex items-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"
                                  onClick={() => removeSalaryComponent(comp.idx)}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </Button>
                              </div>
                            </div>
                          ))}

                        {/* TOTAL (CTC) */}
                        <div className="grid grid-cols-[1fr_140px_140px_36px] bg-gray-800 text-white font-bold text-sm">
                          <span className="px-3 py-2.5">TOTAL</span>
                          <span className="px-3 py-2.5 text-right">{form.currency} {Math.round(totalCtc / 12).toLocaleString('en-IN')}</span>
                          <span className="px-3 py-2.5 text-right">{form.currency} {totalCtc.toLocaleString('en-IN')}</span>
                          <span />
                        </div>
                      </div>

                      {/* ---- DEDUCTIONS TABLE ---- */}
                      {deductions.length > 0 && (
                        <div className="border rounded-lg overflow-hidden mt-6">
                          {/* Header */}
                          <div className="grid grid-cols-[1fr_140px_140px_36px] bg-gray-100 border-b">
                            <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</span>
                            <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Monthly</span>
                            <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Annually</span>
                            <span />
                          </div>

                          {form.salaryComponents
                            .map((comp, i) => ({ ...comp, idx: i }))
                            .filter((c) => c.section === 'deduction')
                            .map((comp) => (
                              <div key={comp.idx} className="grid grid-cols-[1fr_140px_140px_36px] border-b hover:bg-gray-50">
                                <div className="px-3 py-2">
                                  <Input
                                    value={comp.name}
                                    onChange={(e) => handleComponentChange(comp.idx, 'name', e.target.value)}
                                    className="h-8 text-sm border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                  />
                                </div>
                                <div className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={comp.monthly || ''}
                                    onChange={(e) => handleComponentChange(comp.idx, 'monthly', e.target.value)}
                                    className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                  />
                                </div>
                                <div className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={comp.annual || ''}
                                    onChange={(e) => handleComponentChange(comp.idx, 'annual', e.target.value)}
                                    className="h-8 text-sm text-right border-0 shadow-none p-0 bg-transparent focus-visible:ring-0"
                                  />
                                </div>
                                <div className="px-1 py-2 flex items-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"
                                    onClick={() => removeSalaryComponent(comp.idx)}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </Button>
                                </div>
                              </div>
                            ))}

                          {/* NET PAY */}
                          <div className="grid grid-cols-[1fr_140px_140px_36px] bg-green-50 font-bold text-sm text-green-800">
                            <span className="px-3 py-2.5">NET PAY</span>
                            <span className="px-3 py-2.5 text-right">{form.currency} {Math.round(netPayAnnual / 12).toLocaleString('en-IN')}</span>
                            <span className="px-3 py-2.5 text-right">{form.currency} {netPayAnnual.toLocaleString('en-IN')}</span>
                            <span />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bonus Components */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Bonus Components</CardTitle>
                    <Button variant="outline" size="sm" onClick={addBonusComponent}>
                      + Add Bonus
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {form.bonusComponents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No bonus components added
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_120px_120px_40px] gap-2 text-xs font-medium text-gray-500 px-1">
                        <span>Bonus Name</span>
                        <span className="text-right">Amount</span>
                        <span>Frequency</span>
                        <span />
                      </div>
                      {form.bonusComponents.map((bonus, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_120px_120px_40px] gap-2 items-center">
                          <Input
                            value={bonus.name}
                            onChange={(e) => handleBonusChange(idx, 'name', e.target.value)}
                            placeholder="e.g. Retention Bonus"
                            className="h-9 text-sm"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={bonus.amount || ''}
                            onChange={(e) => handleBonusChange(idx, 'amount', e.target.value)}
                            className="h-9 text-sm text-right"
                          />
                          <Select
                            value={bonus.frequency}
                            onValueChange={(v) => handleBonusChange(idx, 'frequency', v)}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="annual">Annual</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                              <SelectItem value="one_time">One-time</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 text-gray-400 hover:text-red-500"
                            onClick={() => removeBonusComponent(idx)}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ====== STEP 3: Email Body ====== */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Body</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">This is the email the candidate receives. Full offer details are in the attached PDF.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                    {showPreview ? 'Edit' : 'Preview'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template selector */}
                <div>
                  <Label>Select Template</Label>
                  <Select onValueChange={handleTemplateSelect} defaultValue="default">
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Email Template</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Editor / Preview */}
                {showPreview ? (
                  <div
                    className="prose prose-sm max-w-none border rounded-lg p-4 min-h-[200px]"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <Textarea
                    rows={14}
                    value={form.templateHtml}
                    onChange={(e) => setForm((p) => ({ ...p, templateHtml: e.target.value }))}
                    className="font-mono text-xs"
                  />
                )}

                {/* Variables Reference */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Available Variables:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '{{candidate_name}}', '{{job_title}}', '{{department}}',
                      '{{salary}}', '{{start_date}}', '{{expiry_date}}',
                      '{{company_name}}', '{{location}}',
                    ].map((v) => (
                      <code key={v} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-blue-600">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ====== STEP 4: Preview & Send ====== */}
          {step === 3 && (
            <>
              {/* PDF Preview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Offer Letter PDF Preview</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={loadPdfPreview} disabled={pdfLoading}>
                        {pdfLoading ? 'Generating...' : pdfPreviewUrl ? 'Refresh Preview' : 'Generate Preview'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!pdfPreviewUrl && !pdfLoading && (
                    <div className="border-2 border-dashed rounded-lg p-12 text-center text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm">Click &ldquo;Generate Preview&rdquo; to see the offer letter PDF</p>
                      <p className="text-xs mt-1">The PDF includes position details, salary structure, terms & conditions, and acceptance section</p>
                    </div>
                  )}
                  {pdfLoading && (
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                      <span className="ml-3 text-sm text-gray-500">Generating PDF...</span>
                    </div>
                  )}
                  {pdfPreviewUrl && !pdfLoading && (
                    <iframe
                      src={`${pdfPreviewUrl}#navpanes=0`}
                      className="w-full border rounded-lg"
                      style={{ height: '700px' }}
                      title="Offer Letter PDF Preview"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Email Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Email Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="prose prose-sm max-w-none border rounded-lg p-4 bg-gray-50 min-h-[100px]"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                  <p className="text-xs text-gray-400 mt-2">This email will be sent to the candidate with the PDF offer letter attached.</p>
                </CardContent>
              </Card>

              {/* Actions */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${gmailConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className="text-sm text-gray-600">
                          {gmailConnected
                            ? 'Gmail connected — offer will be emailed automatically'
                            : 'Gmail not connected — offer will be saved as draft'}
                        </span>
                      </div>
                    </div>
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting
                        ? 'Sending...'
                        : gmailConnected
                          ? 'Send Offer'
                          : 'Save as Draft'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Right Sidebar: Candidate Details */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">Candidate Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar & Name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {candidate?.first_name?.[0]}{candidate?.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{candidateName}</p>
                  <p className="text-xs text-gray-500 truncate">{candidate?.email}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">Applied Position</span>
                  <p className="font-medium">{job?.title || '-'}</p>
                </div>
                {candidate?.phone && (
                  <div>
                    <span className="text-gray-500 text-xs">Phone</span>
                    <p className="font-medium">{candidate.phone}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 text-xs">Source</span>
                  <p className="font-medium">{sourceLabel || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Applied Date</span>
                  <p className="font-medium">
                    {application.applied_at
                      ? new Date(application.applied_at).toLocaleDateString()
                      : '-'}
                  </p>
                </div>
                {candidate?.current_company && (
                  <div>
                    <span className="text-gray-500 text-xs">Current Company</span>
                    <p className="font-medium">{candidate.current_company}</p>
                  </div>
                )}
                {candidate?.current_title && (
                  <div>
                    <span className="text-gray-500 text-xs">Current Title</span>
                    <p className="font-medium">{candidate.current_title}</p>
                  </div>
                )}
                {candidate?.expected_salary != null && (
                  <div>
                    <span className="text-gray-500 text-xs">Expected Salary</span>
                    <p className="font-medium">{Number(candidate.expected_salary).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Quick link */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => window.open(`/candidates/${candidate?.id}`, '_blank')}
              >
                View Full Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
