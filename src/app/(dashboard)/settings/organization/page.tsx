'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/lib/validators/organization'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { useGmailStatus } from '@/lib/hooks/use-gmail-status'
import { useWhatsAppStatus } from '@/lib/hooks/use-whatsapp-status'
import { createClient } from '@/lib/supabase/client'
import { updateOrganization } from '@/lib/services/organization'
import { REAPPLY_RESTRICTION_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Building2, Mail, MessageSquare, Globe, ShieldCheck,
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp,
  Sparkles, Clock, Inbox,
} from 'lucide-react'
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

function SectionCard({ icon: Icon, iconColor, title, description, children, defaultOpen = true }: {
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3.5 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
          <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-1">{description}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-300 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5 pt-1 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

function StatusPill({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
      connected
        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
        : 'bg-gray-50 text-gray-400 border border-gray-100'
    }`}>
      {connected
        ? <CheckCircle2 className="w-3 h-3" />
        : <XCircle className="w-3 h-3" />
      }
      {label}
    </span>
  )
}

function SuccessMessage({ show, message }: { show: boolean; message: string }) {
  if (!show) return null
  return (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[13px] px-3.5 py-2.5 rounded-lg">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      {message}
    </div>
  )
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[13px] px-3.5 py-2.5 rounded-lg">
      <XCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
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

  // WhatsApp state
  const { configured: waConfigured, loading: waLoading, refresh: refreshWhatsApp } = useWhatsAppStatus()
  const [waSid, setWaSid] = useState('')
  const [waToken, setWaToken] = useState('')
  const [waNumber, setWaNumber] = useState('')
  const [waSandbox, setWaSandbox] = useState(false)
  const [waSaving, setWaSaving] = useState(false)
  const [waSuccess, setWaSuccess] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [waDisconnecting, setWaDisconnecting] = useState(false)

  // Reapply restriction state
  const [reapplyMonths, setReapplyMonths] = useState(6)
  const [reaplySaving, setReaplySaving] = useState(false)
  const [reapplySuccess, setReapplySuccess] = useState(false)

  // AI Scoring state
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiAutoScore, setAiAutoScore] = useState(true)
  const [skillWeight, setSkillWeight] = useState(40)
  const [experienceWeight, setExperienceWeight] = useState(30)
  const [semanticWeight, setSemanticWeight] = useState(30)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSuccess, setAiSuccess] = useState(false)

  // Inbox Sync state
  const [inboxEnabled, setInboxEnabled] = useState(false)
  const [inboxAutoParse, setInboxAutoParse] = useState(true)
  const [inboxLabel, setInboxLabel] = useState('INBOX')
  const [inboxLastSynced, setInboxLastSynced] = useState<string | null>(null)
  const [inboxSaving, setInboxSaving] = useState(false)
  const [inboxSuccess, setInboxSuccess] = useState(false)
  const [inboxSyncing, setInboxSyncing] = useState(false)

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
      const res = await fetch('/api/domains')
      if (res.ok) {
        const { data } = await res.json()
        setDomains(data || [])
      }
    } catch { /* ignore */ }
  }, [organization])

  const loadSubdomains = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch('/api/subdomains')
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
        body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }),
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
        body: JSON.stringify({ subdomain: newSubdomain.trim().toLowerCase() }),
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

  // Load reapply restriction from org
  useEffect(() => {
    if (organization) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org = organization as any
      if (org.offer_reapply_restriction_months != null) {
        setReapplyMonths(org.offer_reapply_restriction_months)
      }
    }
  }, [organization])

  async function handleSaveReapply() {
    if (!organization) return
    setReaplySaving(true)
    const supabase = createClient()
    await updateOrganization(supabase, organization.id, {
      offer_reapply_restriction_months: reapplyMonths,
    })
    setReaplySaving(false)
    setReapplySuccess(true)
    setTimeout(() => setReapplySuccess(false), 3000)
  }

  const loadAiConfig = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch('/api/ai-matching/config')
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

  // Load inbox sync config
  const loadInboxConfig = useCallback(async () => {
    if (!organization) return
    try {
      const res = await fetch('/api/settings/inbox-sync')
      if (res.ok) {
        const { config } = await res.json()
        if (config) {
          setInboxEnabled(config.enabled ?? false)
          setInboxAutoParse(config.auto_parse_resume ?? true)
          setInboxLabel(config.scan_label || 'INBOX')
          setInboxLastSynced(config.last_synced_at || null)
        }
      }
    } catch { /* use defaults */ }
  }, [organization])

  useEffect(() => {
    loadInboxConfig()
  }, [loadInboxConfig])

  async function handleSaveInboxConfig() {
    if (!organization) return
    setInboxSaving(true)
    try {
      await fetch('/api/settings/inbox-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: inboxEnabled,
          auto_parse_resume: inboxAutoParse,
          scan_label: inboxLabel,
        }),
      })
      setInboxSuccess(true)
      setTimeout(() => setInboxSuccess(false), 3000)
    } catch { /* ignore */ }
    setInboxSaving(false)
  }

  async function handleManualSync() {
    setInboxSyncing(true)
    try {
      const res = await fetch('/api/cron/inbox-sync', {
        headers: { Authorization: `Bearer ${window.location.origin}` },
      })
      const data = await res.json()
      if (data.success) {
        setInboxLastSynced(data.timestamp)
        alert(`Sync complete: ${data.created} new candidates, ${data.processed} processed, ${data.skipped} skipped`)
      }
    } catch {
      alert('Sync failed. Check console for details.')
    }
    setInboxSyncing(false)
  }

  async function handleSaveAiConfig() {
    if (!organization) return
    setAiSaving(true)
    try {
      await fetch('/api/ai-matching/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

  async function handleSaveWhatsApp() {
    setWaSaving(true)
    setWaError(null)
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_sid: waSid,
          auth_token: waToken,
          whatsapp_number: waNumber,
          is_sandbox: waSandbox,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaError(data.error || 'Failed to save')
      } else {
        setWaSuccess(true)
        refreshWhatsApp()
        setTimeout(() => setWaSuccess(false), 3000)
      }
    } catch {
      setWaError('Failed to save WhatsApp configuration')
    }
    setWaSaving(false)
  }

  async function handleDisconnectWhatsApp() {
    setWaDisconnecting(true)
    try {
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' })
      if (res.ok) {
        refreshWhatsApp()
        setWaSid('')
        setWaToken('')
        setWaNumber('')
        setWaSandbox(false)
      }
    } catch {
      // ignore
    }
    setWaDisconnecting(false)
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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-6">
            <Skeleton className="h-5 w-48 mb-3" />
            <Skeleton className="h-4 w-72 mb-5" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
        <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Access Denied</p>
        <p className="text-sm text-gray-400 mt-1">Only administrators can manage organization settings.</p>
      </div>
    )
  }

  const weightTotal = skillWeight + experienceWeight + semanticWeight

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Manage your organization details, integrations, and configurations</p>

      {/* General Settings */}
      <SectionCard
        icon={Building2}
        iconColor="bg-blue-50 text-blue-600"
        title="General"
        description="Organization name and URL slug"
      >
        <ErrorMessage message={error} />
        <SuccessMessage show={success} message="Settings updated successfully" />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-3 max-w-md">
          <div className="space-y-1.5">
            <Label className="text-[13px] text-gray-600">Organization Name</Label>
            <Input {...register('name')} className="h-9" />
            {errors.name && <p className="text-[12px] text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] text-gray-600">URL Slug</Label>
            <Input {...register('slug')} className="h-9" />
            {errors.slug && <p className="text-[12px] text-red-500">{errors.slug.message}</p>}
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </SectionCard>

      {/* Gmail */}
      <SectionCard
        icon={Mail}
        iconColor="bg-red-50 text-red-500"
        title="Gmail Integration"
        description="Send emails to candidates directly from HireFlow"
        defaultOpen={false}
      >
        <div className="space-y-3 mt-3">
          <SuccessMessage show={gmailJustConnected} message="Gmail connected successfully!" />
          {gmailError && <ErrorMessage message={`Gmail connection failed: ${gmailError}`} />}

          {gmailLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <div className="flex items-center justify-between">
              <StatusPill connected={gmailConnected} label={gmailConnected ? 'Connected' : 'Not connected'} />
              {gmailConnected ? (
                <Button variant="outline" size="sm" onClick={handleDisconnectGmail} disabled={disconnecting} className="text-[13px]">
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              ) : (
                <Button asChild size="sm" className="gap-1.5 text-[13px]">
                  <a href="/api/gmail/connect">
                    <ExternalLink className="w-3.5 h-3.5" /> Connect Gmail
                  </a>
                </Button>
              )}
            </div>
          )}
          <p className="text-[12px] text-gray-400">All team members will use this connected account for sending emails.</p>
        </div>
      </SectionCard>

      {/* WhatsApp */}
      <SectionCard
        icon={MessageSquare}
        iconColor="bg-green-50 text-green-600"
        title="WhatsApp Integration"
        description="Send WhatsApp messages via Twilio"
        defaultOpen={false}
      >
        <div className="space-y-4 mt-3">
          <ErrorMessage message={waError} />
          <SuccessMessage show={waSuccess} message="WhatsApp configuration saved!" />

          {waLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : waConfigured ? (
            <div className="flex items-center justify-between">
              <StatusPill connected={true} label="Connected" />
              <Button variant="outline" size="sm" onClick={handleDisconnectWhatsApp} disabled={waDisconnecting} className="text-[13px]">
                {waDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              <div className="space-y-1.5">
                <Label className="text-[13px] text-gray-600">Twilio Account SID</Label>
                <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={waSid} onChange={(e) => setWaSid(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-gray-600">Auth Token</Label>
                <Input type="password" placeholder="Your Twilio Auth Token" value={waToken} onChange={(e) => setWaToken(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-gray-600">WhatsApp-Enabled Number</Label>
                <Input placeholder="+14155238886" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} className="h-9 text-sm" />
                <p className="text-[11px] text-gray-400">E.164 format (e.g., +14155238886)</p>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-[13px] font-medium text-gray-700">Sandbox Mode</p>
                  <p className="text-[11px] text-gray-400">Enable for testing with Twilio sandbox</p>
                </div>
                <Switch checked={waSandbox} onCheckedChange={setWaSandbox} />
              </div>
              <Button size="sm" onClick={handleSaveWhatsApp} disabled={waSaving || !waSid || !waToken || !waNumber}>
                {waSaving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* White Label */}
      <SectionCard
        icon={Globe}
        iconColor="bg-purple-50 text-purple-600"
        title="White Label"
        description="Custom domains and platform subdomains"
        defaultOpen={false}
      >
        <div className="space-y-6 mt-3">
          <ErrorMessage message={whitelabelError} />

          {/* Custom Domains */}
          <div className="space-y-3">
            <div>
              <p className="text-[13px] font-medium text-gray-700">Custom Domain</p>
              <p className="text-[11px] text-gray-400">Use your own domain (e.g., careers.acme.com) for your careers page</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="careers.yourcompany.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="max-w-sm h-9 text-sm"
              />
              <Button size="sm" onClick={handleAddDomain} disabled={domainLoading || !newDomain.trim()}>
                {domainLoading ? 'Adding...' : 'Add Domain'}
              </Button>
            </div>

            {domains.length > 0 && (
              <div className="space-y-2">
                {domains.map((d) => (
                  <div key={d.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-700">{d.domain}</span>
                        <Badge
                          variant={d.status === 'verified' ? 'default' : d.status === 'pending' ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >
                          {d.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {d.status !== 'verified' && (
                          <Button variant="outline" size="sm" onClick={() => handleVerifyDomain(d.id)} className="h-7 text-[12px]">Verify</Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setExpandedDomain(expandedDomain === d.id ? null : d.id)} className="h-7 text-[12px]">
                          {expandedDomain === d.id ? 'Hide DNS' : 'DNS Setup'}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[12px] text-red-500 hover:text-red-600" onClick={() => handleRemoveDomain(d.id)}>Remove</Button>
                      </div>
                    </div>

                    {expandedDomain === d.id && d.dns_instructions && (
                      <div className="bg-white rounded-lg border border-gray-100 p-3 text-[12px] space-y-3 mt-1">
                        <div>
                          <p className="font-medium text-gray-600 mb-1.5">Step 1: Add TXT record to verify ownership</p>
                          <div className="bg-gray-50 rounded p-2 font-mono text-[11px] space-y-0.5">
                            <div><span className="text-gray-400">Type:</span> {d.dns_instructions.verification.type}</div>
                            <div><span className="text-gray-400">Host:</span> {d.dns_instructions.verification.host}</div>
                            <div><span className="text-gray-400">Value:</span> {d.dns_instructions.verification.value}</div>
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600 mb-1.5">Step 2: Add CNAME record to point to HireFlow</p>
                          <div className="bg-gray-50 rounded p-2 font-mono text-[11px] space-y-0.5">
                            <div><span className="text-gray-400">Type:</span> {d.dns_instructions.cname.type}</div>
                            <div><span className="text-gray-400">Host:</span> {d.dns_instructions.cname.host}</div>
                            <div><span className="text-gray-400">Value:</span> {d.dns_instructions.cname.value}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subdomains */}
          <div className="border-t border-gray-100 pt-5 space-y-3">
            <div>
              <p className="text-[13px] font-medium text-gray-700">Platform Subdomain</p>
              <p className="text-[11px] text-gray-400">Get a free subdomain on {platformDomain}</p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="yourcompany"
                value={newSubdomain}
                onChange={(e) => setNewSubdomain(e.target.value)}
                className="max-w-[200px] h-9 text-sm"
              />
              <span className="text-[13px] text-gray-400">.{platformDomain}</span>
              <Button size="sm" onClick={handleAddSubdomain} disabled={subdomainLoading || !newSubdomain.trim()}>
                {subdomainLoading ? 'Creating...' : 'Create'}
              </Button>
            </div>

            {subdomains.length > 0 && (
              <div className="space-y-2">
                {subdomains.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-700">{s.subdomain}.{platformDomain}</span>
                      <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{s.status}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[12px] text-red-500 hover:text-red-600" onClick={() => handleRemoveSubdomain(s.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Reapply Restriction */}
      <SectionCard
        icon={Clock}
        iconColor="bg-amber-50 text-amber-600"
        title="Reapply Restrictions"
        description="Control how long candidates must wait before reapplying"
        defaultOpen={false}
      >
        <div className="space-y-4 mt-3">
          <SuccessMessage show={reapplySuccess} message="Reapply restriction updated" />
          <div className="max-w-sm space-y-1.5">
            <Label className="text-[13px] text-gray-600">Restriction Period</Label>
            <Select value={String(reapplyMonths)} onValueChange={(v) => setReapplyMonths(Number(v))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REAPPLY_RESTRICTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400">
              Candidates who decline an offer will not be able to reapply for the same job during this period.
            </p>
          </div>
          <Button size="sm" onClick={handleSaveReapply} disabled={reaplySaving}>
            {reaplySaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </SectionCard>

      {/* AI Scoring */}
      <SectionCard
        icon={Sparkles}
        iconColor="bg-indigo-50 text-indigo-600"
        title="AI Candidate Scoring"
        description="Configure AI-powered candidate matching with GPT-4o"
        defaultOpen={false}
      >
        <div className="space-y-5 mt-3">
          <SuccessMessage show={aiSuccess} message="AI scoring settings saved" />

          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium text-gray-700">Enable AI Scoring</p>
                <p className="text-[11px] text-gray-400">Score candidates against job descriptions</p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium text-gray-700">Auto-Score New Applications</p>
                <p className="text-[11px] text-gray-400">Automatically score candidates when they apply</p>
              </div>
              <Switch checked={aiAutoScore} onCheckedChange={setAiAutoScore} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Score Weights</p>
              <span className={`text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-full ${
                weightTotal === 100
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-red-50 text-red-500'
              }`}>
                {weightTotal}/100
              </span>
            </div>

            {[
              { label: 'Skills Match', desc: 'How well candidate skills match requirements', value: skillWeight, onChange: setSkillWeight },
              { label: 'Experience Match', desc: 'Relevance of work experience', value: experienceWeight, onChange: setExperienceWeight },
              { label: 'Semantic Similarity', desc: 'AI embedding-based profile-job similarity', value: semanticWeight, onChange: setSemanticWeight },
            ].map((w) => (
              <div key={w.label} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-gray-700">{w.label}</p>
                  <p className="text-[11px] text-gray-400">{w.desc}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={w.value}
                    onChange={(e) => w.onChange(Number(e.target.value))}
                    className="w-16 h-8 text-sm text-center"
                  />
                  <span className="text-[12px] text-gray-400 w-4">%</span>
                </div>
              </div>
            ))}
          </div>

          <Button size="sm" onClick={handleSaveAiConfig} disabled={aiSaving || weightTotal !== 100}>
            {aiSaving ? 'Saving...' : 'Save AI Settings'}
          </Button>
        </div>
      </SectionCard>

      {/* Email Inbox Connector */}
      <SectionCard
        icon={Inbox}
        iconColor="bg-orange-50 text-orange-600"
        title="Email Inbox Connector"
        description="Auto-import candidates from resume emails into Candidate Bank"
        defaultOpen={false}
      >
        <div className="space-y-5 mt-3">
          <SuccessMessage show={inboxSuccess} message="Inbox sync settings saved" />

          {!gmailConnected && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-[13px] px-3.5 py-2.5 rounded-lg">
              <Mail className="w-4 h-4 shrink-0" />
              Connect Gmail first (above) to enable inbox sync. After connecting, you may need to reconnect for the new &quot;read emails&quot; permission.
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium text-gray-700">Enable Inbox Sync</p>
                <p className="text-[11px] text-gray-400">Automatically scan inbox for resume emails</p>
              </div>
              <Switch checked={inboxEnabled} onCheckedChange={setInboxEnabled} disabled={!gmailConnected} />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium text-gray-700">Auto-Parse Resumes</p>
                <p className="text-[11px] text-gray-400">Extract candidate details from resumes using AI</p>
              </div>
              <Switch checked={inboxAutoParse} onCheckedChange={setInboxAutoParse} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <Label className="text-[13px] text-gray-700">Gmail Label to Scan</Label>
              <Input
                value={inboxLabel}
                onChange={(e) => setInboxLabel(e.target.value)}
                placeholder="INBOX"
                className="mt-1.5 h-9 text-sm"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Tip: Create a Gmail filter to auto-label resume emails, then scan only that label
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-gray-700">Sync Schedule</p>
                <p className="text-[11px] text-gray-400">
                  Runs daily at 5:00 AM IST via cron
                  {inboxLastSynced && (
                    <span className="ml-2 text-gray-500">
                      &middot; Last synced: {new Date(inboxLastSynced).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualSync}
                disabled={inboxSyncing || !gmailConnected}
                className="text-xs"
              >
                {inboxSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveInboxConfig} disabled={inboxSaving}>
              {inboxSaving ? 'Saving...' : 'Save Inbox Settings'}
            </Button>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-[12px] font-medium text-gray-600 mb-1.5">How it works</p>
            <ul className="text-[11px] text-gray-500 space-y-1 list-disc pl-4">
              <li>Scans your Gmail for emails with PDF/DOC resume attachments</li>
              <li>Extracts candidate name, email, and details from the resume</li>
              <li>Creates new candidates in Candidate Bank (skips if already exists with active application)</li>
              <li>Your emails stay <strong>unread and untouched</strong> — read-only access</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
