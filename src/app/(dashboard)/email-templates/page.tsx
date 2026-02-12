'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/lib/hooks/use-user'
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
        <Button onClick={openCreate}>+ New Template</Button>
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No email templates yet. Create your first one!</p>
            <Button onClick={openCreate}>Create Template</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-gray-900">{template.name}</span>
                      <Badge variant={TYPE_VARIANT[template.template_type] ?? 'outline'}>
                        {typeLabel(template.template_type)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Subject: {template.subject}</p>
                  </div>
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
                </div>
              </CardContent>
            </Card>
          ))}
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
