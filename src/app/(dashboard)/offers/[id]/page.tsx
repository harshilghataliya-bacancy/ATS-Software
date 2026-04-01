'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
// import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getOfferById } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG, EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS } from '@/lib/constants'
import { formatSalary } from '@/lib/offer-template'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, Download, Loader2, MoreHorizontal,
  CheckCircle2, XCircle, Ban, User, Briefcase,
  MapPin, Calendar, DollarSign, Building2, Clock, Edit2, History,
} from 'lucide-react'

interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section?: string
}

interface OfferDetail {
  id: string
  status: string
  salary: number
  salary_currency: string
  start_date: string | null
  expiry_date: string | null
  template_html: string | null
  sent_at: string | null
  responded_at: string | null
  response_notes: string | null
  created_at: string
  updated_at: string
  application_id: string
  salary_components: SalaryComponent[] | null
  bonus_components: unknown[] | null
  reporting_manager: string | null
  employment_type: string | null
  location: string | null
  remuneration_type: string | null
  pf_applicable: boolean
  work_type: string | null
  business_unit: string | null
  version: number
  parent_offer_id: string | null
  application: {
    id: string
    candidate: { id: string; first_name: string; last_name: string; email: string; phone?: string } | null
    job: { id: string; title: string; department: string; status: string } | null
  } | null
}

/* ── Status styling ── */
const STATUS_DOT: Record<string, string> = {
  accepted: 'bg-emerald-500',
  declined: 'bg-rose-400',
  sent:     'bg-blue-500',
  expired:  'bg-gray-300',
  revoked:  'bg-orange-400',
  revised:  'bg-purple-400',
}

const STATUS_PILL: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-50 text-rose-600 border-rose-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  expired:  'bg-gray-50 text-gray-500 border-gray-200',
  revoked:  'bg-orange-50 text-orange-600 border-orange-200',
  revised:  'bg-purple-50 text-purple-600 border-purple-200',
}

/* ── Gradient avatars ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
]

function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

/* ── Timeline dot color ── */
const TIMELINE_DOT: Record<string, string> = {
  created:  'bg-gray-400',
  sent:     'bg-blue-500',
  accepted: 'bg-emerald-500',
  declined: 'bg-rose-500',
  revoked:  'bg-orange-500',
  revised:  'bg-purple-500',
  expired:  'bg-gray-300',
}

const STATUS_LABEL_MAP: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined',
  expired: 'Expired', revoked: 'Revoked', revised: 'Revised',
}

function fmtNum(n: number) {
  return n.toLocaleString('en-IN')
}

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { canManageOffers } = useRole()
  // Gmail status not needed — send is handled by the wizard

  const [offer, setOffer] = useState<OfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [responding, setResponding] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Dialog states
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false)
  const [declineNotes, setDeclineNotes] = useState('')
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeNotes, setRevokeNotes] = useState('')
  const [revising, setRevising] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [versionHistory, setVersionHistory] = useState<any[]>([])

  const loadOffer = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getOfferById(
      supabase, params.id as string, organization.id
    )
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      setOffer(data as OfferDetail)
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadOffer()
  }, [organization, loadOffer])

  // Load version history
  useEffect(() => {
    if (!offer?.id) return
    fetch(`/api/offers/${offer.id}/versions`)
      .then((r) => r.json())
      .then((r) => { if (r.data) setVersionHistory(r.data) })
      .catch(() => {})
  }, [offer?.id])

  // Auto-load PDF preview
  useEffect(() => {
    if (!offer) return
    loadPdfPreview()
    return () => {
      if (pdfPreviewUrl) window.URL.revokeObjectURL(pdfPreviewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id])

  const candidate = offer?.application?.candidate
  const job = offer?.application?.job
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'
  const initials = candidate
    ? `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
    : '??'
  const isSent = offer?.status === 'sent'
  const isAccepted = offer?.status === 'accepted'
  const isDeclined = offer?.status === 'declined'
  const isExpired = offer?.status === 'expired'
  const isRevised = offer?.status === 'revised'
  const canRevise = canManageOffers && (isSent || isAccepted || isDeclined || isExpired)

  async function loadPdfPreview() {
    if (!offer) return
    setPdfLoading(true)
    try {
      const res = await fetch(`/api/offers/generate-pdf?id=${offer.id}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        setPdfPreviewUrl(url)
      }
    } catch {
      // silently fail
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleRespond(status: 'accepted' | 'declined' | 'expired' | 'revoked', notes?: string) {
    if (!offer) return
    setResponding(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/offers/${offer.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || `Failed to mark offer as ${status}`); return }
      setSuccess(`Offer marked as ${status}`)
      setDeclineDialogOpen(false)
      setAcceptDialogOpen(false)
      setRevokeDialogOpen(false)
      setDeclineNotes('')
      setRevokeNotes('')
      await loadOffer()
    } catch {
      setError(`Failed to mark offer as ${status}`)
    } finally {
      setResponding(false)
    }
  }

  async function handleDownloadPdf() {
    if (!offer) return
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/offers/generate-pdf?id=${offer.id}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate PDF')
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
    } finally {
      setDownloadingPdf(false)
    }
  }

  async function handleRevise() {
    if (!offer) return
    setRevising(true)
    setError(null)
    try {
      // Navigate to wizard in revision mode - pass current offer data via the revise API
      router.push(`/offers/new?reviseOfferId=${offer.id}`)
    } catch {
      setError('Failed to start revision')
      setRevising(false)
    }
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-20 rounded-lg" />
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="text-center py-16">
        <p className="text-[13px] text-gray-400">Offer not found</p>
      </div>
    )
  }

  const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
  const empLabel = EMPLOYMENT_TYPE_OPTIONS?.find((e) => e.value === offer.employment_type)?.label || offer.employment_type?.replace('_', ' ') || '-'
  const workLabel = WORK_TYPE_OPTIONS?.find((w) => w.value === offer.work_type)?.label || offer.work_type?.replace('_', '-') || '-'

  // Salary structure breakdown
  const salaryComponents = offer.salary_components || []
  const earnings = salaryComponents.filter((c) => !c.section || c.section === 'earnings')
  const deductions = salaryComponents.filter((c) => c.section === 'deduction')
  const employer = salaryComponents.filter((c) => c.section === 'employer')
  const earningsTotal = earnings.reduce((s, c) => s + c.annual, 0)
  const deductionsTotal = deductions.reduce((s, c) => s + c.annual, 0)
  const employerTotal = employer.reduce((s, c) => s + c.annual, 0)
  const netPay = earningsTotal - deductionsTotal
  const totalCtc = earningsTotal + employerTotal

  return (
    <div className="space-y-5">
      {/* ── Back + Actions bar ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>

          {canRevise && (
            <button
              onClick={handleRevise}
              disabled={revising}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-[12px] font-medium hover:bg-purple-100 transition-colors disabled:opacity-40"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {revising ? 'Loading...' : 'Revise Offer'}
            </button>
          )}

          {canManageOffers && isSent && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  Respond
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setAcceptDialogOpen(true)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                  <span className="text-[13px]">Mark Accepted</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeclineDialogOpen(true)}>
                  <XCircle className="w-3.5 h-3.5 mr-2 text-rose-500" />
                  <span className="text-[13px]">Mark Declined</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setRevokeDialogOpen(true)} className="text-orange-600">
                  <Ban className="w-3.5 h-3.5 mr-2" />
                  <span className="text-[13px]">Revoke Offer</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

        </div>
      </div>

      {/* ── Header Card ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className={`h-[2px] ${STATUS_DOT[offer.status] ?? 'bg-gray-200'}`} />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
              <span className="text-sm font-semibold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[18px] font-semibold text-gray-900 tracking-tight">{candidateName}</h1>
                {(offer.version ?? 1) > 1 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">v{offer.version}</span>
                )}
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[offer.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[offer.status] ?? 'bg-gray-300'}`} />
                  {statusConfig?.label ?? offer.status}
                </span>
              </div>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {job?.title ?? 'Unknown Position'}
                {job?.department ? ` · ${job.department}` : ''}
                {offer.location ? ` · ${offer.location}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[18px] font-bold text-gray-900">{formatSalary(offer.salary, offer.salary_currency)}</p>
              <p className="text-[11px] text-gray-400">Annual CTC</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="bg-rose-50 text-rose-700 text-[12px] p-3 rounded-lg border border-rose-200">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-700 text-[12px] p-3 rounded-lg border border-emerald-200">{success}</div>
      )}
      {isRevised && versionHistory.length > 1 && (() => {
        const latest = versionHistory[versionHistory.length - 1]
        return latest && latest.id !== offer.id ? (
          <div className="bg-purple-50 text-purple-700 text-[12px] p-3 rounded-lg border border-purple-200 flex items-center justify-between">
            <span>This is a previous version (v{offer.version ?? 1}). A newer revision exists.</span>
            <button onClick={() => router.push(`/offers/${latest.id}`)} className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 underline">
              View Latest (v{latest.version})
            </button>
          </div>
        ) : null
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ===== LEFT COLUMN (2/3) ===== */}
        <div className="lg:col-span-2 space-y-5">
          {/* Position Details */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">Position Details</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { icon: Briefcase, label: 'Designation', value: job?.title ?? '-' },
                  { icon: Building2, label: 'Department', value: job?.department ?? '-' },
                  { icon: User, label: 'Employment Type', value: empLabel },
                  { icon: MapPin, label: 'Work Type', value: workLabel },
                  { icon: MapPin, label: 'Location', value: offer.location || '-' },
                  { icon: User, label: 'Reporting Manager', value: offer.reporting_manager || '-' },
                  ...(offer.business_unit ? [{ icon: Building2, label: 'Business Unit', value: offer.business_unit }] : []),
                  { icon: Calendar, label: 'Date of Joining', value: offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
                  { icon: DollarSign, label: 'Annual CTC', value: formatSalary(offer.salary, offer.salary_currency), bold: true },
                  { icon: CheckCircle2, label: 'PF Applicable', value: offer.pf_applicable ? 'Yes' : 'No' },
                ].map((item, idx) => (
                  <div key={idx}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{item.label}</p>
                    <p className={`text-[13px] mt-0.5 capitalize ${(item as { bold?: boolean }).bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Salary Structure */}
          {salaryComponents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <h3 className="text-[13px] font-semibold text-gray-900">Salary Structure ({offer.salary_currency})</h3>
              </div>
              <div className="p-5">
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Component</th>
                        <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Monthly</th>
                        <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Annual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Earnings */}
                      {earnings.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">A. Earnings</td></tr>
                          {earnings.map((comp, idx) => (
                            <tr key={`e-${idx}`} className="border-b border-gray-50">
                              <td className="py-2 px-3 pl-5 text-gray-600">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50/80 border-b border-gray-100">
                            <td className="py-2 px-3 font-semibold text-gray-700">Gross Salary</td>
                            <td className="text-right py-2 px-3 tabular-nums font-semibold text-gray-700">{fmtNum(Math.round(earningsTotal / 12))}</td>
                            <td className="text-right py-2 px-3 tabular-nums font-semibold text-gray-700">{fmtNum(earningsTotal)}</td>
                          </tr>
                        </>
                      )}

                      {/* Deductions */}
                      {deductions.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 text-[10px] font-semibold text-rose-500 uppercase tracking-wider bg-rose-50/30">B. Deductions</td></tr>
                          {deductions.map((comp, idx) => (
                            <tr key={`d-${idx}`} className="border-b border-gray-50">
                              <td className="py-2 px-3 pl-5 text-gray-600">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                          <tr className="bg-emerald-50/50 border-b border-gray-100">
                            <td className="py-2 px-3 font-semibold text-emerald-700">Net Pay (Take Home)</td>
                            <td className="text-right py-2 px-3 tabular-nums font-semibold text-emerald-700">{fmtNum(Math.round(netPay / 12))}</td>
                            <td className="text-right py-2 px-3 tabular-nums font-semibold text-emerald-700">{fmtNum(netPay)}</td>
                          </tr>
                        </>
                      )}

                      {/* Employer Contributions */}
                      {employer.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">C. Employer Contributions</td></tr>
                          {employer.map((comp, idx) => (
                            <tr key={`em-${idx}`} className="border-b border-gray-50">
                              <td className="py-2 px-3 pl-5 text-gray-600">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums text-gray-700">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* Total CTC */}
                      <tr className="bg-gray-900 text-white">
                        <td className="py-2.5 px-3 font-semibold text-[12px]">Total CTC (A + C)</td>
                        <td className="text-right py-2.5 px-3 tabular-nums font-semibold">{fmtNum(Math.round(totalCtc / 12))}</td>
                        <td className="text-right py-2.5 px-3 tabular-nums font-semibold">{fmtNum(totalCtc)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Offer Letter PDF Preview */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <Download className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">Offer Letter PDF</h3>
            </div>
            <div className="p-5">
              {pdfLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                  <span className="ml-2 text-[12px] text-gray-400">Loading PDF preview...</span>
                </div>
              )}
              {pdfPreviewUrl && !pdfLoading && (
                <iframe
                  src={`${pdfPreviewUrl}#navpanes=0`}
                  className="w-full border border-gray-100 rounded-lg"
                  style={{ height: '700px' }}
                  title="Offer Letter PDF Preview"
                />
              )}
              {!pdfPreviewUrl && !pdfLoading && (
                <div className="text-center py-10">
                  <p className="text-[12px] text-gray-400">PDF preview not available.</p>
                  <button
                    onClick={loadPdfPreview}
                    className="mt-2 text-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Load Preview
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN (1/3) ===== */}
        <div className="space-y-5">
          {/* Candidate Card */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">Candidate</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                  <span className="text-[12px] font-semibold text-white">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{candidateName}</p>
                  <p className="text-[11px] text-gray-400 truncate">{candidate?.email ?? '-'}</p>
                </div>
              </div>
              {candidate?.phone && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Phone</p>
                  <p className="text-[12px] text-gray-700 mt-0.5">{candidate.phone}</p>
                </div>
              )}
              <button
                onClick={() => router.push(`/candidates/${candidate?.id}`)}
                className="w-full text-center text-[11px] text-blue-600 hover:text-blue-700 font-medium py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                View Profile
              </button>
            </div>
          </div>

          {/* Offer Details */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">Offer Details</h3>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Salary', value: formatSalary(offer.salary, offer.salary_currency), bold: true },
                { label: 'Start Date', value: offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
                { label: 'Valid Until', value: offer.expiry_date ? new Date(offer.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
                { label: 'Remuneration', value: offer.remuneration_type || 'Annual' },
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400">{item.label}</span>
                  <span className={`text-[12px] ${item.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">Timeline</h3>
            </div>
            <div className="p-5">
              <div className="relative pl-5 space-y-4">
                {/* Vertical line */}
                <div className="absolute left-[3px] top-2 bottom-2 w-0.5 bg-gray-100" />

                {/* Created */}
                <div className="relative">
                  <div className={`absolute -left-5 top-0.5 w-2 h-2 rounded-full ${TIMELINE_DOT.created} ring-2 ring-white`} />
                  <p className="text-[12px] font-medium text-gray-700">Offer Created</p>
                  <p className="text-[10px] text-gray-400 tabular-nums">{new Date(offer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>

                {offer.sent_at && (
                  <div className="relative">
                    <div className={`absolute -left-5 top-0.5 w-2 h-2 rounded-full ${TIMELINE_DOT.sent} ring-2 ring-white`} />
                    <p className="text-[12px] font-medium text-gray-700">Sent to Candidate</p>
                    <p className="text-[10px] text-gray-400 tabular-nums">{new Date(offer.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}

                {offer.responded_at && (
                  <div className="relative">
                    <div className={`absolute -left-5 top-0.5 w-2 h-2 rounded-full ${TIMELINE_DOT[offer.status] ?? 'bg-gray-400'} ring-2 ring-white`} />
                    <p className="text-[12px] font-medium text-gray-700 capitalize">{offer.status === 'revoked' ? 'Revoked by Company' : `${offer.status} by Candidate`}</p>
                    <p className="text-[10px] text-gray-400 tabular-nums">{new Date(offer.responded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    {offer.response_notes && (
                      <p className="text-[11px] text-gray-500 mt-1 italic">&quot;{offer.response_notes}&quot;</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Version History */}
          {versionHistory.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                <h3 className="text-[13px] font-semibold text-gray-900">Version History</h3>
                <span className="text-[10px] text-gray-400 ml-auto">{versionHistory.length} versions</span>
              </div>
              <div className="p-4 space-y-2">
                {versionHistory.map((v) => {
                  const isCurrent = v.id === offer.id
                  const statusDot = STATUS_DOT[v.status] ?? 'bg-gray-300'
                  const statusLabel = STATUS_LABEL_MAP[v.status] ?? v.status
                  return (
                    <button
                      key={v.id}
                      onClick={() => { if (!isCurrent) router.push(`/offers/${v.id}`) }}
                      disabled={isCurrent}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        isCurrent
                          ? 'bg-gray-50 border-gray-200 cursor-default'
                          : 'border-transparent hover:bg-gray-50 hover:border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-gray-900">v{v.version}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                          <span className="text-[10px] text-gray-500">{statusLabel}</span>
                          {isCurrent && <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Current</span>}
                        </div>
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          {formatSalary(v.salary, v.salary_currency || 'INR')}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {v.sent_at
                          ? `Sent ${new Date(v.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                          : `Created ${new Date(v.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                        }
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      {/* Accept */}
      <AlertDialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Mark as Accepted?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Confirm that {candidateName} has accepted this offer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRespond('accepted')} disabled={responding} className="text-[12px] bg-emerald-600 hover:bg-emerald-700">
              {responding ? 'Updating...' : 'Confirm Accepted'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline */}
      <AlertDialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Mark as Declined?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Record that {candidateName} has declined this offer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Reason for declining (optional)"
              value={declineNotes}
              onChange={(e) => setDeclineNotes(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleRespond('declined', declineNotes || undefined)}
              disabled={responding}
              className="text-[12px] bg-rose-600 hover:bg-rose-700"
            >
              {responding ? 'Updating...' : 'Confirm Declined'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Revoke Offer?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              This will revoke the offer on behalf of the company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Reason for revoking (optional)"
              value={revokeNotes}
              onChange={(e) => setRevokeNotes(e.target.value)}
              rows={3}
              className="text-[12px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-[12px] bg-orange-600 hover:bg-orange-700"
              onClick={() => handleRespond('revoked', revokeNotes || undefined)}
              disabled={responding}
            >
              {responding ? 'Revoking...' : 'Revoke Offer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
