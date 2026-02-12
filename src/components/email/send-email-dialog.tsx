'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { getEmailTemplates } from '@/lib/services/email'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
  template_type: string
}

interface CandidateApplication {
  id: string
  jobTitle: string
}

interface SendEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateId: string
  candidateName: string
  candidateEmail: string
  jobTitle?: string
  applicationId?: string
  applications?: CandidateApplication[]
}

export function SendEmailDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  candidateEmail,
  jobTitle: initialJobTitle,
  applicationId: initialApplicationId,
  applications = [],
}: SendEmailDialogProps) {
  const { organization } = useUser()
  const { connected, loading: gmailLoading } = useGmailStatus()

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [to, setTo] = useState(candidateEmail)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Determine current job title based on selected application or prop
  const currentJobTitle = selectedAppId
    ? applications.find((a) => a.id === selectedAppId)?.jobTitle ?? ''
    : initialJobTitle ?? ''

  const currentApplicationId = selectedAppId || initialApplicationId

  useEffect(() => {
    setTo(candidateEmail)
  }, [candidateEmail])

  useEffect(() => {
    if (open && organization) {
      loadTemplates()
      setError(null)
      setSuccess(false)
      setSelectedTemplateId('')
      setSubject('')
      setBody('')
      // Auto-select first application if available
      if (applications.length > 0 && !selectedAppId) {
        setSelectedAppId(applications[0].id)
      }
    }
  }, [open, organization])

  async function loadTemplates() {
    if (!organization) return
    const supabase = createClient()
    const { data } = await getEmailTemplates(supabase, organization.id)
    if (data) setTemplates(data as EmailTemplate[])
  }

  function substituteVariables(text: string) {
    return text
      .replace(/\{\{candidate_name\}\}/g, candidateName)
      .replace(/\{\{job_title\}\}/g, currentJobTitle)
      .replace(/\{\{company_name\}\}/g, organization?.name ?? '')
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      setSubject(substituteVariables(template.subject))
      setBody(substituteVariables(template.body_html))
    }
  }

  // Re-substitute when application changes and a template is selected
  function handleApplicationChange(appId: string) {
    setSelectedAppId(appId)
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId)
      const jobTitleForApp = applications.find((a) => a.id === appId)?.jobTitle ?? ''
      if (template) {
        const sub = (text: string) => text
          .replace(/\{\{candidate_name\}\}/g, candidateName)
          .replace(/\{\{job_title\}\}/g, jobTitleForApp)
          .replace(/\{\{company_name\}\}/g, organization?.name ?? '')
        setSubject(sub(template.subject))
        setBody(sub(template.body_html))
      }
    }
  }

  async function handleSend() {
    if (!to || !subject || !body) {
      setError('All fields are required')
      return
    }

    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: body,
          candidateId,
          applicationId: currentApplicationId,
          templateId: selectedTemplateId || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to send email')
      } else {
        setSuccess(true)
        setTimeout(() => {
          onOpenChange(false)
          setSuccess(false)
          setSubject('')
          setBody('')
          setSelectedTemplateId('')
          setSelectedAppId('')
        }, 1500)
      }
    } catch {
      setError('Failed to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          <DialogDescription>
            Send an email to {candidateName} via Gmail
          </DialogDescription>
        </DialogHeader>

        {gmailLoading ? (
          <p className="text-sm text-gray-500 py-4">Checking Gmail connection...</p>
        ) : !connected ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600 mb-3">
              Gmail is not connected. Connect your Gmail account to send emails.
            </p>
            <Button asChild>
              <a href="/api/gmail/connect">Connect Gmail</a>
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>
            )}
            {success && (
              <div className="bg-green-50 text-green-700 text-sm p-2 rounded">Email sent successfully!</div>
            )}

            <div className="space-y-4">
              {applications.length > 0 && (
                <div className="space-y-2">
                  <Label>Job Context</Label>
                  <Select value={selectedAppId} onValueChange={handleApplicationChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {applications.map((app) => (
                        <SelectItem key={app.id} value={app.id}>{app.jobTitle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Template (optional)</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>To</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>

              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your email..."
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending || success}>
                {sending ? 'Sending...' : success ? 'Sent!' : 'Send Email'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
