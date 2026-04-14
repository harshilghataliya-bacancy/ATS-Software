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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Building2, Mail, MessageSquare, ShieldCheck,
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp,
  Sparkles, Clock, Inbox,
} from 'lucide-react'

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
  const [syncLogs, setSyncLogs] = useState<Array<{ type: string; message: string; email?: string; current?: number; total?: number }>>([])
  const [syncStats, setSyncStats] = useState<{ processed: number; created: number; skipped: number; errors: number } | null>(null)
  const [showSyncPanel, setShowSyncPanel] = useState(false)

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
    setSyncLogs([])
    setSyncStats(null)
    setShowSyncPanel(true)

    try {
      const res = await fetch('/api/settings/inbox-sync', { method: 'POST' })
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response stream')

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const data = line.replace(/^data: /, '').trim()
          if (!data) continue
          try {
            const event = JSON.parse(data)
            if (event.type === 'done') {
              setSyncStats(event.stats)
              setInboxLastSynced(new Date().toISOString())
            } else {
              setSyncLogs(prev => [...prev, event])
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setSyncLogs(prev => [...prev, { type: 'error', message: 'Connection failed. Check console.' }])
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
                {inboxSyncing ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    Syncing...
                  </span>
                ) : 'Sync Now'}
              </Button>
            </div>

            {showSyncPanel && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                {/* Progress bar */}
                {inboxSyncing && syncLogs.length > 0 && (() => {
                  const last = syncLogs[syncLogs.length - 1]
                  const pct = last.current && last.total ? Math.round((last.current / last.total) * 100) : 0
                  return (
                    <div className="h-1.5 bg-gray-200">
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  )
                })()}

                {/* Log entries */}
                <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
                  {syncLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      <span className={`mt-0.5 flex-shrink-0 h-1.5 w-1.5 rounded-full ${
                        log.type === 'error' ? 'bg-red-500' :
                        log.type === 'result' ? 'bg-green-500' :
                        log.type === 'scanning' ? 'bg-blue-500' :
                        'bg-yellow-500'
                      }`} />
                      <span className={`${log.type === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                        {log.current && log.total && <span className="text-gray-400 mr-1">[{log.current}/{log.total}]</span>}
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {inboxSyncing && <div className="text-[11px] text-gray-400 animate-pulse">Processing...</div>}
                </div>

                {/* Results summary */}
                {syncStats && (
                  <div className="border-t border-gray-200 px-3 py-2 bg-white">
                    <div className="flex items-center gap-3 text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="font-medium text-gray-700">
                        {syncStats.created} new &middot; {syncStats.processed - syncStats.created} updated &middot; {syncStats.skipped} skipped &middot; {syncStats.errors} errors
                      </span>
                    </div>
                  </div>
                )}

                {/* Hide button */}
                {!inboxSyncing && (
                  <div className="border-t border-gray-200 px-3 py-1.5 text-center">
                    <button
                      onClick={() => setShowSyncPanel(false)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Hide
                    </button>
                  </div>
                )}
              </div>
            )}
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
