'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RichTextEditor, RichTextEditorHandle } from '@/components/ui/rich-text-editor'
import { OFFER_TEMPLATE_VARIABLE_CATEGORIES } from '@/lib/constants'
import {
  ArrowLeft, Plus, MoreHorizontal, Trash2, Pencil, Copy, FileSignature,
  Upload, X, Loader2, Image as ImageIcon, RefreshCw, Eye,
  PlusCircle,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Undo, Redo, AlignLeft, AlignCenter, AlignRight,
  Table as TableIcon, Heading1, Heading2, Minus as HrIcon,
  ZoomIn, ZoomOut,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>

// ─── Types ──────────────────────────────────────────────────────────────

interface Letterhead {
  id: string
  name: string
  file_type: string
  page1_storage_path: string | null
  page1_url: string | null
  continuation_storage_path: string | null
  continuation_url: string | null
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  created_at: string
}

interface OfferTemplate {
  id: string
  name: string
  description: string | null
  is_active: boolean
  letterhead_id: string | null
  body_html: string | null
  signatory_name: string | null
  signatory_title: string | null
  signatory_label: string | null
  candidate_sig_label: string | null
  footer_text: string | null
  show_salary_breakdown: boolean
  show_bonus_section: boolean
  show_signature_block: boolean
  show_terms_section: boolean
  show_acceptance_section: boolean
  email_subject: string | null
  email_body: string | null
  created_at: string
  updated_at: string
  // legacy fields (still in DB, just not primary)
  greeting_text: string | null
  intro_text: string | null
  terms_and_conditions: string | null
  closing_text: string | null
  validity_text: string | null
  acceptance_text: string | null
  company_name: string | null
  company_address: string | null
}

// ─── Form State ─────────────────────────────────────────────────────────

interface TemplateFormState {
  name: string
  description: string
  is_active: boolean
  letterhead_id: string
  body_html: string
  signatory_name: string
  signatory_title: string
  signatory_label: string
  candidate_sig_label: string
  footer_text: string
  show_salary_breakdown: boolean
  show_signature_block: boolean
  email_subject: string
  email_body: string
}

function makeDefaultBodyHtml(): string {
  // Page 1: Offer Letter header + main offer details
  const page1 = `<p></p>
<p></p>
<p style="text-align: center"><strong><u>Offer Letter</u></strong></p>
<p></p>
<p><strong>Date:</strong> {{start_date}}</p>
<p></p>
<p>Dear <strong>{{candidate_name}}</strong>,</p>
<p></p>
<p></p>
<p>Congratulations! We are pleased to confirm that you have been selected to work for <strong>{{company_name}}</strong>.</p>
<p></p>
<p>The position we are offering is that of <strong>{{job_title}}</strong> at a salary of Rs. <strong>{{salary}}</strong> CTC per annum. Your salary, incentives, allowances and/or any kind of payment will be subject to prevailing applicable laws and deductions there under if any. If in future as per the law of government, PF deduction will be compulsory then you will be entitled to PF contribution from the offered remuneration.</p>
<p></p>
<p>You will report to <strong>{{reporting_manager}}</strong> or any such other executives as the Company may designate from time to time.</p>
<p></p>
<p></p>
<p>As part of {{company_name}}&apos;s commitment to growth opportunities, your next salary adjustment is set for the July 2027 increment cycle, right after you successfully complete your six-month probationary period. We&apos;re excited to support your growth with us.</p>
<p></p>
<p></p>
<p>You are offered a {{work_type}} position, with the designated office location being {{location}}. This offer is strictly based on an in-office work model, and all responsibilities and duties will be carried out from the allocated office. We prioritize collaboration and team interaction, which is integral to our in-office work culture.</p>`

  // Page 2: Employment confirmation + reporting + closing + signature
  const page2 = `<p></p>
<p></p>
<p>We are pleased to confirm your employment with our organization. This role follows a five-day workweek with flexible timing. Given the global nature of our operations, you are expected to demonstrate a high degree of flexibility and adaptability, including the willingness to work in any shift as required by client needs. A minimum of 8.5 working hours per day is mandatory, regardless of the shift assigned. Detailed terms and conditions of your employment will be provided in the forthcoming Appointment Letter, serving as the guiding document for your tenure with us. We appreciate your understanding and cooperation in adhering to these requirements.</p>
<p></p>
<p>You are requested to report on or before <strong>{{start_date}}</strong>. In case you fail to report on this date unless otherwise agreed in writing the offer shall stand automatically withdrawn.</p>
<p></p>
<p>If on verification, at the time of appointment or at a later date it is found that you have furnished wrong information, in such cases your services to the company will be liable to terminate. Please report to HR personnel on your start date for documentation and orientation. Please sign the copy of this letter and return it to indicate your acceptance of this offer.</p>
<p></p>
<p>We are confident that you will be able to make a significant contribution to the success {{company_name}} and we look forward to working with you.</p>
<p></p>
<p></p>
<p></p>
<p><strong>For, {{company_name}}</strong></p>
<p></p>
<p><strong>{{signatory_name}}</strong></p>
<p></p>
<p>HR Team</p>`

  // Page 3: Acceptance Confirmation
  const page3 = `<p></p>
<p></p>
<p><strong><u>ACCEPTANCE CONFIRMATION</u></strong></p>
<p></p>
<p><strong>Date:</strong> {{start_date}}</p>
<p></p>
<p>To: {{company_name}}</p>
<p></p>
<p>I, <strong>{{candidate_name}}</strong> have read all the documents and understood all the Rules &amp; Regulations of the company and hereby accept this employment offer.</p>
<p></p>
<p><strong>Probation Period Offer:</strong></p>
<p></p>
<p>I accept that for the first 6 months I shall be employed on a probation Employment and my yearly salary will be <strong>{{salary}}</strong></p>
<p></p>
<p>Joining Date: <strong>{{start_date}}</strong></p>
<p></p>
<p></p>
<p>Name: <strong>{{candidate_name}}</strong></p>
<p></p>
<p></p>
<p>Signature - ............................................................</p>`

  // Page 4: Annexure I — Salary Structure
  const page4 = `<p></p>
<p></p>
<p><strong><u>ANNEXURE I</u></strong></p>
<p></p>
<p>{{salary_structure}}</p>`

  // Page 5: Annexure II — Terms & Conditions (Flexi Pay, Gratuity, Notes)
  const page5 = `<p></p>
<p></p>
<p><strong><u>ANNEXURE II</u></strong></p>
<p></p>
<p><strong>Flexi Pay:</strong></p>
<p></p>
<p>&quot;At {{company_name}}, the &apos;Flexi Pay&apos; component is structured to support the organization&apos;s financial stability. While it appears in the earnings section, it will be fully paid out as a regular monthly earning component. However, in the event of a financial crisis within the organization, this component may be temporarily withheld for a few months to help maintain sustainability. Once the situation normalizes, regular payments will resume. These adjustments are applied uniformly across the company to ensure fairness and consistency. This policy is designed to protect both the company&apos;s financial health and the long-term interests of its employees.&quot;</p>
<p></p>
<p>In line with our company&apos;s strategies and commitment to growth and safety, we do not anticipate any such scenarios arising in the future.</p>
<p></p>
<p><strong>Gratuity:</strong></p>
<p></p>
<p>When you reach the completion of five years from your date of joining {{company_name}}, you become eligible to receive a gratuity payment upon departure from {{company_name}}.</p>
<p></p>
<p></p>
<p><strong>Note:</strong></p>
<ol>
<li>Retention Bonus is Payable Yearly</li>
<li>TDS will be deducted as per the Income Tax Act 1961.</li>
<li>Professional Tax deducted will be as per the current job location.</li>
<li>As per payment of Gratuity Act, 1972 and as per company policy on gratuity, the maximum gratuity payable is Rs. 20 Lacs.</li>
</ol>`

  return [page1, page2, page3, page4, page5].join(PAGE_DELIMITER)
}

function makeEmptyForm(): TemplateFormState {
  return {
    name: 'Standard Offer Letter',
    description: '',
    is_active: false,
    letterhead_id: '',
    body_html: makeDefaultBodyHtml(),
    signatory_name: '',
    signatory_title: '',
    signatory_label: 'Authorized Signatory',
    candidate_sig_label: 'Acceptance by Candidate',
    footer_text: 'This is a system-generated offer letter. Strictly Private & Confidential.',
    show_salary_breakdown: true,
    show_signature_block: true,
    email_subject: 'Offer Letter - {{job_title}} at {{company_name}}',
    email_body: `<p>Dear {{candidate_name}},</p><p>Please find your offer letter attached.</p><p>Regards,<br/>{{company_name}} HR Team</p>`,
  }
}

function formFromTemplate(t: OfferTemplate): TemplateFormState {
  // If body_html is populated, use it. Otherwise migrate legacy fields.
  let bodyHtml = t.body_html || ''
  if (!bodyHtml && t.greeting_text) {
    // Migrate legacy section-based content into single body_html
    const parts: string[] = []
    if (t.greeting_text) parts.push(`<p>${t.greeting_text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`)
    if (t.intro_text) parts.push(`<p>${t.intro_text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p>')}</p>`)
    if (t.terms_and_conditions) parts.push(`<hr><h2>Terms &amp; Conditions</h2><p>${t.terms_and_conditions.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p>')}</p>`)
    if (t.closing_text) parts.push(`<p>${t.closing_text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`)
    if (t.validity_text) parts.push(`<p>${t.validity_text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`)
    if (t.acceptance_text) parts.push(`<hr><p>${t.acceptance_text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p>')}</p>`)
    bodyHtml = parts.join('\n')
  }
  return {
    name: t.name,
    description: t.description || '',
    is_active: t.is_active,
    letterhead_id: t.letterhead_id || '',
    body_html: bodyHtml || makeDefaultBodyHtml(),
    signatory_name: t.signatory_name || '',
    signatory_title: t.signatory_title || '',
    signatory_label: t.signatory_label || 'Authorized Signatory',
    candidate_sig_label: t.candidate_sig_label || 'Acceptance by Candidate',
    footer_text: t.footer_text || '',
    show_salary_breakdown: t.show_salary_breakdown,
    show_signature_block: t.show_signature_block,
    email_subject: t.email_subject || '',
    email_body: t.email_body || '',
  }
}

// ─── A4 Constants & Page Delimiter ──────────────────────────────────────

const A4_W = 595 // px at 72dpi
const A4_H = 842
const PAGE_DELIMITER = '<!--PAGE_BREAK-->'

function splitPages(html: string): string[] {
  if (!html) return ['']
  const pages = html.split(PAGE_DELIMITER)
  return pages.length > 0 ? pages : ['']
}

function joinPages(pages: string[]): string {
  return pages.join(PAGE_DELIMITER)
}

// Convert mm margins to px at A4 scale (210mm = 595px → 1mm = 2.833px)
function mmToPx(mm: number) { return Math.round(mm * A4_W / 210) }

// ─── Variable Substitution ──────────────────────────────────────────────

const SAMPLE_SALARY_TABLE = `<table style="width:100%;border-collapse:collapse;font-size:10px;border:1px solid #e5e7eb;border-radius:4px">
<thead><tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
<th style="text-align:left;padding:6px 10px;font-weight:600">Component</th>
<th style="text-align:right;padding:6px 10px;font-weight:600">Monthly (₹)</th>
<th style="text-align:right;padding:6px 10px;font-weight:600">Annual (₹)</th>
</tr></thead>
<tbody>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">Basic Salary</td><td style="text-align:right;padding:4px 10px">45,000</td><td style="text-align:right;padding:4px 10px">5,40,000</td></tr>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">HRA</td><td style="text-align:right;padding:4px 10px">18,000</td><td style="text-align:right;padding:4px 10px">2,16,000</td></tr>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">Special Allowance</td><td style="text-align:right;padding:4px 10px">40,000</td><td style="text-align:right;padding:4px 10px">4,80,000</td></tr>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">LTA</td><td style="text-align:right;padding:4px 10px">3,000</td><td style="text-align:right;padding:4px 10px">36,000</td></tr>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">PF (Employer)</td><td style="text-align:right;padding:4px 10px">1,800</td><td style="text-align:right;padding:4px 10px">21,600</td></tr>
<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 10px">Gratuity</td><td style="text-align:right;padding:4px 10px">2,165</td><td style="text-align:right;padding:4px 10px">25,974</td></tr>
<tr style="background:#f0fdf4;font-weight:600"><td style="padding:6px 10px">Total CTC</td><td style="text-align:right;padding:6px 10px">1,50,000</td><td style="text-align:right;padding:6px 10px">18,00,000</td></tr>
</tbody></table>`

const SAMPLE_DATA: Record<string, string> = {
  '{{candidate_name}}': 'John Doe',
  '{{candidate_email}}': 'john.doe@email.com',
  '{{job_title}}': 'Senior Software Engineer',
  '{{department}}': 'Engineering',
  '{{business_unit}}': 'Product',
  '{{location}}': 'Ahmedabad, Gujarat',
  '{{salary}}': '₹18,00,000',
  '{{salary_currency}}': 'INR',
  '{{remuneration_type}}': 'Annual',
  '{{start_date}}': '1 May 2026',
  '{{expiry_date}}': '25 April 2026',
  '{{employment_type}}': 'Full Time',
  '{{work_type}}': 'Hybrid',
  '{{reporting_manager}}': 'Rajesh Kumar',
  '{{company_name}}': 'Your Company Name',
  '{{signatory_name}}': '<span style="font-family:\'Dancing Script\',\'Brush Script MT\',\'Segoe Script\',cursive;font-size:18px;color:#1a1a1a">HR Manager</span>',
  '{{signatory_title}}': 'Head of HR',
  '{{salary_structure}}': SAMPLE_SALARY_TABLE,
}

function substituteVars(html: string, overrides?: Record<string, string>): string {
  const data = overrides ? { ...SAMPLE_DATA, ...overrides } : SAMPLE_DATA
  let result = html
  for (const [key, val] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), val)
  }
  return result
}

// ─── Letterhead Manager ─────────────────────────────────────────────────

function LetterheadManager({ letterheads, onRefresh, loading }: {
  letterheads: Letterhead[]; onRefresh: () => void; loading: boolean
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [name, setName] = useState('')
  const [page1File, setPage1File] = useState<File | null>(null)
  const [contFile, setContFile] = useState<File | null>(null)
  const [page1Preview, setPage1Preview] = useState<string | null>(null)
  const [contPreview, setContPreview] = useState<string | null>(null)
  const [margins, setMargins] = useState({ top: 35, bottom: 25, left: 20, right: 20 })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleFileSelect = (file: File, type: 'page1' | 'continuation') => {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) return
    const url = URL.createObjectURL(file)
    if (type === 'page1') { setPage1File(file); setPage1Preview(url) }
    else { setContFile(file); setContPreview(url) }
  }

  const handleUpload = async () => {
    if (!page1File || !name.trim()) return
    setUploading(true)
    const fd = new FormData()
    fd.append('name', name)
    fd.append('page1', page1File)
    if (contFile) fd.append('continuation', contFile)
    fd.append('margin_top', String(margins.top))
    fd.append('margin_bottom', String(margins.bottom))
    fd.append('margin_left', String(margins.left))
    fd.append('margin_right', String(margins.right))
    await fetch('/api/letterheads', { method: 'POST', body: fd })
    setUploading(false)
    setShowUpload(false)
    setName(''); setPage1File(null); setContFile(null); setPage1Preview(null); setContPreview(null)
    setMargins({ top: 35, bottom: 25, left: 20, right: 20 })
    onRefresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await fetch(`/api/letterheads/${deleteId}`, { method: 'DELETE' })
    setDeleting(false); setDeleteId(null); onRefresh()
  }

  const ImageDropZone = ({ label, file, preview, onSelect }: {
    label: string; file: File | null; preview: string | null; onSelect: (f: File) => void
  }) => {
    const inputRef = useRef<HTMLInputElement>(null)
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">{label}</Label>
        {preview ? (
          <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <img src={preview} alt={label} className="w-full h-auto max-h-[200px] object-contain" />
            <button onClick={() => onSelect(null as unknown as File)} className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow hover:bg-red-50">
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <p className="text-[10px] text-gray-400 px-2 py-1 truncate">{file?.name}</p>
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onSelect(f) }}
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition-colors"
          >
            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">Drop PNG/JPEG or click to browse</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Recommended: 2480 × 3508 px (A4 at 300 DPI)</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onSelect(f); e.target.value = '' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Letterhead
        </Button>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Letterhead</DialogTitle>
            <DialogDescription>Upload A4-size PNG/JPEG images for your letterhead background.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Letterhead Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Company Official Template" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ImageDropZone label="Page 1 (Required)" file={page1File} preview={page1Preview} onSelect={f => handleFileSelect(f, 'page1')} />
              <ImageDropZone label="Continuation Pages (Optional)" file={contFile} preview={contPreview} onSelect={f => handleFileSelect(f, 'continuation')} />
            </div>
            {/* Margins */}
            <div>
              <Label className="text-xs font-medium text-gray-600 mb-2 block">Content Margins (mm)</Label>
              <div className="grid grid-cols-4 gap-3">
                {(['top', 'bottom', 'left', 'right'] as const).map(side => (
                  <div key={side}>
                    <Label className="text-[10px] text-gray-400 capitalize">{side}</Label>
                    <Input type="number" min={0} max={80} value={margins[side]}
                      onChange={e => setMargins(m => ({ ...m, [side]: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-xs mt-0.5" />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Define the safe area where template content will be placed. The letterhead image shows behind everything.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpload} disabled={uploading || !page1File || !name.trim()}>
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Letterhead List */}
      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : letterheads.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No letterheads yet</p>
          <p className="text-xs text-gray-400 mt-1">Upload your company letterhead as a PNG/JPEG image</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {letterheads.map(lh => (
            <div key={lh.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white group hover:shadow-md transition-shadow">
              {/* Preview thumbnail */}
              <div className="h-40 bg-gray-50 relative overflow-hidden">
                {lh.page1_url ? (
                  <img src={lh.page1_url} alt={lh.name} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="w-10 h-10 text-gray-200" />
                  </div>
                )}
              </div>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{lh.name}</p>
                  <p className="text-[10px] text-gray-400">Margins: {lh.margin_top}/{lh.margin_bottom}/{lh.margin_left}/{lh.margin_right}mm</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem className="text-red-600 text-xs" onClick={() => setDeleteId(lh.id)}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Letterhead</DialogTitle><DialogDescription>This will permanently remove this letterhead.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Variables Panel ────────────────────────────────────────────────────

function VariablesPanel({ onInsert }: { onInsert?: (key: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(key)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-3">
      {OFFER_TEMPLATE_VARIABLE_CATEGORIES.map(cat => (
        <div key={cat.category}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{cat.category}</p>
          <div className="space-y-0.5">
            {cat.variables.map(v => (
              <div
                key={v.key}
                className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-md hover:bg-blue-50 group transition-colors"
              >
                <button
                  onClick={() => onInsert?.(v.key)}
                  className="flex-1 text-left"
                >
                  <span className="text-xs text-gray-700 group-hover:text-blue-700">{v.label}</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <code className="text-[10px] font-mono text-gray-400 group-hover:text-blue-500">{v.key}</code>
                  <button
                    onClick={(e) => handleCopy(v.key, e)}
                    title="Copy variable"
                    className="p-0.5 rounded hover:bg-blue-100 text-gray-300 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {copied === v.key ? (
                      <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── A4 Preview (single page with navigation) ──────────────────────────

function A4Preview({ form, letterhead }: { form: TemplateFormState; letterhead: Letterhead | null }) {
  const [page1Url, setPage1Url] = useState<string | null>(null)
  const [contUrl, setContUrl] = useState<string | null>(null)
  const [lhMargins, setLhMargins] = useState({ top: 35, bottom: 25, left: 20, right: 20 })
  const [refreshing, setRefreshing] = useState(false)

  const fetchLh = useCallback(() => {
    if (!letterhead?.id) { setPage1Url(null); setContUrl(null); return }
    setRefreshing(true)
    fetch(`/api/letterheads/${letterhead.id}/preview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPage1Url(data.page1_url || null)
          setContUrl(data.continuation_url || null)
          if (data.margins) setLhMargins(data.margins)
        }
      })
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }, [letterhead?.id])

  useEffect(() => { fetchLh() }, [fetchLh])

  const pages = splitPages(form.body_html)

  const marginPx = {
    top: mmToPx(lhMargins.top),
    bottom: mmToPx(lhMargins.bottom),
    left: mmToPx(lhMargins.left),
    right: mmToPx(lhMargins.right),
  }

  return (
    <div>
      {/* Refresh button */}
      <button
        onClick={fetchLh}
        disabled={refreshing}
        className="flex items-center gap-1.5 px-3 py-1.5 mb-4 rounded-md border border-gray-200 bg-white text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh Preview
      </button>

      {/* All pages stacked */}
      <div className="space-y-4">
        {pages.map((pageContent, pageIdx) => {
          const bgUrl = pageIdx === 0 ? page1Url : (contUrl || page1Url)
          const formOverrides: Record<string, string> = {}
          if (form.signatory_name) {
            formOverrides['{{signatory_name}}'] = `<span style="font-family:'Dancing Script','Brush Script MT','Segoe Script',cursive;font-size:18px;color:#1a1a1a">${form.signatory_name}</span>`
          }
          if (form.signatory_title) {
            formOverrides['{{signatory_title}}'] = form.signatory_title
          }
          const pageHtml = substituteVars(pageContent || '', formOverrides)

          return (
            <div key={pageIdx}>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Page {pageIdx + 1}</span>
              </div>
              <div
                className="shadow-lg border border-gray-200 rounded-sm relative overflow-hidden"
                style={{
                  width: `${A4_W}px`,
                  height: `${A4_H}px`,
                  background: bgUrl ? `url('${bgUrl}') top left / ${A4_W}px ${A4_H}px no-repeat` : 'white',
                }}
              >
                <div
                  className="absolute overflow-hidden"
                  style={{
                    top: `${marginPx.top}px`,
                    left: `${marginPx.left}px`,
                    right: `${marginPx.right}px`,
                    bottom: `${marginPx.bottom}px`,
                  }}
                >
                  <div
                    className="prose prose-sm max-w-none [&_p:empty]:min-h-[1.2em] [&_p:empty]:before:content-['\00a0'] [&_p_br]:block [&_p_br]:content-[''] [&_p_br]:mt-[0.6em]"
                    style={{ fontSize: '10px', lineHeight: '1.6', fontFamily: 'Georgia, serif' }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: pageHtml }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Standalone Toolbar (controls the active editor from outside A4 page) ──

function EditorToolbar({ editorRefs, activePageRef }: {
  editorRefs: React.RefObject<Map<number, RichTextEditorHandle>>
  activePageRef: React.RefObject<number>
}) {
  const [, forceUpdate] = useState(0)

  // Re-render toolbar periodically to reflect active state
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 300)
    return () => clearInterval(t)
  }, [])

  const editor = editorRefs.current?.get(activePageRef.current ?? 0)?.getEditor() ?? null
  if (!editor) return null

  const TBtn = ({ isActive, onClick, children, title }: {
    isActive?: boolean; onClick: () => void; children: React.ReactNode; title: string
  }) => (
    <button type="button" onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
      {children}
    </button>
  )
  const Sep = () => <div className="w-px h-4 bg-gray-200 mx-0.5" />

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      <TBtn title="Heading 1" isActive={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Heading 2" isActive={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </TBtn>
      <Sep />
      <TBtn title="Bold" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Italic" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Underline" isActive={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </TBtn>
      <Sep />
      <TBtn title="Align Left" isActive={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Align Center" isActive={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Align Right" isActive={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="h-3.5 w-3.5" />
      </TBtn>
      <Sep />
      <TBtn title="Bullet List" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Numbered List" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Horizontal Rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <HrIcon className="h-3.5 w-3.5" />
      </TBtn>
      <Sep />
      <TBtn title="Insert Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="h-3.5 w-3.5" />
      </TBtn>
      <Sep />
      <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="h-3.5 w-3.5" />
      </TBtn>
    </div>
  )
}

// ─── Page Editor (per-page individual editors with letterhead) ───────────

function PageEditor({ form, letterhead, editorRef, onChange, pageEditorRefs, activePageRef }: {
  form: TemplateFormState
  letterhead: Letterhead | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: any
  onChange: (val: string) => void
  pageEditorRefs: React.MutableRefObject<Map<number, RichTextEditorHandle>>
  activePageRef: React.MutableRefObject<number>
}) {
  const [page1Url, setPage1Url] = useState<string | null>(null)
  const [contUrl, setContUrl] = useState<string | null>(null)
  const [lhMargins, setLhMargins] = useState({ top: 35, bottom: 25, left: 20, right: 20 })
  const [pages, setPages] = useState<string[]>(() => splitPages(form.body_html))

  // Fetch letterhead image URLs
  const fetchLetterhead = useCallback(() => {
    if (!letterhead?.id) { setPage1Url(null); setContUrl(null); return }
    fetch(`/api/letterheads/${letterhead.id}/preview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPage1Url(data.page1_url || null)
          setContUrl(data.continuation_url || null)
          if (data.margins) setLhMargins(data.margins)
        }
      })
      .catch(() => {})
  }, [letterhead?.id])

  useEffect(() => { fetchLetterhead() }, [fetchLetterhead])

  // Sync pages when form.body_html changes externally (e.g. loading a template)
  useEffect(() => {
    const incoming = splitPages(form.body_html)
    if (joinPages(incoming) !== joinPages(pages)) {
      setPages(incoming)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.body_html])

  const marginPx = {
    top: mmToPx(lhMargins.top),
    bottom: mmToPx(lhMargins.bottom),
    left: mmToPx(lhMargins.left),
    right: mmToPx(lhMargins.right),
  }
  const contentAreaH = A4_H - marginPx.top - marginPx.bottom

  // Update a specific page's content
  const updatePage = useCallback((index: number, html: string) => {
    setPages(prev => {
      const next = [...prev]
      next[index] = html
      onChange(joinPages(next))
      return next
    })
  }, [onChange])

  // Add a new page
  const addPage = useCallback(() => {
    setPages(prev => {
      const next = [...prev, '<p></p>']
      onChange(joinPages(next))
      return next
    })
  }, [onChange])

  // Remove a page
  const removePage = useCallback((index: number) => {
    setPages(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== index)
      onChange(joinPages(next))
      return next
    })
  }, [onChange])

  // Route variable insertion to the active page's editor
  const handlePageFocus = useCallback((pageIdx: number) => {
    activePageRef.current = pageIdx
    const handle = pageEditorRefs.current.get(pageIdx)
    if (handle && editorRef) {
      editorRef.current = handle
    }
  }, [editorRef])

  // Set initial editorRef to page 0
  useEffect(() => {
    const handle = pageEditorRefs.current.get(0)
    if (handle && editorRef) {
      editorRef.current = handle
    }
  })

  const PAGE_GAP = 32

  return (
    <div style={{ width: `${A4_W}px` }}>
      {pages.map((pageHtml, pageIdx) => {
        const bgUrl = pageIdx === 0 ? page1Url : (contUrl || page1Url)
        const isFirst = pageIdx === 0
        return (
          <div key={pageIdx}>
            {/* Page label + controls */}
            <div className="flex items-center justify-between mb-2 px-1" style={{ marginTop: isFirst ? 0 : PAGE_GAP }}>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Page {pageIdx + 1}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-300">A4</span>
                {isFirst && (
                  <button onClick={fetchLetterhead} title="Refresh letterhead"
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-[10px] text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                )}
                {!isFirst && (
                  <button onClick={() => removePage(pageIdx)} title="Remove this page"
                    className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* A4 Page — matches preview exactly */}
            <div
              className="shadow-lg border border-gray-200 rounded-sm relative overflow-hidden"
              style={{
                width: `${A4_W}px`,
                height: `${A4_H}px`,
                background: bgUrl
                  ? `url('${bgUrl}') top left / ${A4_W}px ${A4_H}px no-repeat`
                  : 'white',
              }}
            >
              {/* Margin guides (when no letterhead) */}
              {!bgUrl && (
                <>
                  <div className="absolute left-0 right-0 border-t border-dashed border-blue-100" style={{ top: `${marginPx.top}px` }} />
                  <div className="absolute left-0 right-0 border-t border-dashed border-blue-100" style={{ bottom: `${marginPx.bottom}px` }} />
                </>
              )}

              {/* Content area — editable, styled to match preview */}
              <div
                className="absolute overflow-hidden"
                style={{
                  top: `${marginPx.top}px`,
                  left: `${marginPx.left}px`,
                  right: `${marginPx.right}px`,
                  bottom: `${marginPx.bottom}px`,
                }}
                onFocus={() => handlePageFocus(pageIdx)}
              >
                <RichTextEditor
                  ref={(handle: RichTextEditorHandle | null) => {
                    if (handle) pageEditorRefs.current.set(pageIdx, handle)
                    else pageEditorRefs.current.delete(pageIdx)
                  }}
                  value={pageHtml}
                  onChange={val => updatePage(pageIdx, val)}
                  showHeadings
                  showAlignment
                  showTableTools
                  placeholder={isFirst ? 'Start writing your offer letter...' : 'Continue writing...'}
                  rows={Math.max(8, Math.floor(contentAreaH / 24))}
                  className={[
                    'border-0 bg-transparent rounded-none',
                    // Hide the built-in toolbar — we use the external one
                    '[&>div:first-child]:hidden',
                    // Match preview text styling exactly: 10px, 1.6 line-height, Georgia serif
                    '[&_.ProseMirror]:text-[10px] [&_.ProseMirror]:leading-[1.6] [&_.ProseMirror]:font-[Georgia,serif]',
                    '[&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0 [&_.ProseMirror]:min-h-0',
                    // Match preview prose classes for empty paragraphs
                    '[&_.ProseMirror_p:empty]:min-h-[1.2em]',
                  ].join(' ')}
                />
              </div>
            </div>

            {/* Page break indicator */}
            {pageIdx < pages.length - 1 && (
              <div className="flex items-center gap-2 px-2 py-2" style={{ marginTop: 8 }}>
                <div className="flex-1 border-t border-dashed border-gray-300" />
                <span className="text-[9px] text-gray-400 font-medium shrink-0">Page break</span>
                <div className="flex-1 border-t border-dashed border-gray-300" />
              </div>
            )}
          </div>
        )
      })}

      {/* Add Page button */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={addPage}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="text-xs font-medium">Add Page</span>
        </button>
      </div>
    </div>
  )
}

// ─── Template Builder (Keka-style) ─────────────────────────────────────

function TemplateBuilder({ template, letterheads, onSave, onCancel }: {
  template: OfferTemplate | null
  letterheads: Letterhead[]
  onSave: (data: TemplateFormState) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<TemplateFormState>(template ? formFromTemplate(template) : makeEmptyForm())
  const [saving, setSaving] = useState(false)
  const [activePanel, setActivePanel] = useState<'editor' | 'variables' | 'settings'>('editor')
  const [zoom, setZoom] = useState(1.25)
  const [previewOpen, setPreviewOpen] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const pageEditorRefs = useRef<Map<number, RichTextEditorHandle>>(new Map())
  const activePageRef = useRef(0)

  const update = useCallback((key: keyof TemplateFormState, val: TemplateFormState[keyof TemplateFormState]) => {
    setForm(f => ({ ...f, [key]: val }))
  }, [])

  const selectedLetterhead = letterheads.find(l => l.id === form.letterhead_id) || null

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const insertVariable = (key: string) => {
    if (editorRef.current) {
      editorRef.current.insertText(key)
    }
  }

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 text-xs text-gray-500 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex-1 min-w-0">
          <Input value={form.name} onChange={e => update('name', e.target.value)}
            className="border-0 bg-transparent text-base font-semibold text-gray-900 px-0 h-auto focus-visible:ring-0 placeholder:text-gray-300"
            placeholder="Template name..." />
        </div>
        <div className="flex items-center gap-2">
          {/* Letterhead picker */}
          <Select value={form.letterhead_id || 'none'} onValueChange={v => update('letterhead_id', v === 'none' ? '' : v)}>
            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="No letterhead" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No letterhead</SelectItem>
              {letterheads.map(lh => (
                <SelectItem key={lh.id} value={lh.id}>
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-3 h-3 text-gray-400" /> {lh.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 mr-1">
            <Switch checked={form.is_active} onCheckedChange={v => update('is_active', v)} id="active-toggle" />
            <Label htmlFor="active-toggle" className="text-xs text-gray-500 cursor-pointer">Active</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Live Preview
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {template ? 'Update Template' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Main Layout — full width editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Formatting Toolbar + Tabs + Zoom */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shrink-0">
          {/* Tab row */}
          <div className="px-4 py-1.5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-1">
              {(['editor', 'variables', 'settings'] as const).map(tab => (
                <button key={tab} onClick={() => setActivePanel(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                    activePanel === tab ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}>
                  {tab === 'editor' ? 'Content' : tab === 'variables' ? 'Variables' : 'Settings'}
                </button>
              ))}
            </div>
            {/* Zoom controls */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Zoom out">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-gray-400 font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Zoom in">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(1.25)}
                className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
                title="Reset zoom">
                Reset
              </button>
            </div>
          </div>
          {/* Editor toolbar row — matches screenshot style */}
          {activePanel === 'editor' && (
            <div className="px-6 py-2 flex justify-center">
              <div className="bg-gray-50/80 border border-gray-200 rounded-lg px-3 py-1.5">
                <EditorToolbar editorRefs={pageEditorRefs} activePageRef={activePageRef} />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-gray-100">
          {activePanel === 'editor' && (
            <div className="p-4 flex justify-center">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                <PageEditor
                  form={form}
                  letterhead={selectedLetterhead}
                  editorRef={editorRef}
                  onChange={val => update('body_html', val)}
                  pageEditorRefs={pageEditorRefs}
                  activePageRef={activePageRef}
                />
              </div>
            </div>
          )}

          {activePanel === 'variables' && (
            <div className="p-6 max-w-lg mx-auto">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-3">Click a variable to insert it at the cursor position in the editor.</p>
                <VariablesPanel onInsert={key => { insertVariable(key); setActivePanel('editor') }} />
              </div>
            </div>
          )}

          {activePanel === 'settings' && (
            <div className="p-6 max-w-lg mx-auto">
              <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                {/* Description */}
                <div>
                  <Label className="text-xs">Template Description</Label>
                  <Input value={form.description} onChange={e => update('description', e.target.value)}
                    placeholder="Brief description..." className="mt-1 text-xs" />
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sections</p>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600">Show Salary Breakdown</Label>
                    <Switch checked={form.show_salary_breakdown} onCheckedChange={v => update('show_salary_breakdown', v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600">Show Signature Block</Label>
                    <Switch checked={form.show_signature_block} onCheckedChange={v => update('show_signature_block', v)} />
                  </div>
                </div>

                {/* Signatory Settings */}
                <div className="space-y-2 pt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Signatory</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-gray-400">Name</Label>
                      <Input value={form.signatory_name} onChange={e => update('signatory_name', e.target.value)}
                        placeholder="HR Manager" className="mt-0.5 h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-400">Title</Label>
                      <Input value={form.signatory_title} onChange={e => update('signatory_title', e.target.value)}
                        placeholder="Head of HR" className="mt-0.5 h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-400">Signatory Label</Label>
                      <Input value={form.signatory_label} onChange={e => update('signatory_label', e.target.value)}
                        placeholder="Authorized Signatory" className="mt-0.5 h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-gray-400">Candidate Label</Label>
                      <Input value={form.candidate_sig_label} onChange={e => update('candidate_sig_label', e.target.value)}
                        placeholder="Acceptance by Candidate" className="mt-0.5 h-8 text-xs" />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2">
                  <Label className="text-xs">Footer Text</Label>
                  <Input value={form.footer_text} onChange={e => update('footer_text', e.target.value)}
                    placeholder="Confidential footer text..." className="mt-1 text-xs" />
                </div>

                {/* Email Settings */}
                <div className="space-y-2 pt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Email Notification</p>
                  <div>
                    <Label className="text-[10px] text-gray-400">Subject</Label>
                    <Input value={form.email_subject} onChange={e => update('email_subject', e.target.value)}
                      placeholder="Offer Letter - {{job_title}}" className="mt-0.5 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-400">Email Body</Label>
                    <RichTextEditor value={form.email_body} onChange={val => update('email_body', val)}
                      placeholder="Email body..." rows={4} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Slide-in Panel (from right) */}
      {previewOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPreviewOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-[680px] max-w-[90vw] bg-gray-50 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800">Live Preview</h3>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Sample data · {splitPages(form.body_html).length} page{splitPages(form.body_html).length > 1 ? 's' : ''}
                </span>
              </div>
              <button onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex justify-center">
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                  <A4Preview form={form} letterhead={selectedLetterhead} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Template Listing ───────────────────────────────────────────────────

function TemplateList({ templates, letterheads, onEdit, onClone, onDelete, loading }: {
  templates: OfferTemplate[]; letterheads: Letterhead[]; onEdit: (t: OfferTemplate) => void; onClone: (t: OfferTemplate) => void; onDelete: (id: string) => void; loading: boolean
}) {
  const getLhName = (id: string | null) => id ? letterheads.find(l => l.id === id)?.name || '—' : '—'
  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
  if (templates.length === 0) return (
    <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
      <FileSignature className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500 font-medium">No offer templates yet</p>
      <p className="text-xs text-gray-400 mt-1">Create your first template to streamline offer letters</p>
    </div>
  )
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 border-b border-gray-200">
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Description</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Letterhead</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Created</th>
          <th className="w-10"></th>
        </tr></thead>
        <tbody>
          {templates.map(t => (
            <tr key={t.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 cursor-pointer" onClick={() => onEdit(t)}>
              <td className="px-4 py-3"><div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><FileSignature className="w-4 h-4" /></div>
                <div><p className="font-medium text-gray-900 text-sm">{t.name}</p>{t.is_active && <span className="inline-flex text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-0.5">Active</span>}</div>
              </div></td>
              <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{t.description || '—'}</td>
              <td className="px-4 py-3 text-xs text-gray-600">{getLhName(t.letterhead_id)}</td>
              <td className="px-4 py-3 text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => onEdit(t)}><Pencil className="w-3.5 h-3.5 mr-2" /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onClone(t)}><Copy className="w-3.5 h-3.5 mr-2" /> Clone</DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => onDelete(t.id)}><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function OfferTemplatesPage() {
  const { user, organization } = useUser()
  const { isAdmin } = useRole()
  const [tab, setTab] = useState<'templates' | 'letterheads'>('templates')
  const [templates, setTemplates] = useState<OfferTemplate[]>([])
  const [letterheads, setLetterheads] = useState<Letterhead[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [loadingLetterheads, setLoadingLetterheads] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<OfferTemplate | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try { const res = await fetch('/api/offer-templates'); const json = await res.json(); setTemplates(json.data || []) } catch { /* */ }
    setLoadingTemplates(false)
  }, [])
  const fetchLetterheads = useCallback(async () => {
    setLoadingLetterheads(true)
    try { const res = await fetch('/api/letterheads'); const json = await res.json(); setLetterheads(Array.isArray(json) ? json : []) } catch { /* */ }
    setLoadingLetterheads(false)
  }, [])

  useEffect(() => { if (user && organization) { fetchTemplates(); fetchLetterheads() } }, [user, organization, fetchTemplates, fetchLetterheads])

  const handleSaveTemplate = async (form: TemplateFormState) => {
    const payload: AnyRec = {
      name: form.name,
      description: form.description || null,
      is_active: form.is_active,
      letterhead_id: form.letterhead_id || null,
      body_html: form.body_html || null,
      signatory_name: form.signatory_name || null,
      signatory_title: form.signatory_title || null,
      signatory_label: form.signatory_label || null,
      candidate_sig_label: form.candidate_sig_label || null,
      footer_text: form.footer_text || null,
      show_salary_breakdown: form.show_salary_breakdown,
      show_bonus_section: false,
      show_terms_section: true,
      show_acceptance_section: true,
      show_signature_block: form.show_signature_block,
      email_subject: form.email_subject || null,
      email_body: form.email_body || null,
      template_source: 'manual',
    }
    const url = editingTemplate ? `/api/offer-templates/${editingTemplate.id}` : '/api/offer-templates'
    const method = editingTemplate ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Save failed') }
    setShowBuilder(false); setEditingTemplate(null); fetchTemplates()
  }

  const handleClone = async (t: OfferTemplate) => {
    const payload: AnyRec = { ...t, name: `${t.name} (Copy)`, is_active: false }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.deleted_at; delete payload.created_by; delete payload.organization_id
    await fetch('/api/offer-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    fetchTemplates()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true); await fetch(`/api/offer-templates/${deleteId}`, { method: 'DELETE' }); setDeleting(false); setDeleteId(null); fetchTemplates()
  }

  if (!isAdmin) return <div className="text-center py-16"><p className="text-gray-400 text-sm">Only administrators can manage offer templates.</p></div>

  if (showBuilder) return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap" rel="stylesheet" />
      <TemplateBuilder template={editingTemplate} letterheads={letterheads}
        onSave={handleSaveTemplate} onCancel={() => { setShowBuilder(false); setEditingTemplate(null) }} />
    </>
  )

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-gray-900">Offer Templates</h1><p className="text-sm text-gray-500 mt-0.5">Manage letterheads and offer letter templates</p></div>
        <Button onClick={() => { setEditingTemplate(null); setShowBuilder(true) }} className="gap-1.5 text-sm"><Plus className="w-4 h-4" /> New Template</Button>
      </div>
      <Tabs value={tab} onValueChange={v => setTab(v as 'templates' | 'letterheads')}>
        <TabsList className="bg-gray-100/80 p-1 rounded-lg mb-5">
          <TabsTrigger value="templates" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"><FileSignature className="w-3.5 h-3.5" /> Templates</TabsTrigger>
          <TabsTrigger value="letterheads" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"><ImageIcon className="w-3.5 h-3.5" /> Letterheads</TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          <TemplateList templates={templates} letterheads={letterheads} loading={loadingTemplates}
            onEdit={t => { setEditingTemplate(t); setShowBuilder(true) }} onClone={handleClone} onDelete={id => setDeleteId(id)} />
        </TabsContent>
        <TabsContent value="letterheads">
          <LetterheadManager letterheads={letterheads} onRefresh={fetchLetterheads} loading={loadingLetterheads} />
        </TabsContent>
      </Tabs>
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Template</DialogTitle><DialogDescription>This will permanently remove this template.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />} Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
