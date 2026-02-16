'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateJobSchema, type UpdateJobInput } from '@/lib/validators/job'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getJobById, updateJob, getScorecardCriteria, upsertScorecardCriteria } from '@/lib/services/jobs'
import { EMPLOYMENT_TYPES, CURRENCIES, JOB_STATUS_CONFIG } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { canManageJobs } = useRole()
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [criteria, setCriteria] = useState<Array<{ name: string; description: string; weight: number }>>([])
  const [criteriaLoaded, setCriteriaLoaded] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue, reset } = useForm<UpdateJobInput>({
    resolver: zodResolver(updateJobSchema) as any,
  })

  useEffect(() => {
    if (!organization) return
    loadJob()
  }, [organization])

  async function loadJob() {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getJobById(supabase, params.id as string, organization.id)
    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      setJob(data)
      reset({
        title: data.title,
        department: data.department,
        location: data.location,
        employment_type: data.employment_type,
        description: data.description,
        requirements: data.requirements ?? '',
        salary_min: data.salary_min,
        salary_max: data.salary_max,
        salary_currency: data.salary_currency ?? 'USD',
        status: data.status,
      })

      // Load scorecard criteria
      if (!criteriaLoaded) {
        const { data: criteriaData } = await getScorecardCriteria(supabase, params.id as string, organization.id)
        if (criteriaData && criteriaData.length > 0) {
          setCriteria(criteriaData.map((c: Record<string, unknown>) => ({
            name: c.name as string,
            description: (c.description as string) ?? '',
            weight: c.weight as number,
          })))
        }
        setCriteriaLoaded(true)
      }
    }
    setLoading(false)
  }

  async function onSubmit(data: UpdateJobInput) {
    if (!organization || !job) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()

    // Handle publish
    const updateData: Record<string, unknown> = { ...data }
    if (data.status === 'published' && job.status !== 'published') {
      updateData.published_at = new Date().toISOString()
    }
    if (data.status === 'closed' && job.status !== 'closed') {
      updateData.closed_at = new Date().toISOString()
    }

    const { data: updated, error: updateError } = await updateJob(
      supabase, params.id as string, organization.id, updateData
    )

    if (updateError) {
      setError(updateError.message)
    } else {
      setJob(updated)

      // Save scorecard criteria
      const validCriteria = criteria.filter((c) => c.name.trim())
      await upsertScorecardCriteria(supabase, params.id as string, organization.id, validCriteria)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-500">Job not found</div>
  }

  const statusConfig = JOB_STATUS_CONFIG[job.status as keyof typeof JOB_STATUS_CONFIG]

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{job.title as string}</h1>
            <Badge variant={statusConfig?.variant ?? 'secondary'}>
              {statusConfig?.label ?? (job.status as string)}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">{canManageJobs ? 'Edit job details' : 'View job details'}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/${params.id}/applications`}>
            <Button variant="outline">Applications</Button>
          </Link>
          <Link href={`/jobs/${params.id}/pipeline`}>
            <Button variant="outline">View Pipeline</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md mb-4">Job updated successfully</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title</Label>
              <Input id="title" {...register('title')} disabled={!canManageJobs} />
              {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" {...register('department')} disabled={!canManageJobs} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" {...register('location')} disabled={!canManageJobs} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select
                  defaultValue={job.employment_type as string}
                  onValueChange={(val) => setValue('employment_type', val as UpdateJobInput['employment_type'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  defaultValue={job.status as string}
                  onValueChange={(val) => setValue('status', val as UpdateJobInput['status'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Job Description</Label>
              <Textarea id="description" rows={6} {...register('description')} disabled={!canManageJobs} />
              {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea id="requirements" rows={4} {...register('requirements')} disabled={!canManageJobs} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compensation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary_min">Min Salary</Label>
                <Input id="salary_min" type="number" {...register('salary_min')} disabled={!canManageJobs} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Max Salary</Label>
                <Input id="salary_max" type="number" {...register('salary_max')} disabled={!canManageJobs} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  defaultValue={(job.salary_currency as string) ?? 'USD'}
                  onValueChange={(val) => setValue('salary_currency', val)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evaluation Criteria</CardTitle>
            <p className="text-sm text-gray-500">Define criteria interviewers will rate candidates on</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {criteria.map((c, idx) => (
              <div key={idx} className="flex gap-3 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Criteria name"
                    value={c.name}
                    onChange={(e) => {
                      const updated = [...criteria]
                      updated[idx] = { ...updated[idx], name: e.target.value }
                      setCriteria(updated)
                    }}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={c.description}
                    className="text-sm"
                    onChange={(e) => {
                      const updated = [...criteria]
                      updated[idx] = { ...updated[idx], description: e.target.value }
                      setCriteria(updated)
                    }}
                  />
                </div>
                <div className="w-20">
                  <Label className="text-xs text-gray-500">Weight</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={c.weight}
                    onChange={(e) => {
                      const updated = [...criteria]
                      updated[idx] = { ...updated[idx], weight: Number(e.target.value) }
                      setCriteria(updated)
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-red-500 hover:text-red-700"
                  onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                >
                  X
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCriteria([...criteria, { name: '', description: '', weight: 5 }])}
            >
              Add Criteria
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          {canManageJobs && (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.push('/jobs')}>
            Back to Jobs
          </Button>
        </div>
      </form>
    </div>
  )
}
