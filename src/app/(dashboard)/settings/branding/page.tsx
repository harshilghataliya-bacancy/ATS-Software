'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  Upload, Loader2, Check, ExternalLink, Briefcase,
  MapPin, Clock, ChevronRight, Image as ImageIcon, Globe, Trash2, Copy,
} from 'lucide-react'

interface BrandingData {
  brand_name: string | null
  logo_url: string | null
  primary_color: string
  accent_color: string
}

const DEFAULT_BRANDING: BrandingData = {
  brand_name: '',
  logo_url: null,
  primary_color: '#4f46e5',
  accent_color: '#7c3aed',
}

// Preset color pairs
const COLOR_PRESETS = [
  { primary: '#4f46e5', accent: '#7c3aed', label: 'Indigo' },
  { primary: '#2563eb', accent: '#3b82f6', label: 'Blue' },
  { primary: '#059669', accent: '#10b981', label: 'Green' },
  { primary: '#dc2626', accent: '#ef4444', label: 'Red' },
  { primary: '#d97706', accent: '#f59e0b', label: 'Amber' },
  { primary: '#7c3aed', accent: '#a855f7', label: 'Purple' },
  { primary: '#0891b2', accent: '#06b6d4', label: 'Cyan' },
  { primary: '#be185d', accent: '#ec4899', label: 'Pink' },
  { primary: '#1e293b', accent: '#475569', label: 'Slate' },
]

export default function BrandingPage() {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [brandName, setBrandName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#4f46e5')
  const [accentColor, setAccentColor] = useState('#7c3aed')

  // Track saved state for dirty detection
  const [saved, setSaved] = useState<BrandingData>(DEFAULT_BRANDING)

  // Subdomain state
  const [subdomains, setSubdomains] = useState<{ id: string; subdomain: string; status: string }[]>([])
  const [newSubdomain, setNewSubdomain] = useState('')
  const [addingSub, setAddingSub] = useState(false)

  useEffect(() => {
    fetchBranding()
    fetchSubdomains()
  }, [])

  async function fetchBranding() {
    try {
      const res = await fetch('/api/branding')
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      if (data) {
        setBrandName(data.brand_name || '')
        setLogoUrl(data.logo_url || null)
        setPrimaryColor(data.primary_color || '#4f46e5')
        setAccentColor(data.accent_color || '#7c3aed')
        setSaved({
          brand_name: data.brand_name || '',
          logo_url: data.logo_url || null,
          primary_color: data.primary_color || '#4f46e5',
          accent_color: data.accent_color || '#7c3aed',
        })
      }
    } catch {
      // No branding yet — use defaults
    } finally {
      setLoading(false)
    }
  }

  async function fetchSubdomains() {
    try {
      const res = await fetch('/api/subdomains')
      if (!res.ok) return
      const { data } = await res.json()
      if (data) setSubdomains(data)
    } catch { /* ignore */ }
  }

  async function handleAddSubdomain() {
    const cleaned = newSubdomain.toLowerCase().trim()
    if (!cleaned) return
    setAddingSub(true)
    try {
      const res = await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: cleaned }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setNewSubdomain('')
      toast({ title: 'Subdomain added', description: `${cleaned}.${platformDomain} is now active` })
      fetchSubdomains()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add subdomain'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    } finally {
      setAddingSub(false)
    }
  }

  async function handleRemoveSubdomain(id: string) {
    try {
      const res = await fetch(`/api/subdomains/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      toast({ title: 'Subdomain removed' })
      fetchSubdomains()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    }
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'getroa.com'
  const activeSubdomain = subdomains.find(s => s.status === 'active')

  const isDirty =
    brandName !== (saved.brand_name || '') ||
    logoUrl !== saved.logo_url ||
    primaryColor !== saved.primary_color ||
    accentColor !== saved.accent_color

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/branding/upload-logo', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setLogoUrl(json.url)
      toast({ title: 'Logo uploaded' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandName || null,
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          accent_color: accentColor,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSaved({ brand_name: brandName, logo_url: logoUrl, primary_color: primaryColor, accent_color: accentColor })
      toast({ title: 'Branding saved', description: 'Your public careers page has been updated.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast({ title: 'Save failed', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const displayName = brandName || 'Your Company'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Two-column: Controls + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Controls */}
        <div className="space-y-5">
          <div className="rounded-xl border bg-white p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Public Careers Page</h3>
              <p className="text-xs text-gray-500 mt-0.5">Customize how your careers page looks to candidates</p>
            </div>

            {/* Company Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Company Name</Label>
              <Input
                placeholder="e.g. Bacancy Services Pvt.Ltd"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <p className="text-[11px] text-gray-400">Displayed in the header and footer of your careers page</p>
            </div>

            {/* Logo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Company Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-cover border" />
                ) : (
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadLogo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {logoUrl ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-500 hover:text-red-600 ml-1"
                      onClick={() => setLogoUrl(null)}
                    >
                      Remove
                    </Button>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">PNG, JPG up to 2MB. Recommended: 200x200px</p>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-3">
              <Label className="text-xs font-medium">Brand Colors</Label>

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                      primaryColor === p.primary && accentColor === p.accent
                        ? 'border-gray-900 ring-1 ring-gray-900 bg-gray-50 font-medium'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => { setPrimaryColor(p.primary); setAccentColor(p.accent) }}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.accent})` }}
                    />
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom hex inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-500">Primary</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="text-xs font-mono uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-500">Accent</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="text-xs font-mono uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save branding */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !isDirty} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </Button>
            {!isDirty && !saving && (
              <span className="text-xs text-gray-400">No unsaved changes</span>
            )}
          </div>

          {/* Subdomain / URL */}
          <div className="rounded-xl border bg-white p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Careers Page URL
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Set up a subdomain so candidates can visit your careers page at <strong>yourcompany.{platformDomain}</strong>
              </p>
            </div>

            {/* Existing subdomains */}
            {subdomains.length > 0 && (
              <div className="space-y-2">
                {subdomains.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2">
                    <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-sm font-medium text-gray-800 flex-1">
                      {sub.subdomain}.{platformDomain}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sub.status}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        navigator.clipboard.writeText(`https://${sub.subdomain}.${platformDomain}`)
                        toast({ title: 'URL copied!' })
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                      onClick={() => handleRemoveSubdomain(sub.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new subdomain — only if none exists */}
            {subdomains.length === 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-0 rounded-lg border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <Input
                    placeholder="yourcompany"
                    value={newSubdomain}
                    onChange={(e) => setNewSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="border-0 focus-visible:ring-0 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubdomain()}
                  />
                  <span className="text-xs text-gray-400 pr-3 whitespace-nowrap">.{platformDomain}</span>
                </div>
                <Button
                  onClick={handleAddSubdomain}
                  disabled={addingSub || !newSubdomain.trim()}
                  size="sm"
                  className="shrink-0"
                >
                  {addingSub ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                </Button>
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              The old URL format (<code className="text-gray-500">/careers/org-slug</code>) still works as a fallback.
            </p>
          </div>
        </div>

        {/* RIGHT — Live Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Live Preview</h3>
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> How candidates see your page
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
            {/* Mini browser chrome */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <div className="flex-1 ml-2 bg-white rounded-md px-3 py-1 text-[10px] text-gray-400 truncate">
                {activeSubdomain ? `${activeSubdomain.subdomain}.${platformDomain}` : `yourcompany.${platformDomain}`}
              </div>
            </div>

            {/* Preview content (scaled down) */}
            <div className="bg-gray-50" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {/* Header */}
              <div
                className="text-white px-5 py-6"
                style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }}
              >
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover ring-2 ring-white/30" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold">
                      {displayName[0] || 'C'}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold leading-tight">{displayName}</h2>
                    <p className="text-white/60 text-[11px] mt-0.5">Join our team — explore open positions below</p>
                  </div>
                </div>
              </div>

              {/* Fake job cards */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-[10px] font-medium text-gray-400">3 open positions</p>

                {[
                  { title: 'Senior Frontend Engineer', dept: 'Engineering', location: 'Remote', type: 'Full-time' },
                  { title: 'Product Designer', dept: 'Design', location: 'Hybrid', type: 'Full-time' },
                  { title: 'Marketing Manager', dept: 'Marketing', location: 'On-site', type: 'Full-time' },
                ].map((job) => (
                  <div key={job.title} className="bg-white border rounded-lg p-3.5 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-xs font-semibold text-gray-900">{job.title}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span
                            className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                          >
                            <Briefcase className="w-2.5 h-2.5" />
                            {job.dept}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                            <MapPin className="w-2.5 h-2.5" />
                            {job.location}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5" />
                            {job.type}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer preview */}
              <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between">
                <p className="text-[9px] text-gray-400">
                  &copy; {new Date().getFullYear()} {displayName}. All Rights Reserved.
                </p>
                <p className="text-[9px] text-gray-300 italic">Powered by HireFlow</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
