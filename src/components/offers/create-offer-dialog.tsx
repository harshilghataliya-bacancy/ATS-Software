'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { CURRENCIES, DEFAULT_OFFER_TEMPLATE } from '@/lib/constants'
import { substituteOfferVariables, formatSalary } from '@/lib/offer-template'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CreateOfferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicationId: string
  candidateName: string
  jobTitle: string
  department?: string
  autoSend?: boolean
  onSuccess?: () => void
}

export function CreateOfferDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  jobTitle,
  department,
  autoSend,
  onSuccess,
}: CreateOfferDialogProps) {
  const { organization } = useUser()
  const [salary, setSalary] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [startDate, setStartDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [templateHtml, setTemplateHtml] = useState(DEFAULT_OFFER_TEMPLATE)
  const [showPreview, setShowPreview] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSalary('')
      setCurrency('USD')
      setStartDate('')
      setExpiryDate('')
      setTemplateHtml(DEFAULT_OFFER_TEMPLATE)
      setShowPreview(false)
      setError(null)
    }
  }, [open])

  const previewHtml = substituteOfferVariables(templateHtml, {
    candidate_name: candidateName,
    job_title: jobTitle,
    department: department || '',
    salary: salary ? formatSalary(Number(salary), currency) : '{{salary}}',
    start_date: startDate ? new Date(startDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '{{start_date}}',
    expiry_date: expiryDate ? new Date(expiryDate).toLocaleDateString('en-US', { dateStyle: 'long' }) : '{{expiry_date}}',
    company_name: organization?.name || '{{company_name}}',
  })

  async function handleCreate() {
    if (!salary || !startDate || !expiryDate) {
      setError('Please fill in all required fields')
      return
    }

    if (new Date(expiryDate) < new Date(startDate)) {
      setError('Expiry date must be on or after start date')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          salary: Number(salary),
          salary_currency: currency,
          start_date: startDate,
          expiry_date: expiryDate,
          template_html: templateHtml,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create offer')
        return
      }

      // Auto-send the offer if requested
      if (autoSend && data.data?.id) {
        try {
          await fetch(`/api/offers/${data.data.id}/send`, { method: 'POST' })
        } catch {
          // Silently fall back to draft if Gmail not connected
        }
      }

      onOpenChange(false)
      onSuccess?.()
    } catch {
      setError('Failed to create offer')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
          <DialogDescription>
            Create an offer for {candidateName} - {jobTitle}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Salary *</Label>
              <Input
                type="number"
                placeholder="e.g. 85000"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date *</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Offer Letter Template</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
            {showPreview ? (
              <div
                className="border rounded-md p-4 prose prose-sm max-w-none min-h-[200px] bg-gray-50"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <Textarea
                rows={10}
                value={templateHtml}
                onChange={(e) => setTemplateHtml(e.target.value)}
                className="font-mono text-xs"
              />
            )}
            <p className="text-xs text-gray-500">
              Variables: {'{{candidate_name}}'}, {'{{job_title}}'}, {'{{department}}'}, {'{{salary}}'}, {'{{start_date}}'}, {'{{expiry_date}}'}, {'{{company_name}}'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
