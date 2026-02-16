'use client'

import { useEffect, useState } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '@/lib/services/email'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const TEMPLATE_TYPES = [
  { value: 'rejection', label: 'Rejection' },
  { value: 'offer', label: 'Offer' },
  { value: 'interview_invite', label: 'Interview Invite' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'custom', label: 'Custom' },
] as const

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rejection: 'destructive',
  offer: 'default',
  interview_invite: 'secondary',
  follow_up: 'outline',
  custom: 'outline',
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
  template_type: string
  variables: Record<string, unknown> | null
  created_at: string
}

export default function EmailTemplatesPage() {
  const { user, organization, isLoading } = useUser()
  const { canManageJobs } = useRole()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')

  // Create/edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formType, setFormType] = useState('custom')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (organization) loadTemplates()
  }, [organization, filterType])

  async function loadTemplates() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const typeFilter = filterType !== 'all' ? filterType : undefined
    const { data } = await getEmailTemplates(supabase, organization.id, typeFilter)
    if (data) setTemplates(data as EmailTemplate[])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormSubject('')
    setFormBody('')
    setFormType('custom')
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(template: EmailTemplate) {
    setEditing(template)
    setFormName(template.name)
    setFormSubject(template.subject)
    setFormBody(template.body_html)
    setFormType(template.template_type)
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!organization || !user) return
    if (!formName || !formSubject || !formBody) {
      setError('All fields are required')
      return
    }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    if (editing) {
      const { error: updateError } = await updateEmailTemplate(supabase, editing.id, organization.id, {
        name: formName,
        subject: formSubject,
        body_html: formBody,
        template_type: formType,
      })
      if (updateError) {
        setError(updateError.message)
      } else {
        setDialogOpen(false)
        loadTemplates()
      }
    } else {
      const { error: createError } = await createEmailTemplate(
        supabase,
        organization.id,
        { name: formName, subject: formSubject, body_html: formBody, template_type: formType },
        user.id
      )
      if (createError) {
        setError(createError.message)
      } else {
        setDialogOpen(false)
        loadTemplates()
      }
    }
    setSaving(false)
  }

  async function handleDelete(templateId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteEmailTemplate(supabase, templateId, organization.id)
    setTemplates((prev) => prev.filter((t) => t.id !== templateId))
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const typeLabel = (val: string) =>
    TEMPLATE_TYPES.find((t) => t.value === val)?.label ?? val

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-gray-500 mt-1">Manage reusable email templates for candidates</p>
        </div>
        {canManageJobs && <Button onClick={openCreate}>+ New Template</Button>}
      </div>

      <div className="flex gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TEMPLATE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium mb-1">No email templates yet</p>
              <p className="text-gray-500 text-sm mb-4">Create reusable templates to speed up communication.</p>
              {canManageJobs && <Button onClick={openCreate}>Create Template</Button>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const typeBorder = template.template_type === 'offer' ? 'border-l-emerald-500' : template.template_type === 'rejection' ? 'border-l-red-400' : template.template_type === 'interview_invite' ? 'border-l-blue-500' : template.template_type === 'follow_up' ? 'border-l-amber-400' : 'border-l-gray-300'
            return (
              <Card key={template.id} className={`border-l-4 ${typeBorder} hover:shadow-md transition-shadow`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${template.template_type === 'offer' ? 'bg-emerald-50 text-emerald-600' : template.template_type === 'rejection' ? 'bg-red-50 text-red-600' : template.template_type === 'interview_invite' ? 'bg-blue-50 text-blue-600' : template.template_type === 'follow_up' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-base font-semibold text-gray-900">{template.name}</span>
                          <Badge variant={TYPE_VARIANT[template.template_type] ?? 'outline'}>
                            {typeLabel(template.template_type)}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">Subject: {template.subject}</p>
                      </div>
                    </div>
                    {canManageJobs && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(template)}>Edit</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600">Delete</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete template?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete &quot;{template.name}&quot;. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(template.id)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the email template.' : 'Create a reusable email template.'}
              {' '}Use variables like {'{{candidate_name}}'}, {'{{job_title}}'}, {'{{company_name}}'} in the body.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Interview Invitation" />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="e.g. Interview for {{job_title}} at {{company_name}}" />
            </div>

            <div className="space-y-2">
              <Label>Body (HTML) *</Label>
              <Textarea
                rows={10}
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Write the email body here..."
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
