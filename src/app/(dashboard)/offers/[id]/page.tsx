'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getOfferById, updateOffer } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG } from '@/lib/constants'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

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
  application: {
    id: string
    candidate: { id: string; first_name: string; last_name: string; email: string } | null
    job: { id: string; title: string; department: string; status: string } | null
  } | null
}

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { connected: gmailConnected, loading: gmailLoading } = useGmailStatus()

  const [offer, setOffer] = useState<OfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [responding, setResponding] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [templateHtml, setTemplateHtml] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Decline dialog state
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false)
  const [declineNotes, setDeclineNotes] = useState('')

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Send dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false)

  // Accept dialog state
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)

  // Expire dialog state
  const [expireDialogOpen, setExpireDialogOpen] = useState(false)

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
      setTemplateHtml(data.template_html || '')
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadOffer()
  }, [organization, loadOffer])

  const candidate = offer?.application?.candidate
  const job = offer?.application?.job
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Unknown'
  const isDraft = offer?.status === 'draft'
  const isSent = offer?.status === 'sent'

  const previewHtml = offer
    ? substituteOfferVariables(templateHtml, {
        candidate_name: candidateName,
        job_title: job?.title || '',
        department: job?.department || '',
        salary: formatSalary(offer.salary, offer.salary_currency),
        start_date: offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
        expiry_date: offer.expiry_date ? new Date(offer.expiry_date).toLocaleDateString('en-US', { dateStyle: 'long' }) : '',
        company_name: organization?.name || '',
      })
    : ''

  async function handleSave() {
    if (!organization || !offer) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    const supabase = createClient()
    const { error: updateError } = await updateOffer(
      supabase, offer.id, organization.id, { template_html: templateHtml }
    )

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess('Offer saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    }
    setSaving(false)
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

  async function handleRespond(status: 'accepted' | 'declined' | 'expired', notes?: string) {
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
      setExpireDialogOpen(false)
      setDeclineNotes('')
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
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!offer) {
    return <div className="text-center py-12 text-gray-500">Offer not found</div>
  }

  const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Offer for {candidateName}
            </h1>
            <Badge variant={statusConfig?.variant ?? 'secondary'}>
              {statusConfig?.label ?? offer.status}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">
            {job?.title ?? 'Unknown Position'} {job?.department ? `- ${job.department}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/offers')}>
            Back to Offers
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">{success}</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Offer Content */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Offer Letter</CardTitle>
                {isDraft && (
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                    {showPreview ? 'Edit' : 'Preview'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isDraft && !showPreview ? (
                <Textarea
                  rows={16}
                  value={templateHtml}
                  onChange={(e) => setTemplateHtml(e.target.value)}
                  className="font-mono text-xs"
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {isDraft && (
                  <>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button
                      variant="default"
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
                    <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                      Delete
                    </Button>
                  </>
                )}
                {isSent && (
                  <>
                    <Button onClick={() => setAcceptDialogOpen(true)}>
                      Mark Accepted
                    </Button>
                    <Button variant="outline" onClick={() => setDeclineDialogOpen(true)}>
                      Mark Declined
                    </Button>
                    <Button variant="outline" onClick={() => setExpireDialogOpen(true)}>
                      Mark Expired
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Offer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Candidate</span>
                <p className="font-medium">{candidateName}</p>
                <p className="text-gray-400">{candidate?.email}</p>
              </div>
              <div>
                <span className="text-gray-500">Position</span>
                <p className="font-medium">{job?.title ?? '-'}</p>
              </div>
              {job?.department && (
                <div>
                  <span className="text-gray-500">Department</span>
                  <p className="font-medium">{job.department}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Salary</span>
                <p className="font-medium">{formatSalary(offer.salary, offer.salary_currency)}</p>
              </div>
              <div>
                <span className="text-gray-500">Start Date</span>
                <p className="font-medium">
                  {offer.start_date ? new Date(offer.start_date).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Expiry Date</span>
                <p className="font-medium">
                  {offer.expiry_date ? new Date(offer.expiry_date).toLocaleDateString() : '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>{new Date(offer.created_at).toLocaleDateString()}</span>
              </div>
              {offer.sent_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Sent</span>
                  <span>{new Date(offer.sent_at).toLocaleDateString()}</span>
                </div>
              )}
              {offer.responded_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Response</span>
                  <span>{new Date(offer.responded_at).toLocaleDateString()}</span>
                </div>
              )}
              {offer.response_notes && (
                <div>
                  <span className="text-gray-500">Notes</span>
                  <p className="mt-1 text-gray-700">{offer.response_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={() => router.push(`/candidates/${candidate?.id}`)}>
            View Candidate
          </Button>
        </div>
      </div>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Offer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send the offer letter to {candidate?.email} via Gmail. The offer status will change to &quot;Sent&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={sending}>
              {sending ? 'Sending...' : 'Send Offer'}
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

      {/* Expire Dialog */}
      <AlertDialog open={expireDialogOpen} onOpenChange={setExpireDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Expired?</AlertDialogTitle>
            <AlertDialogDescription>
              Mark this offer as expired. This should be used when the offer has passed its expiry date without a response.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRespond('expired')} disabled={responding}>
              {responding ? 'Updating...' : 'Confirm Expired'}
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
