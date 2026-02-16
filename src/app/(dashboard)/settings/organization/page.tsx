'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { OrganizationDomain, OrganizationSubdomain } from '@/types/database'

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

  // AI Scoring state
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiAutoScore, setAiAutoScore] = useState(true)
  const [skillWeight, setSkillWeight] = useState(40)
  const [experienceWeight, setExperienceWeight] = useState(30)
  const [semanticWeight, setSemanticWeight] = useState(30)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSuccess, setAiSuccess] = useState(false)

  // White-Label state
  const [domains, setDomains] = useState<(OrganizationDomain & { dns_instructions?: { verification: { type: string; host: string; value: string }; cname: { type: string; host: string; value: string } } })[]>([])
  const [subdomains, setSubdomains] = useState<OrganizationSubdomain[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [newSubdomain, setNewSubdomain] = useState('')
  const [domainLoading, setDomainLoading] = useState(false)
  const [subdomainLoading, setSubdomainLoading] = useState(false)
  const [whitelabelError, setWhitelabelError] = useState<string | null>(null)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'getroa.com'

  const loadDomains = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch(`/api/domains?organization_id=${organization.id}`)
      if (res.ok) {
        const { data } = await res.json()
        setDomains(data || [])
      }
    } catch { /* ignore */ }
  }, [organization])

  const loadSubdomains = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch(`/api/subdomains?organization_id=${organization.id}`)
      if (res.ok) {
        const { data } = await res.json()
        setSubdomains(data || [])
      }
    } catch { /* ignore */ }
  }, [organization])

  useEffect(() => {
    loadDomains()
    loadSubdomains()
  }, [loadDomains, loadSubdomains])

  async function handleAddDomain() {
    if (!organization || !newDomain.trim()) return
    setDomainLoading(true)
    setWhitelabelError(null)
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organization.id, domain: newDomain.trim().toLowerCase() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setWhitelabelError(json.error)
      } else {
        setNewDomain('')
        loadDomains()
      }
    } catch { setWhitelabelError('Failed to add domain') }
    setDomainLoading(false)
  }

  async function handleVerifyDomain(domainId: string) {
    setWhitelabelError(null)
    try {
      const res = await fetch(`/api/domains/${domainId}/verify`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json()
        setWhitelabelError(json.error)
      }
      loadDomains()
    } catch { setWhitelabelError('Verification failed') }
  }

  async function handleRemoveDomain(domainId: string) {
    setWhitelabelError(null)
    try {
      await fetch(`/api/domains/${domainId}`, { method: 'DELETE' })
      loadDomains()
    } catch { /* ignore */ }
  }

  async function handleAddSubdomain() {
    if (!organization || !newSubdomain.trim()) return
    setSubdomainLoading(true)
    setWhitelabelError(null)
    try {
      const res = await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organization.id, subdomain: newSubdomain.trim().toLowerCase() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setWhitelabelError(json.error)
      } else {
        setNewSubdomain('')
        loadSubdomains()
      }
    } catch { setWhitelabelError('Failed to add subdomain') }
    setSubdomainLoading(false)
  }

  async function handleRemoveSubdomain(subdomainId: string) {
    setWhitelabelError(null)
    try {
      await fetch(`/api/subdomains/${subdomainId}`, { method: 'DELETE' })
      loadSubdomains()
    } catch { /* ignore */ }
  }

  const loadAiConfig = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch(`/api/ai-matching/config?organization_id=${organization.id}`)
      if (res.ok) {
        const { data } = await res.json()
        if (data) {
          setAiEnabled(data.enabled)
          setAiAutoScore(data.autoScore)
          setSkillWeight(data.weights.skill)
          setExperienceWeight(data.weights.experience)
          setSemanticWeight(data.weights.semantic)
        }
      }
    } catch {
      // use defaults
    }
  }, [organization])

  useEffect(() => {
    loadAiConfig()
  }, [loadAiConfig])

  async function handleSaveAiConfig() {
    if (!organization) return
    setAiSaving(true)
    try {
      await fetch('/api/ai-matching/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organization.id,
          enabled: aiEnabled,
          auto_score: aiAutoScore,
          skill_weight: skillWeight,
          experience_weight: experienceWeight,
          semantic_weight: semanticWeight,
        }),
      })
      setAiSuccess(true)
      setTimeout(() => setAiSuccess(false), 3000)
    } catch {
      // ignore
    }
    setAiSaving(false)
  }

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

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-1">Only administrators can manage organization settings.</p>
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

      {/* White Label — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>White Label</CardTitle>
            <CardDescription>
              Configure custom domains and platform subdomains for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {whitelabelError && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{whitelabelError}</div>
            )}

            {/* Custom Domains */}
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Custom Domain</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use your own domain (e.g., careers.acme.com) to host your careers page
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="careers.yourcompany.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="max-w-sm"
                />
                <Button onClick={handleAddDomain} disabled={domainLoading || !newDomain.trim()}>
                  {domainLoading ? 'Adding...' : 'Add Domain'}
                </Button>
              </div>

              {domains.length > 0 && (
                <div className="space-y-3">
                  {domains.map((d) => (
                    <div key={d.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{d.domain}</span>
                          <Badge variant={d.status === 'verified' ? 'default' : d.status === 'pending' ? 'secondary' : 'destructive'}>
                            {d.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.status !== 'verified' && (
                            <Button variant="outline" size="sm" onClick={() => handleVerifyDomain(d.id)}>
                              Verify
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => setExpandedDomain(expandedDomain === d.id ? null : d.id)}>
                            {expandedDomain === d.id ? 'Hide DNS' : 'DNS Setup'}
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleRemoveDomain(d.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>

                      {expandedDomain === d.id && d.dns_instructions && (
                        <div className="bg-gray-50 rounded-md p-3 text-xs space-y-3 mt-2">
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Step 1: Add TXT record to verify ownership</p>
                            <div className="bg-white rounded p-2 font-mono">
                              <div><span className="text-gray-500">Type:</span> {d.dns_instructions.verification.type}</div>
                              <div><span className="text-gray-500">Host:</span> {d.dns_instructions.verification.host}</div>
                              <div><span className="text-gray-500">Value:</span> {d.dns_instructions.verification.value}</div>
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Step 2: Add CNAME record to point to HireFlow</p>
                            <div className="bg-white rounded p-2 font-mono">
                              <div><span className="text-gray-500">Type:</span> {d.dns_instructions.cname.type}</div>
                              <div><span className="text-gray-500">Host:</span> {d.dns_instructions.cname.host}</div>
                              <div><span className="text-gray-500">Value:</span> {d.dns_instructions.cname.value}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-6 space-y-4">
              <div>
                <Label className="text-sm font-medium">Platform Subdomain</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Get a free subdomain on {platformDomain}
                </p>
              </div>

              <div className="flex gap-2 items-center">
                <Input
                  placeholder="yourcompany"
                  value={newSubdomain}
                  onChange={(e) => setNewSubdomain(e.target.value)}
                  className="max-w-[200px]"
                />
                <span className="text-sm text-gray-500">.{platformDomain}</span>
                <Button onClick={handleAddSubdomain} disabled={subdomainLoading || !newSubdomain.trim()}>
                  {subdomainLoading ? 'Creating...' : 'Create'}
                </Button>
              </div>

              {subdomains.length > 0 && (
                <div className="space-y-2">
                  {subdomains.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.subdomain}.{platformDomain}</span>
                        <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{s.status}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleRemoveSubdomain(s.id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      )}

      {/* AI Scoring Configuration — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>AI Candidate Scoring</CardTitle>
            <CardDescription>
              Configure AI-powered candidate matching and scoring. Uses OpenAI GPT-4o to analyze
              candidates against job requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {aiSuccess && (
              <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">
                AI scoring settings saved successfully
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable AI Scoring</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Allow AI to score candidates against job descriptions
                </p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Auto-Score New Applications</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically score candidates when they apply
                </p>
              </div>
              <Switch checked={aiAutoScore} onCheckedChange={setAiAutoScore} />
            </div>

            <div className="space-y-4 pt-2 border-t">
              <Label className="text-sm font-medium">Score Weights (must total 100)</Label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-700">Skills Match</span>
                    <p className="text-xs text-gray-400">How well candidate skills match requirements</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={skillWeight}
                      onChange={(e) => setSkillWeight(Number(e.target.value))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-700">Experience Match</span>
                    <p className="text-xs text-gray-400">Relevance of work experience</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={experienceWeight}
                      onChange={(e) => setExperienceWeight(Number(e.target.value))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-700">Semantic Similarity</span>
                    <p className="text-xs text-gray-400">AI embedding-based profile-job similarity</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={semanticWeight}
                      onChange={(e) => setSemanticWeight(Number(e.target.value))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              </div>

              {skillWeight + experienceWeight + semanticWeight !== 100 && (
                <p className="text-sm text-red-600">
                  Weights must total 100 (currently {skillWeight + experienceWeight + semanticWeight})
                </p>
              )}
            </div>

            <Button
              onClick={handleSaveAiConfig}
              disabled={aiSaving || skillWeight + experienceWeight + semanticWeight !== 100}
            >
              {aiSaving ? 'Saving...' : 'Save AI Settings'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
