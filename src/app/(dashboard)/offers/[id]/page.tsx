'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getOfferById } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG, EMPLOYMENT_TYPE_OPTIONS, WORK_TYPE_OPTIONS } from '@/lib/constants'
import { formatSalary } from '@/lib/offer-template'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

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
  application: {
    id: string
    candidate: { id: string; first_name: string; last_name: string; email: string; phone?: string } | null
    job: { id: string; title: string; department: string; status: string } | null
  } | null
}

function fmtNum(n: number) {
  return n.toLocaleString('en-IN')
}

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { canManageOffers } = useRole()
  const { connected: gmailConnected, loading: gmailLoading } = useGmailStatus()

  const [offer, setOffer] = useState<OfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [responding, setResponding] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Dialog states
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false)
  const [declineNotes, setDeclineNotes] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeNotes, setRevokeNotes] = useState('')

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
  const isDraft = offer?.status === 'draft'
  const isSent = offer?.status === 'sent'
  const isDeclined = offer?.status === 'declined'
  const isExpired = offer?.status === 'expired'
  const canResend = isDeclined || isExpired

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
      // silently fail, user can retry
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleSend() {
    if (!offer) return
    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/offers/${offer.id}/send`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send offer')
        return
      }

      setSuccess('Offer sent successfully!')
      setSendDialogOpen(false)
      await loadOffer()
    } catch {
      setError('Failed to send offer')
    } finally {
      setSending(false)
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

      if (!res.ok) {
        setError(data.error || `Failed to mark offer as ${status}`)
        return
      }

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

  async function handleDelete() {
    if (!offer) return

    try {
      const res = await fetch(`/api/offers/${offer.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete offer')
        return
      }
      router.push('/offers')
    } catch {
      setError('Failed to delete offer')
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

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!offer) {
    return <div className="text-center py-12 text-gray-500">Offer not found</div>
  }

  const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
  const statusBorder = offer.status === 'accepted' ? 'border-l-emerald-500'
    : offer.status === 'declined' ? 'border-l-red-400'
    : offer.status === 'sent' ? 'border-l-slate-500'
    : offer.status === 'revoked' ? 'border-l-orange-400'
    : offer.status === 'expired' ? 'border-l-gray-300'
    : 'border-l-amber-400'

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
    <div className="space-y-6">
      {/* Back link */}
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-gray-900" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4" />Back
      </Button>

      {/* Header Card */}
      <div className={`bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 ${statusBorder}`}>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-lg font-semibold">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-gray-900">{candidateName}</h1>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {statusConfig?.label ?? offer.status}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-0.5">
                  {job?.title ?? 'Unknown Position'} {job?.department ? `\u00B7 ${job.department}` : ''} {offer.location ? `\u00B7 ${offer.location}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                <Download className="w-4 h-4 mr-1.5" />
                {downloadingPdf ? 'Generating...' : 'Download PDF'}
              </Button>
              {canManageOffers && isDraft && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!gmailConnected && !gmailLoading) {
                      setError('Please connect Gmail in Settings before sending offers.')
                      return
                    }
                    setSendDialogOpen(true)
                  }}
                >
                  Send Offer
                </Button>
              )}
              {canManageOffers && isSent && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setAcceptDialogOpen(true)}>
                    Accepted
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeclineDialogOpen(true)}>
                    Declined
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRevokeDialogOpen(true)}>
                    Revoke
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">{success}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== LEFT COLUMN (2/3) ===== */}
        <div className="lg:col-span-2 space-y-6">
          {/* Position Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Position Details</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <span className="text-gray-500">Designation</span>
                  <p className="font-medium mt-0.5">{job?.title ?? '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Department</span>
                  <p className="font-medium mt-0.5">{job?.department ?? '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Employment Type</span>
                  <p className="font-medium mt-0.5 capitalize">{empLabel}</p>
                </div>
                <div>
                  <span className="text-gray-500">Work Type</span>
                  <p className="font-medium mt-0.5 capitalize">{workLabel}</p>
                </div>
                <div>
                  <span className="text-gray-500">Location</span>
                  <p className="font-medium mt-0.5">{offer.location || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Reporting Manager</span>
                  <p className="font-medium mt-0.5">{offer.reporting_manager || '-'}</p>
                </div>
                {offer.business_unit && (
                  <div>
                    <span className="text-gray-500">Business Unit</span>
                    <p className="font-medium mt-0.5">{offer.business_unit}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Date of Joining</span>
                  <p className="font-medium mt-0.5">
                    {offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Annual CTC</span>
                  <p className="font-semibold mt-0.5 text-gray-900">{formatSalary(offer.salary, offer.salary_currency)}</p>
                </div>
                <div>
                  <span className="text-gray-500">PF Applicable</span>
                  <p className="font-medium mt-0.5">{offer.pf_applicable ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Salary Structure */}
          {salaryComponents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Salary Structure ({offer.salary_currency})</h3>
              </div>
              <div className="p-6">
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Component</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Monthly</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Annual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Earnings */}
                      {earnings.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 font-semibold text-gray-700 bg-gray-50 text-xs uppercase tracking-wide">A. Earnings</td></tr>
                          {earnings.map((comp, idx) => (
                            <tr key={`e-${idx}`} className="border-b border-gray-100">
                              <td className="py-2 px-3 pl-5">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 border-b font-semibold">
                            <td className="py-2 px-3">Gross Salary</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmtNum(Math.round(earningsTotal / 12))}</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmtNum(earningsTotal)}</td>
                          </tr>
                        </>
                      )}

                      {/* Deductions */}
                      {deductions.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 font-semibold text-red-700 bg-red-50 text-xs uppercase tracking-wide">B. Deductions (from Gross)</td></tr>
                          {deductions.map((comp, idx) => (
                            <tr key={`d-${idx}`} className="border-b border-gray-100">
                              <td className="py-2 px-3 pl-5">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                          <tr className="bg-green-50 border-b font-semibold text-green-800">
                            <td className="py-2 px-3">Net Pay (Take Home)</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmtNum(Math.round(netPay / 12))}</td>
                            <td className="text-right py-2 px-3 tabular-nums">{fmtNum(netPay)}</td>
                          </tr>
                        </>
                      )}

                      {/* Employer Contributions */}
                      {employer.length > 0 && (
                        <>
                          <tr><td colSpan={3} className="py-2 px-3 font-semibold text-gray-600 bg-gray-50 text-xs uppercase tracking-wide">C. Employer Contributions</td></tr>
                          {employer.map((comp, idx) => (
                            <tr key={`em-${idx}`} className="border-b border-gray-100">
                              <td className="py-2 px-3 pl-5">{comp.name}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.monthly)}</td>
                              <td className="text-right py-2 px-3 tabular-nums">{fmtNum(comp.annual)}</td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* Total CTC */}
                      <tr className="bg-gray-900 text-white font-bold">
                        <td className="py-2.5 px-3">Total CTC (A + C)</td>
                        <td className="text-right py-2.5 px-3 tabular-nums">{fmtNum(Math.round(totalCtc / 12))}</td>
                        <td className="text-right py-2.5 px-3 tabular-nums">{fmtNum(totalCtc)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Offer Letter PDF Preview */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Offer Letter PDF</h3>
            </div>
            <div className="p-6">
              {pdfLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading PDF preview...</span>
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
              {!pdfPreviewUrl && !pdfLoading && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <p>PDF preview not available.</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadPdfPreview}>
                    Load Preview
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN (1/3) ===== */}
        <div className="space-y-6">
          {/* Candidate Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Candidate</h3>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold">{candidateName}</p>
                  <p className="text-gray-500">{candidate?.email ?? '-'}</p>
                </div>
              </div>
              {candidate?.phone && (
                <div>
                  <span className="text-gray-500">Phone</span>
                  <p className="font-medium">{candidate.phone}</p>
                </div>
              )}
            </div>
          </div>

          {/* Offer Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Offer Details</h3>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Salary</span>
                <span className="font-semibold text-gray-900">{formatSalary(offer.salary, offer.salary_currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Start Date</span>
                <span className="font-medium">
                  {offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Offer Valid Until</span>
                <span className="font-medium">
                  {offer.expiry_date ? new Date(offer.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Remuneration</span>
                <span className="font-medium capitalize">{offer.remuneration_type || 'Annual'}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Timeline</h3>
            </div>
            <div className="p-6">
              <div className="relative pl-6 space-y-4 text-sm">
                {/* Created */}
                <div className="relative">
                  <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-gray-300 border-2 border-white" />
                  <p className="font-medium">Offer Created</p>
                  <p className="text-gray-500 text-xs">{new Date(offer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>

                {offer.sent_at && (
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-slate-500 border-2 border-white" />
                    <p className="font-medium">Sent to Candidate</p>
                    <p className="text-gray-500 text-xs">{new Date(offer.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}

                {offer.responded_at && (
                  <div className="relative">
                    <div className={`absolute -left-6 top-0.5 w-3 h-3 rounded-full border-2 border-white ${offer.status === 'accepted' ? 'bg-green-500' : offer.status === 'declined' ? 'bg-red-500' : offer.status === 'revoked' ? 'bg-orange-500' : 'bg-gray-400'}`} />
                    <p className="font-medium capitalize">{offer.status === 'revoked' ? 'Revoked by Company' : `${offer.status} by Candidate`}</p>
                    <p className="text-gray-500 text-xs">{new Date(offer.responded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    {offer.response_notes && (
                      <p className="text-gray-600 text-xs mt-1 italic">&quot;{offer.response_notes}&quot;</p>
                    )}
                  </div>
                )}

                {/* Vertical line connector */}
                <div className="absolute left-[-18px] top-3 bottom-3 w-0.5 bg-gray-200" />
              </div>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => router.push(`/candidates/${candidate?.id}`)}>
            View Candidate Profile
          </Button>
        </div>
      </div>

      {/* Send / Resend Confirmation Dialog */}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{canResend ? 'Resend Offer?' : 'Send Offer?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {canResend
                ? `The offer was previously ${offer?.status}. This will resend the offer letter to ${candidate?.email} via Gmail with a fresh PDF attachment. The offer status will be reset to "Sent".`
                : `This will send the offer letter to ${candidate?.email} via Gmail with PDF attachment. The offer status will change to "Sent".`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={sending}>
              {sending ? 'Sending...' : canResend ? 'Resend Offer' : 'Send Offer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Dialog */}
      <AlertDialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Accepted?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm that {candidateName} has accepted this offer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRespond('accepted')} disabled={responding}>
              {responding ? 'Updating...' : 'Confirm Accepted'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline Dialog */}
      <AlertDialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Declined?</AlertDialogTitle>
            <AlertDialogDescription>
              Record that {candidateName} has declined this offer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Reason for declining (optional)"
              value={declineNotes}
              onChange={(e) => setDeclineNotes(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleRespond('declined', declineNotes || undefined)}
              disabled={responding}
              className="bg-red-600 hover:bg-red-700"
            >
              {responding ? 'Updating...' : 'Confirm Declined'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Offer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the offer on behalf of the company. The candidate will no longer be able to accept it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Reason for revoking (optional)"
              value={revokeNotes}
              onChange={(e) => setRevokeNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => handleRespond('revoked', revokeNotes || undefined)}
              disabled={responding}
            >
              {responding ? 'Revoking...' : 'Revoke Offer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Offer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this offer. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
