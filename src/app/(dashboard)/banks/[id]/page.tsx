'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import {
  getBankById,
  getDefaultBankCandidates,
  getBankCandidates,
  getBanks,
} from '@/lib/services/candidate-banks'
import { createCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES, ITEMS_PER_PAGE, ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Search, MapPin, ArrowRightLeft, X, ChevronLeft, ChevronRight,
  Landmark, FolderOpen, Users, UserPlus, Upload,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

const SOURCE_LABELS: Record<string, string> = {}
CANDIDATE_SOURCES.forEach((s) => { SOURCE_LABELS[s.value] = s.label })

export default function BankDetailPage() {
  const params = useParams()
  const router = useRouter()
  const bankId = params.id as string
  const { user, organization, isLoading: userLoading } = useUser()
  const { canAccessBanks, isInterviewer } = useRole()

  const [bank, setBank] = useState<AnyData | null>(null)
  const [candidates, setCandidates] = useState<AnyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)

  // Filters
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const searchTimeout = useRef<NodeJS.Timeout>()

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Move dialog
  const [moveOpen, setMoveOpen] = useState(false)
  const [targetBankId, setTargetBankId] = useState('')
  const [allBanks, setAllBanks] = useState<AnyData[]>([])
  const [moving, setMoving] = useState(false)

  // Remove dialog (for custom banks)
  const [removing, setRemoving] = useState(false)

  // Add candidate dialog
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  // New candidate form
  const [newCand, setNewCand] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    location: '', current_company: '', current_title: '',
    linkedin_url: '', portfolio_url: '', source: 'direct',
    source_details: '', notes: '', experience_years: '',
  })
  const [newTags, setNewTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(false)
  const [newError, setNewError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!userLoading && (isInterviewer || !canAccessBanks)) {
      router.replace('/dashboard')
    }
  }, [userLoading, isInterviewer, canAccessBanks, router])

  const loadBank = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: err } = await getBankById(supabase, bankId, organization.id)
    if (err) setError(err.message)
    else setBank(data)
  }, [organization, bankId])

  const loadCandidates = useCallback(async () => {
    if (!organization || !bank) return
    setLoading(true)
    const supabase = createClient()

    const filters = {
      search: search || undefined,
      source: sourceFilter || undefined,
      location: locationFilter || undefined,
      page,
    }

    if (bank.is_default) {
      const { data, error: err, count } = await getDefaultBankCandidates(supabase, organization.id, filters)
      if (err) setError(err.message)
      else {
        setCandidates(data || [])
        setTotalCount(count ?? 0)
      }
    } else {
      const { data, error: err, count } = await getBankCandidates(supabase, bankId, organization.id, filters)
      if (err) setError(err.message)
      else {
        setCandidates(data || [])
        setTotalCount(count ?? 0)
      }
    }
    setLoading(false)
  }, [organization, bank, bankId, search, sourceFilter, locationFilter, page])

  useEffect(() => {
    if (organization) loadBank()
  }, [organization, loadBank])

  useEffect(() => {
    if (bank) loadCandidates()
  }, [bank, loadCandidates])

  // Debounced search
  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
    }, 400)
  }

  // Load all banks for the move dialog
  async function openMoveDialog() {
    if (!organization) return
    const supabase = createClient()
    const { data } = await getBanks(supabase, organization.id)
    setAllBanks((data || []).filter((b: AnyData) => b.id !== bankId))
    setTargetBankId('')
    setMoveOpen(true)
  }

  async function handleMove() {
    if (!targetBankId || selected.size === 0) return
    setMoving(true)
    setError(null)
    try {
      const res = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move_candidates',
          fromBankId: bank?.is_default ? null : bankId,
          toBankId: targetBankId,
          candidateIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else {
        setMoveOpen(false)
        setSelected(new Set())
        await loadCandidates()
      }
    } catch {
      setError('Failed to move candidates')
    }
    setMoving(false)
  }

  async function handleRemoveFromBank() {
    if (selected.size === 0 || bank?.is_default) return
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_candidates',
          bankId,
          candidateIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else {
        setSelected(new Set())
        await loadCandidates()
      }
    } catch {
      setError('Failed to remove candidates')
    }
    setRemoving(false)
  }

  // New candidate form helpers
  function resetNewForm() {
    setNewCand({ first_name: '', last_name: '', email: '', phone: '', location: '', current_company: '', current_title: '', linkedin_url: '', portfolio_url: '', source: 'direct', source_details: '', notes: '', experience_years: '' })
    setNewTags([])
    setTagInput('')
    setResumeFile(null)
    setParsing(false)
    setParsed(false)
    setNewError(null)
  }

  async function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_RESUME_TYPES.includes(file.type)) { setNewError('Only PDF and Word documents are allowed'); return }
    if (file.size > MAX_FILE_SIZE) { setNewError('File size must be under 10MB'); return }
    setNewError(null)
    setResumeFile(file)

    if (file.type === 'application/pdf') {
      setParsing(true)
      setParsed(false)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/public/parse-resume', { method: 'POST', body: formData })
        if (res.ok) {
          const { data } = await res.json()
          if (data) {
            setNewCand((prev) => ({
              ...prev,
              first_name: data.first_name || prev.first_name,
              last_name: data.last_name || prev.last_name,
              email: data.email || prev.email,
              phone: data.phone || prev.phone,
              current_title: data.current_title || prev.current_title,
              current_company: data.current_company || prev.current_company,
              location: data.location || prev.location,
              linkedin_url: data.linkedin_url || prev.linkedin_url,
              experience_years: data.experience_years ? String(data.experience_years) : prev.experience_years,
            }))
            if (data.skills && Array.isArray(data.skills)) setNewTags(data.skills)
            setParsed(true)
          }
        }
      } catch { /* ignore */ } finally { setParsing(false) }
    }
  }

  async function handleCreateNewCandidate() {
    if (!organization || !user || !bank) return
    if (!newCand.first_name.trim() || !newCand.last_name.trim() || !newCand.email.trim()) {
      setNewError('First name, last name, and email are required')
      return
    }
    setAdding(true)
    setNewError(null)

    const supabase = createClient()

    // Check if candidate with this email already exists
    const { data: existing } = await supabase
      .from('candidates')
      .select('id, first_name, last_name')
      .eq('organization_id', organization.id)
      .eq('email', newCand.email.trim())
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      setNewError(`A candidate with this email already exists: ${existing.first_name} ${existing.last_name}`)
      setAdding(false)
      return
    }

    // Create candidate
    const payload: AnyData = {
      first_name: newCand.first_name.trim(),
      last_name: newCand.last_name.trim(),
      email: newCand.email.trim(),
      phone: newCand.phone.trim() || undefined,
      location: newCand.location.trim() || undefined,
      current_company: newCand.current_company.trim() || undefined,
      current_title: newCand.current_title.trim() || undefined,
      linkedin_url: newCand.linkedin_url.trim() || undefined,
      portfolio_url: newCand.portfolio_url.trim() || undefined,
      source: newCand.source,
      source_details: newCand.source_details.trim() || undefined,
      notes: newCand.notes.trim() || undefined,
      experience_years: newCand.experience_years ? parseFloat(newCand.experience_years) : undefined,
      tags: newTags.length > 0 ? newTags : undefined,
      gdpr_consent: true,
    }

    const { data: candidate, error: createErr } = await createCandidate(supabase, organization.id, payload, user.id)
    if (createErr) {
      setNewError(createErr.message)
      setAdding(false)
      return
    }

    // Upload resume
    if (candidate?.id && resumeFile) {
      const ext = resumeFile.name.split('.').pop()
      const path = `${organization.id}/${candidate.id}/resume.${ext}`
      const { error: upErr } = await supabase.storage.from('resumes').upload(path, resumeFile, { upsert: true })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(path)
        await supabase.from('candidates').update({ resume_url: publicUrl }).eq('id', candidate.id)
        fetch('/api/resumes/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id }),
        }).catch(() => {})
      }
    }

    // Add to bank (for custom banks)
    if (candidate?.id && !bank.is_default) {
      await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_candidates', bankId, candidateIds: [candidate.id] }),
      })
    }

    setAddOpen(false)
    resetNewForm()
    await loadCandidates()
    setAdding(false)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(candidates.map((c) => c.id)))
    }
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  if (userLoading || (!bank && loading)) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="text-center py-20">
        <Landmark className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 font-medium">Bank not found</p>
        <Link href="/banks" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Back to Banks</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/banks"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              bank.is_default
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {bank.is_default ? <Landmark className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-gray-900">{bank.name}</h1>
                {bank.is_default && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 uppercase tracking-wide">
                    Default
                  </span>
                )}
              </div>
              {bank.description && (
                <p className="text-xs text-gray-400 mt-0.5">{bank.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setAddOpen(true); resetNewForm() }} className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <UserPlus className="w-3.5 h-3.5" />
            Add Candidate
          </Button>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
            <Users className="w-3.5 h-3.5" />
            {totalCount} candidate{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {CANDIDATE_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Location"
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setPage(1) }}
            className="w-[150px] pl-8 h-9 text-sm"
          />
        </div>
        {(search || sourceFilter || locationFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSourceFilter(''); setLocationFilter(''); setPage(1) }} className="h-9 text-gray-400 hover:text-gray-600 gap-1">
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/60 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={openMoveDialog} className="h-8 border-blue-200 text-blue-700 hover:bg-blue-100 gap-1.5 text-xs">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Move to Bank
          </Button>
          {!bank.is_default && (
            <Button size="sm" variant="outline" onClick={handleRemoveFromBank} disabled={removing} className="h-8 border-red-200 text-red-600 hover:bg-red-50 text-xs">
              {removing ? 'Removing...' : 'Move to Default'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-8 text-gray-400 hover:text-gray-600 text-xs">
            Clear
          </Button>
        </div>
      )}

      {/* Candidates Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={candidates.length > 0 && selected.size === candidates.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Candidate</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Current Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Source</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Exp</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Applications</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Reason</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && candidates.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td>
                </tr>
              ))
            ) : candidates.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {search || sourceFilter || locationFilter ? 'No candidates match your filters' : 'No candidates in this bank'}
                  </p>
                </td>
              </tr>
            ) : (
              candidates.map((c) => {
                const apps = c.applications || []
                // Determine reason for being in the bank
                const hasRejected = apps.some((a: AnyData) => a.status === 'rejected')
                const hasJobClosed = apps.some((a: AnyData) => {
                  const js = a.job?.status
                  return js === 'closed' || js === 'archived'
                })
                const reasons: { label: string; color: string }[] = []
                if (hasRejected) reasons.push({ label: 'Rejected', color: 'bg-red-50 text-red-600' })
                if (hasJobClosed) reasons.push({ label: 'Job Closed', color: 'bg-amber-50 text-amber-600' })
                return (
                  <tr key={c.id} className={`hover:bg-gray-50/50 transition-colors ${selected.has(c.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/candidates/${c.id}`} className="group/link">
                        <p className="font-medium text-gray-900 group-hover/link:text-blue-600 transition-colors">{c.first_name} {c.last_name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{c.email}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.current_title ? (
                        <div>
                          <p className="truncate max-w-[180px] text-[13px]">{c.current_title}</p>
                          {c.current_company && <p className="text-[11px] text-gray-400 mt-0.5">{c.current_company}</p>}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-500">{c.location || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {SOURCE_LABELS[c.source] || c.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-500 tabular-nums">
                      {c.experience_years != null ? `${c.experience_years} yrs` : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {apps.length > 0 ? (
                        <div className="space-y-0.5">
                          {apps.slice(0, 2).map((a: AnyData) => {
                            const jobStatus = a.job?.status
                            const isJobClosed = jobStatus === 'closed' || jobStatus === 'archived'
                            return (
                              <p key={a.id} className="text-[11px] text-gray-500 truncate max-w-[200px]">
                                {a.job?.title || 'Unknown Job'}
                                <span className={`ml-1 text-[10px] px-1 py-0.5 rounded ${
                                  a.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                                  a.status === 'hired' ? 'bg-blue-50 text-blue-600' :
                                  a.status === 'rejected' ? 'bg-red-50 text-red-500' :
                                  'bg-gray-50 text-gray-400'
                                }`}>{a.status}</span>
                                {isJobClosed && (
                                  <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-600">{jobStatus}</span>
                                )}
                              </p>
                            )
                          })}
                          {apps.length > 2 && (
                            <p className="text-[10px] text-gray-300">+{apps.length - 2} more</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300">No applications</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span key={r.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${r.color}`}>
                            {r.label}
                          </span>
                        ))}
                        {reasons.length === 0 && <span className="text-gray-300 text-[11px]">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).slice(0, 3).map((tag: string) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{tag}</span>
                        ))}
                        {(c.tags || []).length > 3 && (
                          <span className="text-[10px] text-gray-300">+{c.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {Math.min((page - 1) * ITEMS_PER_PAGE + 1, totalCount)}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1} className="h-8 w-8 p-0">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-500 px-2 tabular-nums">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="h-8 w-8 p-0">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add Candidate Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetNewForm() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Candidate to {bank.name}</DialogTitle>
            <DialogDescription>Create a new candidate and add them to this bank</DialogDescription>
          </DialogHeader>

            <div className="space-y-5">
              {newError && <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded-md">{newError}</div>}

              {/* Resume Upload */}
              <div>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleResumeChange} className="hidden" />
                <div
                  className="flex flex-col items-center text-center p-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50 cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {parsing ? (
                    <div className="w-full space-y-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2 animate-pulse">
                        <Upload className="w-5 h-5 text-indigo-600" />
                      </div>
                      <p className="text-sm font-medium text-indigo-700">Parsing resume with AI...</p>
                      <Skeleton className="h-3 w-1/2 mx-auto" />
                    </div>
                  ) : resumeFile ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${parsed ? 'bg-green-100' : 'bg-blue-100'}`}>
                        {parsed ? (
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : (
                          <Upload className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900">{resumeFile.name}</p>
                        <p className="text-xs text-gray-500">{parsed ? 'Details auto-filled from resume' : 'Uploaded'}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                      <p className="text-sm font-semibold text-gray-700">Upload Resume to Auto-Fill</p>
                      <p className="text-xs text-gray-400">PDF, DOC, DOCX - up to 10MB</p>
                    </>
                  )}
                </div>
              </div>

              {/* Personal Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Personal Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First Name <span className="text-red-500">*</span></Label>
                    <Input value={newCand.first_name} onChange={(e) => setNewCand({ ...newCand, first_name: e.target.value })} placeholder="John" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name <span className="text-red-500">*</span></Label>
                    <Input value={newCand.last_name} onChange={(e) => setNewCand({ ...newCand, last_name: e.target.value })} placeholder="Doe" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-red-500">*</span></Label>
                    <Input type="email" value={newCand.email} onChange={(e) => setNewCand({ ...newCand, email: e.target.value })} placeholder="john@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input type="tel" value={newCand.phone} onChange={(e) => setNewCand({ ...newCand, phone: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input value={newCand.location} onChange={(e) => setNewCand({ ...newCand, location: e.target.value })} placeholder="Mumbai, India" />
                </div>
              </div>

              {/* Professional Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Professional Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Current Company</Label>
                    <Input value={newCand.current_company} onChange={(e) => setNewCand({ ...newCand, current_company: e.target.value })} placeholder="Acme Inc." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Current Title</Label>
                    <Input value={newCand.current_title} onChange={(e) => setNewCand({ ...newCand, current_title: e.target.value })} placeholder="Senior Engineer" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Experience (years)</Label>
                    <Input type="number" value={newCand.experience_years} onChange={(e) => setNewCand({ ...newCand, experience_years: e.target.value })} placeholder="5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>LinkedIn URL</Label>
                    <Input value={newCand.linkedin_url} onChange={(e) => setNewCand({ ...newCand, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Portfolio URL</Label>
                  <Input value={newCand.portfolio_url} onChange={(e) => setNewCand({ ...newCand, portfolio_url: e.target.value })} placeholder="https://..." />
                </div>
              </div>

              {/* Source & Tags */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Source & Tags</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Source</Label>
                    <Select value={newCand.source} onValueChange={(v) => setNewCand({ ...newCand, source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CANDIDATE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Source Details</Label>
                    <Input value={newCand.source_details} onChange={(e) => setNewCand({ ...newCand, source_details: e.target.value })} placeholder="Referred by..." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag (press Enter)"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim(); if (t && !newTags.includes(t)) { setNewTags([...newTags, t]); setTagInput('') } } }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => { const t = tagInput.trim(); if (t && !newTags.includes(t)) { setNewTags([...newTags, t]); setTagInput('') } }}>Add</Button>
                  </div>
                  {newTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {newTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setNewTags(newTags.filter((t) => t !== tag))}>
                          {tag} <span className="text-xs">&times;</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={newCand.notes} onChange={(e) => setNewCand({ ...newCand, notes: e.target.value })} placeholder="Any additional notes..." />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateNewCandidate} disabled={adding || parsing} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {adding ? 'Adding...' : 'Add Candidate'}
                </Button>
              </DialogFooter>
            </div>
        </DialogContent>
      </Dialog>

      {/* Move to Bank Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {selected.size} Candidate{selected.size !== 1 ? 's' : ''} to Bank</DialogTitle>
            <DialogDescription>Select a target bank to move the selected candidates</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-gray-700">Select Target Bank</label>
            <Select value={targetBankId} onValueChange={setTargetBankId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Choose a bank..." />
              </SelectTrigger>
              <SelectContent>
                {allBanks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} {b.is_default ? '(Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allBanks.length === 0 && (
              <p className="text-xs text-gray-400 mt-2">No other banks available. Create a custom bank first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button
              onClick={handleMove}
              disabled={moving || !targetBankId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {moving ? 'Moving...' : 'Move Candidates'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
