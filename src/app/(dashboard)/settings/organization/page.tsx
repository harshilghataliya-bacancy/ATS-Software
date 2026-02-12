'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/lib/validators/organization'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { createClient } from '@/lib/supabase/client'
import { updateOrganization } from '@/lib/services/organization'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrganizationSettingsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    }>
      <OrganizationSettingsContent />
    </Suspense>
  )
}

function OrganizationSettingsContent() {
  const { organization, isLoading } = useUser()
  const { isAdmin } = useRole()
  const searchParams = useSearchParams()
  const { connected: gmailConnected, loading: gmailLoading, refresh: refreshGmail } = useGmailStatus()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Gmail callback URL params
  const gmailJustConnected = searchParams.get('gmail_connected') === 'true'
  const gmailError = searchParams.get('gmail_error')

  useEffect(() => {
    if (gmailJustConnected) refreshGmail()
  }, [gmailJustConnected, refreshGmail])

  async function handleDisconnectGmail() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/gmail/status', { method: 'DELETE' })
      if (res.ok) refreshGmail()
    } catch {
      // ignore
    }
    setDisconnecting(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors } } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema) as any,
    values: organization ? {
      name: organization.name,
      slug: organization.slug,
    } : undefined,
  })

  async function onSubmit(data: UpdateOrganizationInput) {
    if (!organization) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const { error: updateError } = await updateOrganization(supabase, organization.id, data)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Update your organization information</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md mb-4">
              Settings updated successfully
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input id="name" {...register('name')} />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <Input id="slug" {...register('slug')} />
              {errors.slug && (
                <p className="text-sm text-red-600">{errors.slug.message}</p>
              )}
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Gmail Integration — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Gmail Integration</CardTitle>
            <CardDescription>
              Connect your Gmail account to send emails to candidates directly from HireFlow.
              All team members will use this connected account for sending emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gmailJustConnected && (
              <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md mb-4">
                Gmail connected successfully!
              </div>
            )}
            {gmailError && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                Gmail connection failed: {gmailError}
              </div>
            )}

            {gmailLoading ? (
              <Skeleton className="h-10 w-40" />
            ) : gmailConnected ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-700">Gmail connected</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnectGmail}
                  disabled={disconnecting}
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            ) : (
              <Button asChild>
                <a href="/api/gmail/connect">Connect Gmail</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
