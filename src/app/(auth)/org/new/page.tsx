'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createOrganizationSchema, type CreateOrganizationInput } from '@/lib/validators/organization'
import { createOrg, signOut } from '../../actions'
import { createClient } from '@/lib/supabase/client'
import { getUserOrganizations } from '@/lib/services/organization'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function NewOrganizationPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [mode, setMode] = useState<'choose' | 'create'>('choose')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema) as any,
  })

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function onSubmit(data: CreateOrganizationInput) {
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('name', data.name)
    formData.append('slug', data.slug)

    const result = await createOrg(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  async function checkForInvitation() {
    setChecking(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setChecking(false)
      return
    }

    const { data: orgs } = await getUserOrganizations(supabase, user.id)

    if (orgs && orgs.length > 0) {
      router.push('/dashboard')
    } else {
      setError('No organization found yet. Ask your admin to add you, then check again.')
    }
    setChecking(false)
  }

  if (mode === 'choose') {
    return (
      <Card className="mt-8">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            Hire<span className="text-blue-600">Flow</span>
          </CardTitle>
          <CardDescription>How would you like to get started?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
          )}

          <Button className="w-full" onClick={() => setMode('create')}>
            Create a new organization
          </Button>
          <p className="text-xs text-center text-gray-500">
            You&apos;ll be the admin of this organization
          </p>

          <div className="flex items-center gap-3 my-2">
            <Separator className="flex-1" />
            <span className="text-xs text-gray-400">OR</span>
            <Separator className="flex-1" />
          </div>

          <Button variant="outline" className="w-full" onClick={checkForInvitation} disabled={checking}>
            {checking ? 'Checking...' : 'I was invited to an organization'}
          </Button>
          <p className="text-xs text-center text-gray-500">
            Your admin must add you first, then click this to join
          </p>

          <Separator className="my-2" />

          <form action={signOut}>
            <Button variant="ghost" size="sm" className="w-full text-gray-500" type="submit">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-8">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          Hire<span className="text-blue-600">Flow</span>
        </CardTitle>
        <CardDescription>Create your organization to get started</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              placeholder="Acme Inc."
              {...register('name', {
                onChange: (e) => {
                  setValue('slug', generateSlug(e.target.value))
                },
              })}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">hireflow.app/careers/</span>
              <Input
                id="slug"
                placeholder="acme-inc"
                {...register('slug')}
                className="flex-1"
              />
            </div>
            {errors.slug && (
              <p className="text-sm text-red-600">{errors.slug.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating...' : 'Create Organization'}
          </Button>

          <Button type="button" variant="ghost" className="w-full text-gray-500" onClick={() => setMode('choose')}>
            Back
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
