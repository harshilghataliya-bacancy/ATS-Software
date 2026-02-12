'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createJobSchema, type CreateJobInput } from '@/lib/validators/job'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { createJob } from '@/lib/services/jobs'
import { EMPLOYMENT_TYPES, CURRENCIES } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function NewJobPage() {
  const router = useRouter()
  const { user, organization } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema) as any,
    defaultValues: {
      employment_type: 'full_time',
      salary_currency: 'USD',
    },
  })

  async function onSubmit(data: CreateJobInput) {
    if (!organization || !user) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: createError } = await createJob(supabase, organization.id, data, user.id)

    if (createError) {
      setError(createError.message)
      setSaving(false)
      return
    }

    router.push('/jobs')
  }

  function submitAs(status: 'draft' | 'published') {
    setValue('status', status)
    handleSubmit(onSubmit)()
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Job</h1>
        <p className="text-gray-500 mt-1">Fill in the details for your new job posting</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input id="title" placeholder="Senior Frontend Engineer" {...register('title')} />
              {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Input id="department" placeholder="Engineering" {...register('department')} />
                {errors.department && <p className="text-sm text-red-600">{errors.department.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input id="location" placeholder="Remote / New York" {...register('location')} />
                {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Employment Type</Label>
              <Select defaultValue="full_time" onValueChange={(val) => setValue('employment_type', val as CreateJobInput['employment_type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Job Description *</Label>
              <Textarea
                id="description"
                rows={6}
                placeholder="Describe the role, responsibilities, and what makes it exciting..."
                {...register('description')}
              />
              {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements *</Label>
              <Textarea
                id="requirements"
                rows={4}
                placeholder="List the skills, experience, and qualifications needed..."
                {...register('requirements')}
              />
              {errors.requirements && <p className="text-sm text-red-600">{errors.requirements.message}</p>}
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
                <Input id="salary_min" type="number" placeholder="80000" {...register('salary_min')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Max Salary</Label>
                <Input id="salary_max" type="number" placeholder="120000" {...register('salary_max')} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select defaultValue="USD" onValueChange={(val) => setValue('salary_currency', val)}>
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
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" disabled={saving} onClick={() => submitAs('draft')}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button type="button" disabled={saving} onClick={() => submitAs('published')}>
            {saving ? 'Publishing...' : 'Publish'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
