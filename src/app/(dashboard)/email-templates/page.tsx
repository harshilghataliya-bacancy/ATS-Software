'use client'

import { useEffect, useState } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '@/lib/services/email'
import { Button } from '@/components/ui/button'
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

type ViewMode = 'list' | 'card'

const TEMPLATE_TYPES = [
  { value: 'rejection',       label: 'Rejection' },
  { value: 'offer',           label: 'Offer' },
  { value: 'interview_invite',label: 'Interview Invite' },
  { value: 'follow_up',       label: 'Follow Up' },
  { value: 'custom',          label: 'Custom' },
] as const

const TYPE_COLOR: Record<string, string> = {
  rejection:       'bg-red-100 text-red-600',
  offer:           'bg-emerald-100 text-emerald-700',
  interview_invite:'bg-blue-100 text-blue-700',
  follow_up:       'bg-amber-100 text-amber-700',
  custom:          'bg-gray-100 text-gray-600',
}

const TYPE_BORDER: Record<string, string> = {
  rejection:       'border-l-red-400',
  offer:           'border-l-emerald-500',
  interview_invite:'border-l-blue-500',
  follow_up:       'border-l-amber-400',
  custom:          'border-l-gray-300',
}

const TYPE_TOP: Record<string, string> = {
  rejection:       'border-t-red-400',
  offer:           'border-t-emerald-500',
  interview_invite:'border-t-blue-500',
  follow_up:       'border-t-amber-400',
  custom:          'border-t-gray-300',
}

const TYPE_ICON_BG: Record<string, string> = {
  rejection:       'bg-red-50 text-red-500',
  offer:           'bg-emerald-50 text-emerald-600',
  interview_invite:'bg-blue-50 text-blue-600',
  follow_up:       'bg-amber-50 text-amber-600',
  custom:          'bg-gray-50 text-gray-500',
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

function IconList({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="5" y1="3.5" x2="13.5" y2="3.5" />
      <line x1="5" y1="7.5" x2="13.5" y2="7.5" />
      <line x1="5" y1="11.5" x2="13.5" y2="11.5" />
      <circle cx="2" cy="3.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="7.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="11.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

function IconGrid({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  )
}

export default function EmailTemplatesPage() {
  const { user, organization, isLoading } = useUser()
  const { canManageJobs } = useRole()

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Create/edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formType, setFormType] = useState('custom')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

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
    setShowPreview(false)
    setDialogOpen(true)
  }

  function openEdit(template: EmailTemplate) {
    setEditing(template)
    setFormName(template.name)
    setFormSubject(template.subject)
    setFormBody(template.body_html)
    setFormType(template.template_type)
    setError(null)
    setShowPreview(false)
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
        name: formName, subject: formSubject, body_html: formBody, template_type: formType,
      })
      if (updateError) { setError(updateError.message) } else { setDialogOpen(false); loadTemplates() }
    } else {
      const { error: createError } = await createEmailTemplate(
        supabase, organization.id,
        { name: formName, subject: formSubject, body_html: formBody, template_type: formType },
        user.id
      )
      if (createError) { setError(createError.message) } else { setDialogOpen(false); loadTemplates() }
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

  const typeLabel = (val: string) => TEMPLATE_TYPES.find((t) => t.value === val)?.label ?? val

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-400 mt-0.5 font-medium">Manage reusable email templates for candidates</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconList active={viewMode === 'list'} />
            </button>
            <button
              onClick={() => setViewMode('card')}
              title="Card view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconGrid active={viewMode === 'card'} />
            </button>
          </div>
          {canManageJobs && (
            <Button size="sm" className="h-9" onClick={openCreate}>
              + New Template
            </Button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48 h-9">
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
        viewMode === 'list' ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        )
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="py-16 text-center">
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
          </div>
        </div>

      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => openEdit(template)}
              className={`bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 ${TYPE_BORDER[template.template_type] ?? 'border-l-gray-300'} hover:shadow-md transition-shadow cursor-pointer`}
            >
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TYPE_ICON_BG[template.template_type] ?? 'bg-gray-50 text-gray-500'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">{template.name}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOR[template.template_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {typeLabel(template.template_type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">Subject: {template.subject}</p>
                    </div>
                  </div>
                  {canManageJobs && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                            <AlertDialogAction onClick={() => handleDelete(template.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

      ) : (
        /* ── CARD VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => openEdit(template)}
              className={`group bg-white rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-t-4 ${TYPE_TOP[template.template_type] ?? 'border-t-gray-300'}`}
            >
              <div className="p-4 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${TYPE_ICON_BG[template.template_type] ?? 'bg-gray-50 text-gray-500'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-gray-900 group-hover:text-blue-700 transition-colors leading-tight">
                        {template.name}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(template.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLOR[template.template_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {typeLabel(template.template_type)}
                  </span>
                </div>

                {/* Subject */}
                <div className="text-[12px] text-gray-500">
                  <span className="text-gray-400">Subject: </span>
                  <span className="text-gray-700 font-medium">{template.subject}</span>
                </div>

                {/* Body preview */}
                <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                  {template.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                </p>

                {/* Footer actions */}
                {canManageJobs && (
                  <div className="pt-2 border-t border-gray-100 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(template)}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50">Delete</Button>
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
                          <AlertDialogAction onClick={() => handleDelete(template.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
                <DialogDescription className="mt-1">
                  {editing ? 'Update the email template.' : 'Create a reusable email template.'}
                  {' '}Use variables like {'{{candidate_name}}'}, {'{{job_title}}'}, {'{{company_name}}'} in the body.
                </DialogDescription>
              </div>
              {/* Edit / Preview toggle */}
              <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1 shrink-0 ml-4">
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className={`px-3 h-7 text-xs font-medium rounded-md transition-all ${!showPreview ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className={`px-3 h-7 text-xs font-medium rounded-md transition-all ${showPreview ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Preview
                </button>
              </div>
            </div>
          </DialogHeader>

          {error && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>}

          {showPreview ? (
            <div className="space-y-3">
              {formSubject && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 font-medium">Subject: </span>
                  <span className="text-sm text-gray-700">{formSubject}</span>
                </div>
              )}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {formBody ? (
                  <iframe
                    srcDoc={formBody}
                    className="w-full"
                    style={{ height: '400px', border: 'none' }}
                    sandbox="allow-same-origin"
                    title="Email Preview"
                  />
                ) : (
                  <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                    No HTML body to preview
                  </div>
                )}
              </div>
            </div>
          ) : (
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
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            {!showPreview && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
