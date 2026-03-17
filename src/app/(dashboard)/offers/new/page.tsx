'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getApplicationById } from '@/lib/services/applications'
import { getEmailTemplates } from '@/lib/services/email'
import { getOfferTemplates } from '@/lib/services/offer-templates'
import { buildSalaryComponentsFromStructure } from '@/lib/services/salary-structures'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import type { SalaryStructure, SalaryComponent } from '@/types/database'
import {
  DEFAULT_OFFER_TEMPLATE,
  EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS, REMUNERATION_TYPES, CURRENCIES, CANDIDATE_SOURCES,
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Check, X, FileText } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

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

// Rebuild salary components from the selected structure's component definitions
function rebuildSalary(ctc: number, structures: SalaryStructure[], structureId: string): SalaryComponent[] {
  const structure = structures.find(s => s.id === structureId)
  if (!structure) return []
  return buildSalaryComponentsFromStructure(ctc, structure.components)
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
  const [offerTemplates, setOfferTemplates] = useState<AnyData[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default')
  const [selectedOfferTemplate, setSelectedOfferTemplate] = useState<AnyData | null>(null)

  // Salary structures
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([])
  const [selectedStructureId, setSelectedStructureId] = useState<string>('')

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

    const [appResult, templatesResult, offerTplResult, structuresRes] = await Promise.all([
      getApplicationById(supabase, applicationId, organization.id),
      getEmailTemplates(supabase, organization.id, 'offer'),
      getOfferTemplates(supabase, organization.id),
      fetch('/api/salary-structures').then(r => r.json()),
    ])

    if (appResult.error || !appResult.data) {
      setError(appResult.error?.message || 'Application not found')
      setLoading(false)
      return
    }

    const app = appResult.data
    setApplication(app)
    setTemplates(templatesResult.data || [])
    setOfferTemplates(offerTplResult.data || [])

    // Set salary structures
    const structs: SalaryStructure[] = structuresRes.data || []
    setSalaryStructures(structs)
    const defaultStruct = structs.find(s => s.is_default) || structs[0]
    if (defaultStruct) {
      setSelectedStructureId(defaultStruct.id)
    }

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

  // Rebuild salary structure when CTC or structure changes
  function handleTotalSalaryChange(value: number) {
    const components = rebuildSalary(value, salaryStructures, selectedStructureId)
    setForm((prev) => ({ ...prev, totalSalary: value, salaryComponents: components }))
  }

  function handlePfToggle(checked: boolean) {
    setForm((prev) => ({ ...prev, pfApplicable: checked }))
  }

  function handleStructureChange(structureId: string) {
    setSelectedStructureId(structureId)
    const components = rebuildSalary(form.totalSalary, salaryStructures, structureId)
    setForm((prev) => ({ ...prev, salaryComponents: components }))
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
    setSelectedTemplateId(templateId)
    if (templateId === 'default') {
      setSelectedOfferTemplate(null)
      setForm((prev) => ({ ...prev, templateHtml: DEFAULT_OFFER_TEMPLATE }))
      return
    }
    // Check email templates first
    const emailTpl = templates.find((t) => t.id === templateId)
    if (emailTpl) {
      setSelectedOfferTemplate(null)
      setForm((prev) => ({ ...prev, templateHtml: emailTpl.body_html }))
      return
    }
    // Check offer templates (use email_body field + store full template for PDF)
    const offerTpl = offerTemplates.find((t) => t.id === templateId)
    if (offerTpl) {
      setSelectedOfferTemplate(offerTpl)
      setForm((prev) => ({ ...prev, templateHtml: offerTpl.email_body || DEFAULT_OFFER_TEMPLATE }))
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
  const totalCtc = form.totalSalary || (grossAnnual + employerAnnual)

  // Build email body preview (simple — full details are in the PDF)
  const previewHtml = substituteOfferVariables(form.templateHtml, {
    candidate_name: candidateName,
    job_title: form.jobTitle,
    department: form.department,
    salary: formatSalary(totalCtc, form.currency),
    start_date: form.startDate ? new Date(form.startDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    expiry_date: form.expiryDate ? new Date(form.expiryDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
    company_name: organization?.name || '',
    location: form.location,
    signatory_name: selectedOfferTemplate?.signatory_name || '',
    signatory_title: selectedOfferTemplate?.signatory_title || '',
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
          salary: totalCtc,
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
          offer_template_id: selectedOfferTemplate?.id ?? null,
          salary_structure_id: selectedStructureId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create offer')
        setSubmitting(false)
        return
      }

      const offerId = data.data?.id
      const redirectTo = applicationId
        ? `/applications/${applicationId}?tab=offer`
        : '/offers'

      if (!offerId) {
        router.push(redirectTo)
        return
      }

      // Auto-send via Gmail if connected
      if (gmailConnected) {
        const sendRes = await fetch(`/api/offers/${offerId}/send`, { method: 'POST' })
        if (!sendRes.ok) {
          router.push(redirectTo)
          return
        }
      }

      router.push(redirectTo)
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
    const tpl = selectedOfferTemplate
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
      salary: formatSalary(totalCtc, form.currency),
      salaryCurrency: form.currency,
      startDate: form.startDate ? new Date(form.startDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'TBD',
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : 'TBD',
      createdDate: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      salaryComponents: form.salaryComponents,
      bonusComponents: form.bonusComponents.filter((b) => b.name && b.amount > 0),
      pfApplicable: form.pfApplicable,
      // Pass selected offer template data directly so PDF API uses it
      ...(tpl ? {
        templateLogoUrl: tpl.logo_url || undefined,
        templateCompanyName: tpl.company_name || undefined,
        templateTerms: tpl.terms_and_conditions || undefined,
        primaryColor: tpl.primary_color || undefined,
        accentColor: tpl.accent_color || undefined,
        greetingText: tpl.greeting_text || undefined,
        introText: tpl.intro_text || undefined,
        closingText: tpl.closing_text || undefined,
        validityText: tpl.validity_text || undefined,
        acceptanceText: tpl.acceptance_text || undefined,
        signatoryName: tpl.signatory_name || undefined,
        signatoryTitle: tpl.signatory_title || undefined,
        signatoryLabel: tpl.signatory_label || undefined,
        candidateSigLabel: tpl.candidate_sig_label || undefined,
        showSalaryBreakdown: tpl.show_salary_breakdown ?? true,
        showBonusSection: tpl.show_bonus_section ?? true,
        showTermsSection: tpl.show_terms_section ?? true,
        showAcceptanceSection: tpl.show_acceptance_section ?? true,
        showSignatureBlock: tpl.show_signature_block ?? true,
        footerText: tpl.footer_text || undefined,
        usePassedTemplate: true,
      } : {}),
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
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4" />Back
      </Button>

      <h1 className="text-xl font-semibold text-gray-900">Create Offer</h1>

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
                    <Check className="w-4 h-4" />
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
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Offer Valid Until <span className="text-red-500">*</span></Label>
                    <Input
                      type="date"
                      value={form.expiryDate}
                      min={new Date().toISOString().split('T')[0]}
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
                  {/* Salary Structure Selector */}
                  {salaryStructures.length > 0 && (
                    <div>
                      <Label>Salary Structure</Label>
                      <Select value={selectedStructureId} onValueChange={handleStructureChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select salary structure" />
                        </SelectTrigger>
                        <SelectContent>
                          {salaryStructures.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}{s.is_default ? ' (Default)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {salaryStructures.find(s => s.id === selectedStructureId)?.description && (
                        <p className="text-xs text-gray-500 mt-1">
                          {salaryStructures.find(s => s.id === selectedStructureId)?.description}
                        </p>
                      )}
                    </div>
                  )}

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
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => addSalaryComponent('earnings')}>
                        + Add Earning
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addSalaryComponent('deduction')}>
                        + Add Deduction
                      </Button>
                    </div>
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
                                  <X className="w-3.5 h-3.5" />
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
                                  <X className="w-3.5 h-3.5" />
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
                                    <X className="w-3.5 h-3.5" />
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
                            <X className="w-4 h-4" />
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
                  <Select onValueChange={handleTemplateSelect} value={selectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-gray-400">Default</SelectLabel>
                        <SelectItem value="default">Default Email Template</SelectItem>
                      </SelectGroup>
                      {offerTemplates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-gray-400">Offer Templates</SelectLabel>
                          {offerTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {templates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-xs text-gray-400">Email Templates</SelectLabel>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
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
                      <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
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
