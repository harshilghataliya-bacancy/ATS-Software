'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getCandidateById, updateCandidate } from '@/lib/services/candidates'
import { createApplication } from '@/lib/services/applications'
import { getJobs } from '@/lib/services/jobs'
import { CANDIDATE_SOURCES } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ResumeUpload } from './resume-upload'

interface CandidateData {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  linkedin_url?: string | null
  portfolio_url?: string | null
  current_company?: string | null
  current_title?: string | null
  location?: string | null
  source: string
  source_details?: string | null
  tags?: string[] | null
  notes?: string | null
  resume_url?: string | null
  created_at: string
}

interface JobOption {
  id: string
  title: string
  department: string
  status: string
}

export default function CandidateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, organization, isLoading: userLoading } = useUser()
  const [candidate, setCandidate] = useState<CandidateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [editing, setEditing] = useState(false)

  // Apply to job state
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJob, setSelectedJob] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)

  // Edit form state
  const [formData, setFormData] = useState<Partial<CandidateData>>({})

  const loadCandidate = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getCandidateById(
      supabase, params.id as string, organization.id
    )
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      setCandidate(data as CandidateData)
      setFormData(data as CandidateData)
    }
    setLoading(false)
  }, [organization, params.id])

  useEffect(() => {
    if (!organization) return
    loadCandidate()
  }, [organization, loadCandidate])

  async function loadJobs() {
    if (!organization) return
    const supabase = createClient()
    const { data } = await getJobs(supabase, organization.id, { status: 'published' })
    if (data) setJobs(data as JobOption[])
  }

  async function handleSave() {
    if (!organization || !candidate) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const { data: updated, error: updateError } = await updateCandidate(
      supabase,
      candidate.id,
      organization.id,
      {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        linkedin_url: formData.linkedin_url,
        portfolio_url: formData.portfolio_url,
        current_company: formData.current_company,
        current_title: formData.current_title,
        location: formData.location,
        notes: formData.notes,
      }
    )

    if (updateError) {
      setError(updateError.message)
    } else {
      setCandidate((prev) => prev ? { ...prev, ...updated } : prev)
      setSuccess(true)
      setEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  async function handleApplyToJob() {
    if (!organization || !user || !candidate || !selectedJob) return
    setApplying(true)
    setError(null)

    const supabase = createClient()
    const { error: applyError } = await createApplication(supabase, organization.id, {
      candidate_id: candidate.id,
      job_id: selectedJob,
    })

    if (applyError) {
      setError(applyError.message)
    } else {
      setApplyDialogOpen(false)
      setSelectedJob('')
      await loadCandidate()
    }
    setApplying(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!candidate) {
    return <div className="text-center py-12 text-gray-500">Candidate not found</div>
  }

  const sourceLabel = CANDIDATE_SOURCES.find((s) => s.value === candidate.source)?.label ?? candidate.source

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-semibold">
            {candidate.first_name?.[0]}{candidate.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {candidate.first_name} {candidate.last_name}
            </h1>
            <p className="text-gray-500">
              {candidate.current_title && candidate.current_company
                ? `${candidate.current_title} at ${candidate.current_company}`
                : candidate.email}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={applyDialogOpen} onOpenChange={(open) => {
            setApplyDialogOpen(open)
            if (open) loadJobs()
          }}>
            <DialogTrigger asChild>
              <Button>Apply to Job</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply to Job</DialogTitle>
                <DialogDescription>
                  Select a published job to apply {candidate.first_name} to.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Select value={selectedJob} onValueChange={setSelectedJob}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title} - {job.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {jobs.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">No published jobs available.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleApplyToJob} disabled={!selectedJob || applying}>
                  {applying ? 'Applying...' : 'Apply'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
          ) : (
            <>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => { setEditing(false); setFormData(candidate) }}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">Candidate updated successfully</div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personal Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input
                        value={formData.first_name ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={formData.last_name ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        value={formData.email ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={formData.phone ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input
                      value={formData.location ?? ''}
                      onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">Email</span>
                    <p className="font-medium">{candidate.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Phone</span>
                    <p className="font-medium">{candidate.phone ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Location</span>
                    <p className="font-medium">{candidate.location ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Source</span>
                    <p className="font-medium">{sourceLabel}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Professional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Current Company</Label>
                      <Input
                        value={formData.current_company ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, current_company: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Current Title</Label>
                      <Input
                        value={formData.current_title ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, current_title: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>LinkedIn</Label>
                      <Input
                        value={formData.linkedin_url ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, linkedin_url: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Portfolio</Label>
                      <Input
                        value={formData.portfolio_url ?? ''}
                        onChange={(e) => setFormData((p) => ({ ...p, portfolio_url: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">Company</span>
                    <p className="font-medium">{candidate.current_company ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Title</span>
                    <p className="font-medium">{candidate.current_title ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">LinkedIn</span>
                    <p className="font-medium">
                      {candidate.linkedin_url ? (
                        <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Profile
                        </a>
                      ) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Portfolio</span>
                    <p className="font-medium">
                      {candidate.portfolio_url ? (
                        <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Website
                        </a>
                      ) : '-'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  rows={4}
                  value={formData.notes ?? ''}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {candidate.notes || 'No notes added.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Resume, Tags, Info */}
        <div className="space-y-6">
          <ResumeUpload
            candidateId={candidate.id}
            orgId={organization!.id}
            currentResumeUrl={candidate.resume_url}
            onUploadComplete={(url) => setCandidate((prev) => prev ? { ...prev, resume_url: url } : prev)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.tags && candidate.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {candidate.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No tags.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Info</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Added</span>
                <span>{new Date(candidate.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Source</span>
                <span>{sourceLabel}</span>
              </div>
              {candidate.source_details && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Details</span>
                  <span className="text-right">{candidate.source_details}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={() => router.push('/candidates')}>
            Back to Candidates
          </Button>
        </div>
      </div>

    </div>
  )
}
