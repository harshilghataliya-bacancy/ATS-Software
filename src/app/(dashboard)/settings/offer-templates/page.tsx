'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { OFFER_PDF_DEFAULTS, OFFER_TEMPLATE_VARIABLE_CATEGORIES } from '@/lib/constants'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { ArrowLeft, Copy, Palette, FileText, PenTool, ToggleLeft, Mail, Eye, Loader2, X, MoreHorizontal, Trash2, Pencil, Plus, Upload, FileUp, FileType } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

interface TemplateForm {
  name: string
  is_active: boolean
  // Source: 'manual' uses the form-based editor, 'word' stores an uploaded .docx as HTML
  template_source: 'manual' | 'word'
  docx_content_html: string
  docx_header_html: string
  docx_footer_html: string
  docx_page_background_url: string
  docx_page_margins: string
  // Basic
  company_name: string
  logo_url: string
  // Content
  greeting_text: string
  intro_text: string
  terms_and_conditions: string
  closing_text: string
  validity_text: string
  acceptance_text: string
  // Signature
  signatory_name: string
  signatory_title: string
  signatory_label: string
  candidate_sig_label: string
  footer_text: string
  // Toggles
  show_salary_breakdown: boolean
  show_bonus_section: boolean
  show_terms_section: boolean
  show_acceptance_section: boolean
  show_signature_block: boolean
  // Email
  email_subject: string
  email_body: string
  // Contact info for header/footer
  company_phone: string
  company_email: string
  company_website: string
  company_address: string
}

const emptyForm: TemplateForm = {
  name: '',
  is_active: false,
  template_source: 'manual',
  docx_content_html: '',
  docx_header_html: '',
  docx_footer_html: '',
  docx_page_background_url: '',
  docx_page_margins: '',
  company_name: '',
  logo_url: '',
  greeting_text: '',
  intro_text: '',
  terms_and_conditions: '',
  closing_text: '',
  validity_text: '',
  acceptance_text: '',
  signatory_name: '',
  signatory_title: '',
  signatory_label: OFFER_PDF_DEFAULTS.signatory_label,
  candidate_sig_label: OFFER_PDF_DEFAULTS.candidate_sig_label,
  footer_text: '',
  show_salary_breakdown: true,
  show_bonus_section: true,
  show_terms_section: true,
  show_acceptance_section: true,
  show_signature_block: true,
  email_subject: '',
  email_body: '',
  company_phone: '',
  company_email: '',
  company_website: '',
  company_address: '',
}

const defaultTemplateForm: TemplateForm = {
  name: 'Standard Offer Letter',
  is_active: true,
  template_source: 'manual',
  docx_content_html: '',
  docx_header_html: '',
  docx_footer_html: '',
  docx_page_background_url: '',
  docx_page_margins: '',
  company_name: 'HireFlow Technologies Pvt. Ltd.',
  logo_url: '',
  greeting_text: 'Dear {{candidate_name}},',
  intro_text: `We are pleased to inform you that you have been selected for the position of {{job_title}} in the {{department}} department at {{company_name}}. Based on your qualifications, experience, and performance during the interview process, we believe you will be a valuable addition to our team.

We are delighted to present you with the following terms and conditions of your employment. Please review them carefully before accepting this offer.`,
  terms_and_conditions: `Your employment will commence on {{start_date}}. Failure to join on the agreed date may result in withdrawal of this offer.
You will be on a probation period of six (6) months from the date of joining. During probation, either party may terminate employment with 15 days written notice.
After confirmation, the notice period for resignation or termination will be 30 days (or as per company policy applicable at that time).
Your appointment is subject to satisfactory completion of background verification, medical fitness, and submission of all required documents. Any discrepancy may lead to termination of employment.
You will be governed by the company's HR policies, code of conduct, and other applicable rules and regulations as amended from time to time.
You shall maintain strict confidentiality of all proprietary information, trade secrets, and business strategies of the company during and after your employment.
You shall not engage in any other employment, business, or consulting activity during the tenure of your employment without prior written consent.
Your compensation is confidential and should not be disclosed to any other employee or third party.
You agree to a non-compete clause for a period of 12 months post-employment within the same industry and geographic region.
The company reserves the right to transfer you to any department, location, or subsidiary based on business requirements.`,
  closing_text: 'We are excited about the possibility of you joining our team and contributing to our mission. We look forward to welcoming you aboard!',
  validity_text: 'This offer is valid until {{expiry_date}}. If we do not receive your signed acceptance by this date, this offer shall stand withdrawn automatically without any further communication.',
  acceptance_text: 'Please sign below and return a copy of this letter to indicate your acceptance of the above terms and conditions. By signing, you acknowledge that you have read, understood, and agree to abide by all the terms mentioned in this offer letter.',
  signatory_name: 'Priya Sharma',
  signatory_title: 'Head of Human Resources',
  signatory_label: 'Authorized Signatory',
  candidate_sig_label: 'Acceptance by Candidate',
  footer_text: 'This is a system-generated offer letter by {{company_name}}. Strictly Private & Confidential.',
  show_salary_breakdown: true,
  show_bonus_section: true,
  show_terms_section: true,
  show_acceptance_section: true,
  show_signature_block: true,
  company_phone: '',
  company_email: '',
  company_website: '',
  company_address: '',
  email_subject: 'Offer Letter - {{job_title}} at {{company_name}}',
  email_body: `<p>Dear {{candidate_name}},</p>

<p>Congratulations! We are thrilled to extend an offer for the position of <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong>.</p>

<p>Please find your detailed offer letter attached as a PDF document. The letter includes your compensation details, terms and conditions, and other important information about your role.</p>

<p><strong>Key Highlights:</strong></p>
<ul>
  <li>Position: {{job_title}}</li>
  <li>Department: {{department}}</li>
  <li>Start Date: {{start_date}}</li>
  <li>Annual CTC: {{salary}}</li>
</ul>

<p>Please review the offer carefully and use the buttons below to accept or decline. This offer is valid until <strong>{{expiry_date}}</strong>.</p>

<p>If you have any questions, feel free to reach out to us.</p>

<p>We look forward to having you on our team!</p>

<p>Warm regards,<br/>
{{signatory_name}}<br/>
{{signatory_title}}<br/>
{{company_name}}</p>`,
}

function formFromTemplate(t: AnyData): TemplateForm {
  return {
    name: t.name || '',
    is_active: t.is_active || false,
    template_source: (t.template_source as 'manual' | 'word') || 'manual',
    docx_content_html: t.docx_content_html || '',
    docx_header_html: t.docx_header_html || '',
    docx_footer_html: t.docx_footer_html || '',
    docx_page_background_url: t.docx_page_background_url || '',
    docx_page_margins: t.docx_page_margins ? JSON.stringify(t.docx_page_margins) : '',
    company_name: t.company_name || '',
    logo_url: t.logo_url || '',
    greeting_text: t.greeting_text || '',
    intro_text: t.intro_text || '',
    terms_and_conditions: t.terms_and_conditions || '',
    closing_text: t.closing_text || '',
    validity_text: t.validity_text || '',
    acceptance_text: t.acceptance_text || '',
    signatory_name: t.signatory_name || '',
    signatory_title: t.signatory_title || '',
    signatory_label: t.signatory_label || OFFER_PDF_DEFAULTS.signatory_label,
    candidate_sig_label: t.candidate_sig_label || OFFER_PDF_DEFAULTS.candidate_sig_label,
    footer_text: t.footer_text || '',
    show_salary_breakdown: t.show_salary_breakdown ?? true,
    show_bonus_section: t.show_bonus_section ?? true,
    show_terms_section: t.show_terms_section ?? true,
    show_acceptance_section: t.show_acceptance_section ?? true,
    show_signature_block: t.show_signature_block ?? true,
    email_subject: t.email_subject || '',
    email_body: t.email_body || '',
    company_phone: t.company_phone || '',
    company_email: t.company_email || '',
    company_website: t.company_website || '',
    company_address: t.company_address || '',
  }
}

function formToPayload(form: TemplateForm): AnyData {
  return {
    name: form.name.trim(),
    is_active: form.is_active,
    template_source: form.template_source,
    docx_content_html: form.template_source === 'word' ? (form.docx_content_html || null) : null,
    docx_header_html: form.template_source === 'word' ? (form.docx_header_html || null) : null,
    docx_footer_html: form.template_source === 'word' ? (form.docx_footer_html || null) : null,
    docx_page_background_url: form.template_source === 'word' ? (form.docx_page_background_url || null) : null,
    docx_page_margins: form.template_source === 'word' && form.docx_page_margins ? JSON.parse(form.docx_page_margins) : null,
    company_name: form.company_name.trim() || null,
    logo_url: form.logo_url.trim() || null,
    greeting_text: form.greeting_text.trim() || null,
    intro_text: form.intro_text.trim() || null,
    terms_and_conditions: form.terms_and_conditions.trim() || null,
    closing_text: form.closing_text.trim() || null,
    validity_text: form.validity_text.trim() || null,
    acceptance_text: form.acceptance_text.trim() || null,
    signatory_name: form.signatory_name.trim() || null,
    signatory_title: form.signatory_title.trim() || null,
    signatory_label: form.signatory_label.trim() || null,
    candidate_sig_label: form.candidate_sig_label.trim() || null,
    footer_text: form.footer_text.trim() || null,
    show_salary_breakdown: form.show_salary_breakdown,
    show_bonus_section: form.show_bonus_section,
    show_terms_section: form.show_terms_section,
    show_acceptance_section: form.show_acceptance_section,
    show_signature_block: form.show_signature_block,
    email_subject: form.email_subject.trim() || null,
    email_body: form.email_body.trim() || null,
    company_phone: form.company_phone.trim() || null,
    company_email: form.company_email.trim() || null,
    company_website: form.company_website.trim() || null,
    company_address: form.company_address.trim() || null,
  }
}

export default function OfferTemplatesPage() {
  const { organization, isLoading: userLoading } = useUser()
  const { isAdmin } = useRole()

  const [templates, setTemplates] = useState<AnyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Editor mode: null = list view, 'create' or template ID string = editor
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm>({ ...emptyForm })

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Copy feedback
  const [copiedVar, setCopiedVar] = useState<string | null>(null)

  // PDF Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Word template inline preview (HTML fallback) — auto-updates on content changes
  const [wordPreviewHtml, setWordPreviewHtml] = useState<string | null>(null)
  const [wordPreviewLoading, setWordPreviewLoading] = useState(false)
  // PDF preview path — when set, we show PDF in iframe instead of HTML
  const [pdfPreviewPath, setPdfPreviewPath] = useState<string | null>(null)
  const wordPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Placeholders sidebar toggle for Word editor
  const [showPlaceholders, setShowPlaceholders] = useState(false)

  // Create choice (manual vs upload) + Word upload dialog state
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch('/api/offer-templates')
      const json = await res.json()
      if (res.ok) {
        setTemplates(json.data || [])
      }
    } catch {
      // ignore
    }
    setLoading(false)
  }, [organization])

  useEffect(() => {
    if (organization) loadTemplates()
  }, [organization, loadTemplates])

  // Auto-update Word preview whenever content changes (debounced 600ms).
  // This replaces the old static "Live Preview" div with a proper paginated
  // iframe preview that uses the same engine as "Preview PDF".
  const fetchWordPreview = useCallback(async (f: TemplateForm) => {
    if (f.template_source !== 'word') return
    if (!f.docx_content_html && !f.docx_header_html && !f.docx_footer_html) {
      setWordPreviewHtml(null)
      return
    }
    setWordPreviewLoading(true)
    try {
      const res = await fetch('/api/offer-templates/preview-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name || 'Preview',
          docx_content_html: f.docx_content_html || '',
          docx_header_html: f.docx_header_html || null,
          docx_footer_html: f.docx_footer_html || null,
          docx_page_background_url: f.docx_page_background_url || null,
          docx_page_margins: f.docx_page_margins ? JSON.parse(f.docx_page_margins) : null,
          embedded: true,
        }),
      })
      if (res.ok) {
        const html = await res.text()
        setWordPreviewHtml(html)
      }
    } catch {
      // ignore — preview is non-critical
    } finally {
      setWordPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    if (form.template_source !== 'word' || !editingId) return
    if (wordPreviewTimerRef.current) clearTimeout(wordPreviewTimerRef.current)
    wordPreviewTimerRef.current = setTimeout(() => {
      fetchWordPreview(form)
    }, 600)
    return () => {
      if (wordPreviewTimerRef.current) clearTimeout(wordPreviewTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editingId,
    form.template_source,
    form.docx_content_html,
    form.docx_header_html,
    form.docx_footer_html,
    form.docx_page_background_url,
    form.name,
    fetchWordPreview,
  ])

  function openCreateChoice() {
    setCreateChoiceOpen(true)
  }

  function chooseManualCreate() {
    setCreateChoiceOpen(false)
    openCreate()
  }

  function chooseWordUpload() {
    setCreateChoiceOpen(false)
    setUploadFile(null)
    setUploadName('')
    setUploadError(null)
    setUploadOpen(true)
  }

  async function handleUploadWord() {
    if (!uploadFile) {
      setUploadError('Please choose a .docx file to upload')
      return
    }
    const name = uploadName.trim()
    if (!name) {
      setUploadError('Template name is required')
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('name', name)
      const res = await fetch('/api/offer-templates/upload-docx', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error || 'Failed to upload document')
        setUploading(false)
        return
      }
      // Close upload dialog and open the newly-created word template in the editor
      setUploadOpen(false)
      setUploading(false)
      await loadTemplates()
      if (json.data) {
        openEdit(json.data)
      }
    } catch {
      setUploadError('Failed to upload document')
      setUploading(false)
    }
  }

  function openCreate() {
    setEditingId('create')
    setForm({ ...emptyForm })
    setPdfPreviewPath(null)
    setError(null)
  }

  function openCreateDefault() {
    setEditingId('create')
    setForm({ ...defaultTemplateForm })
    setPdfPreviewPath(null)
    setError(null)
  }

  function openEdit(template: AnyData) {
    setEditingId(template.id)
    setForm(formFromTemplate(template))
    setPdfPreviewPath(template.docx_preview_pdf_path || null)
    setError(null)
  }

  function closeEditor() {
    setEditingId(null)
    setPdfPreviewPath(null)
    setError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  function updateForm<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Template name is required')
      return
    }
    setSaving(true)
    setError(null)

    const payload = formToPayload(form)

    try {
      const isCreate = editingId === 'create'
      const url = isCreate ? '/api/offer-templates' : `/api/offer-templates/${editingId}`
      const method = isCreate ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Failed to save template')
      } else {
        closeEditor()
        loadTemplates()
      }
    } catch {
      setError('Failed to save template')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/offer-templates/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      loadTemplates()
    } catch {
      // ignore
    }
    setDeleting(false)
  }

  function refreshWordPreview() {
    fetchWordPreview(form)
  }

  async function handlePreview() {
    setPreviewLoading(true)
    try {
      const payload = formToPayload(form)
      const res = await fetch('/api/offer-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Failed to generate preview')
        setPreviewLoading(false)
        return
      }
      const blob = await res.blob()
      // Revoke previous URL to avoid memory leaks
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch {
      setError('Failed to generate preview')
    }
    setPreviewLoading(false)
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  function copyVariable(key: string) {
    navigator.clipboard.writeText(key)
    setCopiedVar(key)
    setTimeout(() => setCopiedVar(null), 1500)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-1">Only administrators and recruiters can manage offer templates.</p>
      </div>
    )
  }

  // =========================================================================
  // Word Template Editor View (uploaded .docx parsed to HTML)
  // =========================================================================
  if (editingId && form.template_source === 'word') {
    // Auto-detect placeholders across header/body/footer so we can surface
    // the exact variable keys the user has in their original Word template.
    const detectedPlaceholders = Array.from(
      new Set(
        [form.docx_header_html, form.docx_content_html, form.docx_footer_html]
          .join('\n')
          .match(/\{\{\s*[\w.]+\s*\}\}/g) || []
      )
    ).sort()

    const hasPageBackground = Boolean(form.docx_page_background_url)

    return (
      <div className="space-y-4 max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={closeEditor}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {editingId === 'create' ? 'Create Word Template' : 'Edit Word Template'}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                  <FileUp className="w-3 h-3 mr-1" /> Word
                </span>
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">Edit the content imported from your .docx file</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-gray-50">
              <Label className="text-sm font-medium cursor-pointer" htmlFor="active-switch-word">Active</Label>
              <Switch
                id="active-switch-word"
                checked={form.is_active}
                onCheckedChange={(v) => updateForm('is_active', v)}
              />
            </div>
            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        {/* Two-column layout: Editor left, Preview right */}
        <div className="flex gap-5 min-w-0" style={{ minHeight: '85vh' }}>
          {/* Left: Editor panel */}
          <div className="w-[45%] shrink-0 min-w-0 space-y-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Template Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Template Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="e.g. Engineering Offer Letter"
                    className="h-9"
                  />
                </div>
              </CardContent>
            </Card>

            {hasPageBackground && (
              <Card className="border-blue-200 bg-blue-50/40">
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <FileType className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900">
                      <p className="font-semibold">Page background detected</p>
                      <p className="text-blue-800/80 mt-0.5">
                        Letterhead image will render behind content on every page.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  Header
                  <span className="text-[10px] font-normal text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    From .docx
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <RichTextEditor
                  value={form.docx_header_html}
                  onChange={(v) => updateForm('docx_header_html', v)}
                  placeholder="Header content (company name, logo, address...)"
                  rows={3}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">Body</CardTitle>
                <span className="text-[10px] text-gray-400">
                  Use <code className="bg-gray-100 px-1 rounded">{'{{variable}}'}</code> for placeholders
                </span>
              </CardHeader>
              <CardContent className="pb-4">
                <RichTextEditor
                  value={form.docx_content_html}
                  onChange={(v) => updateForm('docx_content_html', v)}
                  placeholder="Your offer letter content..."
                  rows={18}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  Footer
                  <span className="text-[10px] font-normal text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    From .docx
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <RichTextEditor
                  value={form.docx_footer_html}
                  onChange={(v) => updateForm('docx_footer_html', v)}
                  placeholder="Footer content (contact info, page number...)"
                  rows={2}
                />
              </CardContent>
            </Card>

            {/* Collapsible Placeholders section */}
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setShowPlaceholders(!showPlaceholders)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Placeholders
                    {detectedPlaceholders.length > 0 && (
                      <span className="text-[10px] font-normal bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {detectedPlaceholders.length} detected
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400 text-xs">{showPlaceholders ? '▲' : '▼'}</span>
                </CardTitle>
              </CardHeader>
              {showPlaceholders && (
                <CardContent className="space-y-4 pb-4">
                  {detectedPlaceholders.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-500">Detected in Template</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detectedPlaceholders.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => copyVariable(v)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-[10px] font-mono text-blue-700 transition-colors"
                            title="Click to copy"
                          >
                            {copiedVar === v ? 'Copied!' : v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {OFFER_TEMPLATE_VARIABLE_CATEGORIES.map((cat) => (
                    <div key={cat.category} className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{cat.category}</p>
                      <div className="flex flex-wrap gap-1">
                        {cat.variables.map((v) => (
                          <button
                            key={v.key}
                            type="button"
                            onClick={() => copyVariable(v.key)}
                            className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-[10px] font-mono text-gray-600 transition-colors"
                            title={v.label}
                          >
                            {copiedVar === v.key ? 'Copied!' : v.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </div>

          {/* Right: Always-visible live preview */}
          <div className="flex-1 min-w-0 flex flex-col sticky top-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-gray-900 text-sm">Live Preview</span>
                <span className="text-xs text-gray-400">Auto-updates with sample data</span>
                {wordPreviewLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                )}
              </div>
              <Button variant="outline" size="sm" onClick={refreshWordPreview} disabled={wordPreviewLoading}>
                Refresh
              </Button>
            </div>
            <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-gray-100">
              {pdfPreviewPath && editingId && editingId !== 'create' ? (
                <iframe
                  src={`/api/offer-templates/preview-pdf?templateId=${editingId}`}
                  className="w-full h-full"
                  style={{ minHeight: '85vh' }}
                  title="Word Template PDF Preview"
                />
              ) : wordPreviewHtml ? (
                <iframe
                  srcDoc={wordPreviewHtml}
                  className="w-full h-full"
                  style={{ minHeight: '85vh', backgroundColor: '#e5e7eb' }}
                  title="Word Template Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full min-h-[60vh] text-gray-400">
                  <div className="text-center space-y-2">
                    <FileText className="h-10 w-10 mx-auto text-gray-300" />
                    <p className="text-sm">Preview will appear here</p>
                    <p className="text-xs">Upload a Word document to see the PDF preview</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Placeholders are replaced with sample data. Use browser print (Ctrl+P) from the preview to save as PDF.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Editor View
  // =========================================================================
  if (editingId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={closeEditor}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {editingId === 'create' ? 'Create Template' : 'Edit Template'}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">Configure your offer letter PDF template</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-gray-50">
              <Label className="text-sm font-medium cursor-pointer" htmlFor="active-switch">Active</Label>
              <Switch
                id="active-switch"
                checked={form.is_active}
                onCheckedChange={(v) => updateForm('is_active', v)}
              />
            </div>
            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button variant="outline" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
              {previewLoading ? 'Generating...' : 'Preview PDF'}
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        <div className="flex gap-6">
          {/* Main editor area */}
          <div className={previewUrl ? 'w-[52%] shrink-0 min-w-0' : 'flex-1 min-w-0'}>
            <Tabs defaultValue="branding">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="branding" className="gap-1.5">
                  <Palette className="h-3.5 w-3.5" /> Branding
                </TabsTrigger>
                <TabsTrigger value="content" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Letter Content
                </TabsTrigger>
                <TabsTrigger value="signature" className="gap-1.5">
                  <PenTool className="h-3.5 w-3.5" /> Signature & Footer
                </TabsTrigger>
                <TabsTrigger value="sections" className="gap-1.5">
                  <ToggleLeft className="h-3.5 w-3.5" /> Sections
                </TabsTrigger>
                <TabsTrigger value="email" className="gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Branding */}
              <TabsContent value="branding" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Branding & Identity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Template Name <span className="text-red-500">*</span></Label>
                      <Input
                        value={form.name}
                        onChange={(e) => updateForm('name', e.target.value)}
                        placeholder="e.g. Default Offer Template"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Company Name (overrides org name in PDF)</Label>
                      <Input
                        value={form.company_name}
                        onChange={(e) => updateForm('company_name', e.target.value)}
                        placeholder="e.g. Acme Corp Pvt. Ltd."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Logo URL</Label>
                      <Input
                        value={form.logo_url}
                        onChange={(e) => updateForm('logo_url', e.target.value)}
                        placeholder="https://example.com/logo.png"
                      />
                      <p className="text-xs text-gray-500">Public URL to a company logo image (PNG, JPG, or SVG). SVG logos are auto-converted to PNG for PDF.</p>
                      {form.logo_url && (
                        <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.logo_url}
                            alt="Logo preview"
                            className="h-10 max-w-[160px] object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <span className="text-xs text-gray-500">Logo preview</span>
                        </div>
                      )}
                    </div>
                    {/* Contact info for header */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Company Phone</Label>
                        <Input
                          value={form.company_phone}
                          onChange={(e) => updateForm('company_phone', e.target.value)}
                          placeholder="+91 79 4000 0000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company Email</Label>
                        <Input
                          value={form.company_email}
                          onChange={(e) => updateForm('company_email', e.target.value)}
                          placeholder="hr@company.com"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Company Website</Label>
                        <Input
                          value={form.company_website}
                          onChange={(e) => updateForm('company_website', e.target.value)}
                          placeholder="www.company.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company Address (footer)</Label>
                        <Input
                          value={form.company_address}
                          onChange={(e) => updateForm('company_address', e.target.value)}
                          placeholder="123 Street, City, State - PIN"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Phone, email, and website appear in the PDF header. Address appears in the footer.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 2: Letter Content */}
              <TabsContent value="content" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Letter Content</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Greeting Text</Label>
                      <Input
                        value={form.greeting_text}
                        onChange={(e) => updateForm('greeting_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.greeting_text}
                      />
                      <p className="text-xs text-gray-500">Supports variables like {'{{candidate_name}}'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Introduction Text</Label>
                      <Textarea
                        rows={5}
                        value={form.intro_text}
                        onChange={(e) => updateForm('intro_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.intro_text}
                      />
                      <p className="text-xs text-gray-500">The opening paragraphs after the greeting. Each line break creates a new paragraph.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Terms & Conditions</Label>
                      <Textarea
                        rows={8}
                        value={form.terms_and_conditions}
                        onChange={(e) => updateForm('terms_and_conditions', e.target.value)}
                        placeholder="Enter custom terms and conditions (one per line)..."
                      />
                      <p className="text-xs text-gray-500">Each line becomes a bullet point. Leave blank for default T&C. Supports variables.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Offer Validity Text</Label>
                      <Textarea
                        rows={2}
                        value={form.validity_text}
                        onChange={(e) => updateForm('validity_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.validity_text}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Acceptance Text</Label>
                      <Textarea
                        rows={2}
                        value={form.acceptance_text}
                        onChange={(e) => updateForm('acceptance_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.acceptance_text}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Closing Text</Label>
                      <Textarea
                        rows={2}
                        value={form.closing_text}
                        onChange={(e) => updateForm('closing_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.closing_text}
                      />
                      <p className="text-xs text-gray-500">Shown after the acceptance section, before signatures.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 3: Signature & Footer */}
              <TabsContent value="signature" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Signature & Footer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Signatory Name</Label>
                        <Input
                          value={form.signatory_name}
                          onChange={(e) => updateForm('signatory_name', e.target.value)}
                          placeholder="e.g. John Smith"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Signatory Title</Label>
                        <Input
                          value={form.signatory_title}
                          onChange={(e) => updateForm('signatory_title', e.target.value)}
                          placeholder="e.g. Head of HR"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Signatory Label</Label>
                        <Input
                          value={form.signatory_label}
                          onChange={(e) => updateForm('signatory_label', e.target.value)}
                          placeholder="Authorized Signatory"
                        />
                        <p className="text-xs text-gray-500">Text under the company signature line</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Candidate Signature Label</Label>
                        <Input
                          value={form.candidate_sig_label}
                          onChange={(e) => updateForm('candidate_sig_label', e.target.value)}
                          placeholder="Acceptance by Candidate"
                        />
                        <p className="text-xs text-gray-500">Text above the candidate signature line</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Footer Text</Label>
                      <Textarea
                        rows={2}
                        value={form.footer_text}
                        onChange={(e) => updateForm('footer_text', e.target.value)}
                        placeholder={OFFER_PDF_DEFAULTS.footer_text}
                      />
                      <p className="text-xs text-gray-500">Appears at the bottom of every page. Supports variables.</p>
                    </div>

                    {/* Signature preview */}
                    <div className="border rounded-lg p-4 bg-gray-50 mt-4">
                      <p className="text-xs text-gray-500 mb-3">Preview</p>
                      <div className="flex justify-between">
                        <div className="w-[45%]">
                          <p className="text-xs text-gray-400 mb-1">For {form.company_name || 'Company'}</p>
                          <div className="border-b border-gray-400 mb-1 mt-6" />
                          <p className="text-xs text-gray-500">{form.signatory_label || 'Authorized Signatory'}</p>
                          {form.signatory_name && <p className="text-xs font-bold">{form.signatory_name}</p>}
                          {form.signatory_title && <p className="text-xs text-gray-500">{form.signatory_title}</p>}
                        </div>
                        <div className="w-[45%]">
                          <p className="text-xs text-gray-400 mb-1">{form.candidate_sig_label || 'Acceptance by Candidate'}</p>
                          <div className="border-b border-gray-400 mb-1 mt-6" />
                          <p className="text-xs font-bold">Candidate Name</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 4: Sections */}
              <TabsContent value="sections" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Section Visibility</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm text-gray-500 mb-4">Toggle which sections appear in the offer letter PDF.</p>
                    {([
                      { key: 'show_salary_breakdown' as const, label: 'Salary Breakdown', desc: 'Detailed salary structure table (earnings, deductions, employer contributions)' },
                      { key: 'show_bonus_section' as const, label: 'Bonus Section', desc: 'Bonus components listed below salary structure' },
                      { key: 'show_terms_section' as const, label: 'Terms & Conditions', desc: 'Terms and conditions bullet points' },
                      { key: 'show_acceptance_section' as const, label: 'Acceptance Section', desc: 'Acceptance text asking candidate to sign and return' },
                      { key: 'show_signature_block' as const, label: 'Signature Block', desc: 'Signatory and candidate signature lines' },
                    ]).map((item) => (
                      <div key={item.key} className="flex items-center justify-between py-3 border-b last:border-b-0">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                        </div>
                        <Switch
                          checked={form[item.key]}
                          onCheckedChange={(v) => updateForm(item.key, v)}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 5: Email */}
              <TabsContent value="email" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Email Customization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Customize the email sent when an offer is dispatched. The full offer details are always attached as a PDF.
                      Leave blank to use defaults.
                    </p>
                    <div className="space-y-2">
                      <Label>Email Subject</Label>
                      <Input
                        value={form.email_subject}
                        onChange={(e) => updateForm('email_subject', e.target.value)}
                        placeholder="e.g. Offer Letter - {{job_title}} at {{company_name}}"
                      />
                      <p className="text-xs text-gray-500">Supports variables. Default: &quot;Offer Letter - [Job Title] at [Company]&quot;</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Email Body (HTML)</Label>
                      <Textarea
                        rows={12}
                        value={form.email_body}
                        onChange={(e) => updateForm('email_body', e.target.value)}
                        placeholder="<p>Dear {{candidate_name}},</p>&#10;&#10;<p>We are delighted to extend an offer...</p>"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-gray-500">HTML email body. Supports variables. Accept/Decline buttons are appended automatically.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Variable sidebar — hidden when preview is open */}
          {!previewUrl && (
            <div className="w-64 shrink-0">
              <Card className="sticky top-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Template Variables</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-gray-500">Click to copy. Paste into any text field.</p>
                  {OFFER_TEMPLATE_VARIABLE_CATEGORIES.map((cat) => (
                    <div key={cat.category}>
                      <p className="text-xs font-semibold text-gray-700 mb-1">{cat.category}</p>
                      <div className="space-y-0.5">
                        {cat.variables.map((v) => (
                          <button
                            key={v.key}
                            onClick={() => copyVariable(v.key)}
                            className="flex items-center justify-between w-full text-left px-2 py-1 rounded text-xs hover:bg-gray-100 transition-colors group"
                          >
                            <span className="font-mono text-blue-600">{v.key}</span>
                            <Copy className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {copiedVar === v.key && (
                              <span className="text-green-600 text-[10px]">Copied!</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Inline PDF Preview Panel */}
          {previewUrl && (
            <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: '85vh' }}>
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold text-gray-900 text-sm">PDF Preview</span>
                  <span className="text-xs text-gray-400">Sample: Rahul Mehta · INR 18,00,000 CTC</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewLoading}>
                    {previewLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                    Refresh
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closePreview}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <iframe
                  src={`${previewUrl}#navpanes=0`}
                  className="w-full h-full"
                  style={{ minHeight: '85vh' }}
                  title="Offer Letter PDF Preview"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // =========================================================================
  // List View
  // =========================================================================

  const sectionItems = [
    { key: 'show_salary_breakdown', label: 'Salary' },
    { key: 'show_bonus_section', label: 'Bonus' },
    { key: 'show_terms_section', label: 'T&C' },
    { key: 'show_acceptance_section', label: 'Acceptance' },
    { key: 'show_signature_block', label: 'Signatures' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Manage your offer letter PDF templates and email content
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openCreateDefault} className="gap-1.5">
            <Copy className="w-4 h-4" /> Use Default
          </Button>
          <Button size="sm" onClick={openCreateChoice} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium mb-1">No offer templates yet</p>
          <p className="text-sm text-gray-400 mb-4">Create a template to customize your offer letter PDFs, or start with our pre-filled default.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={openCreateChoice} className="gap-1.5">
              <Plus className="w-4 h-4" /> New Template
            </Button>
            <Button size="sm" onClick={openCreateDefault} className="gap-1.5">
              <Copy className="w-4 h-4" /> Use Default Template
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          {templates.map((t) => {
            const enabledSections = sectionItems.filter((s) => t[s.key] !== false)
            const disabledSections = sectionItems.filter((s) => t[s.key] === false)

            return (
              <div
                key={t.id}
                className="group rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all duration-200 cursor-pointer"
                onClick={() => openEdit(t)}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[15px] font-semibold text-gray-900">{t.name}</h3>
                    {t.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-400 border border-gray-100">
                        Inactive
                      </span>
                    )}
                    {t.template_source === 'word' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                        <FileUp className="w-3 h-3" /> Word
                      </span>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(t) }} className="gap-2 text-sm">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setDeleteId(t.id) }}
                        className="gap-2 text-sm text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Info rows */}
                <div className="px-6 pb-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-gray-500">
                    {t.company_name && (
                      <span>Company: <span className="text-gray-700 font-medium">{t.company_name}</span></span>
                    )}
                    {t.signatory_name && (
                      <span>Signatory: <span className="text-gray-700 font-medium">{t.signatory_name}</span></span>
                    )}
                  </div>

                  {/* Enabled sections as dots */}
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sections</span>
                    <div className="flex items-center gap-2">
                      {enabledSections.map((s) => (
                        <span
                          key={s.key}
                          className="inline-flex items-center gap-1.5 text-[12px] text-gray-600"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {s.label}
                        </span>
                      ))}
                      {disabledSections.map((s) => (
                        <span
                          key={s.key}
                          className="inline-flex items-center gap-1.5 text-[12px] text-gray-400"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Stats */}
                <div className="border-t border-gray-100 px-6 py-3 flex items-center gap-6 text-[12px] text-gray-400">
                  <span className="tabular-nums">{enabledSections.length} of {sectionItems.length} sections enabled</span>
                  <span className="w-px h-3 bg-gray-200" />
                  <span>{t.email_subject ? 'Custom email' : 'Default email'}</span>
                  {t.logo_url && (
                    <>
                      <span className="w-px h-3 bg-gray-200" />
                      <span>Custom logo</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Choice Dialog: Upload Word vs Create Manually */}
      <Dialog open={createChoiceOpen} onOpenChange={setCreateChoiceOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>Choose how you&apos;d like to build your offer letter template.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <button
              type="button"
              onClick={chooseWordUpload}
              className="group text-left rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all p-5"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                <FileUp className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-[15px] font-semibold text-gray-900 mb-1">Upload Word Template</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Upload an existing <span className="font-medium">.docx</span> file. We&apos;ll parse it into an editable rich-text template with placeholder support.
              </p>
            </button>
            <button
              type="button"
              onClick={chooseManualCreate}
              className="group text-left rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition-all p-5"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3 group-hover:bg-emerald-100 transition-colors">
                <FileType className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-[15px] font-semibold text-gray-900 mb-1">Create Manually</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Build using our structured form with branding, content sections, signatures, and toggles. Best for standard PDF layouts.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Word Document Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(v) => { if (!uploading) setUploadOpen(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Word Template</DialogTitle>
            <DialogDescription>
              Upload a .docx file. We&apos;ll parse its contents into an editable rich-text template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name <span className="text-red-500">*</span></Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Engineering Offer Letter"
                disabled={uploading}
              />
            </div>
            <div className="space-y-2">
              <Label>Word Document (.docx) <span className="text-red-500">*</span></Label>
              <label
                htmlFor="docx-file-input"
                className="flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer py-6 px-4"
              >
                <Upload className="w-6 h-6 text-gray-400 mb-2" />
                {uploadFile ? (
                  <>
                    <span className="text-sm font-medium text-gray-900">{uploadFile.name}</span>
                    <span className="text-xs text-gray-500 mt-0.5">{(uploadFile.size / 1024).toFixed(1)} KB — click to change</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-700">Click to select a .docx file</span>
                    <span className="text-xs text-gray-500 mt-0.5">Only Microsoft Word .docx files are supported</span>
                  </>
                )}
                <input
                  id="docx-file-input"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null
                    setUploadFile(f)
                    if (f && !uploadName.trim()) {
                      // Suggest a name from the file name (strip extension)
                      setUploadName(f.name.replace(/\.docx$/i, ''))
                    }
                  }}
                />
              </label>
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
              <strong>Tip:</strong> Use placeholders like <code className="bg-white/60 px-1 rounded">{'{{candidate_name}}'}</code>, <code className="bg-white/60 px-1 rounded">{'{{job_title}}'}</code>, <code className="bg-white/60 px-1 rounded">{'{{salary}}'}</code> in your Word file. You can edit them after upload.
            </div>
            {uploadError && (
              <div className="rounded-md bg-red-50 text-red-700 text-sm p-3">{uploadError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUploadWord} disabled={uploading || !uploadFile || !uploadName.trim()}>
              {uploading ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>) : (<><Upload className="h-4 w-4 mr-1" /> Upload & Parse</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
