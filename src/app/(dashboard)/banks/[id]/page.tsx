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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Search, MapPin, ArrowRightLeft, X, ChevronLeft, ChevronRight,
  Landmark, FolderOpen, Users, UserPlus, Upload, MoreHorizontal, Eye, Filter,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

const SOURCE_LABELS: Record<string, string> = {}
CANDIDATE_SOURCES.forEach((s) => { SOURCE_LABELS[s.value] = s.label })

/* ── Gradient avatars ── */
const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
]

function getGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

/* ── Status helpers ── */
const APP_STATUS_DOT: Record<string, string> = {
  active:   'bg-emerald-500',
  hired:    'bg-blue-500',
  rejected: 'bg-rose-400',
  withdrawn:'bg-amber-400',
}

const REASON_PILL: Record<string, string> = {
  Rejected:   'bg-rose-50 text-rose-600 border-rose-200',
  'Job Closed':'bg-amber-50 text-amber-600 border-amber-200',
}

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
  const [showFilters, setShowFilters] = useState(false)
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
  const activeFilterCount = [sourceFilter, locationFilter].filter(Boolean).length

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
        <Landmark className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-[13px] text-gray-500 font-medium">Bank not found</p>
        <Link href="/banks" className="text-[12px] text-blue-600 hover:underline mt-2 inline-block">Back to Banks</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/banks"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br ${
              bank.is_default
                ? 'from-blue-500 to-indigo-600'
                : getGradient(bank.name || 'Bank')
            } text-white shadow-sm`}>
              {bank.is_default ? <Landmark className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-gray-900">{bank.name}</h1>
                {bank.is_default && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 uppercase tracking-wide">
                    Default
                  </span>
                )}
              </div>
              {bank.description && (
                <p className="text-[11px] text-gray-400 mt-0.5">{bank.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAddOpen(true); resetNewForm() }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Candidate
          </button>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
            <Users className="w-3.5 h-3.5" />
            {totalCount} candidate{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2.5 rounded-lg text-[12px]">{error}</div>
      )}

      {/* ── Search + Filters ── */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 w-full pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${showFilters ? 'bg-white/20 text-white' : 'bg-gray-900 text-white'}`}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {(search || sourceFilter || locationFilter) && (
          <button
            onClick={() => { setSearch(''); setSourceFilter(''); setLocationFilter(''); setPage(1) }}
            className="flex items-center gap-1 h-8 px-2 rounded-lg text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* ── Collapsible filters ── */}
      {showFilters && (
        <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Source</label>
              <Select value={sourceFilter || 'all'} onValueChange={(v) => { setSourceFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px] h-8 text-[12px]">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {CANDIDATE_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Location</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by location"
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); setPage(1) }}
                  className="h-8 w-[160px] pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Actions Bar ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-2.5">
          <span className="text-[12px] font-medium text-white">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <button onClick={openMoveDialog} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 transition-colors">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Move to Bank
          </button>
          {!bank.is_default && (
            <button onClick={handleRemoveFromBank} disabled={removing} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-rose-500/20 text-rose-300 text-[11px] font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50">
              {removing ? 'Removing...' : 'Move to Default'}
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Candidates Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100 hover:bg-transparent">
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  checked={candidates.length > 0 && selected.size === candidates.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Candidate</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Current Role</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Source</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Exp</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Applications</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</TableHead>
              <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tags</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && candidates.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={10} className="px-4 py-3"><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : candidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="px-4 py-16 text-center">
                  <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-[13px] text-gray-400">
                    {search || sourceFilter || locationFilter ? 'No candidates match your filters' : 'No candidates in this bank'}
                  </p>
                  <p className="text-[11px] text-gray-300 mt-1">Add candidates to start building this talent pool</p>
                </TableCell>
              </TableRow>
            ) : (
              candidates.map((c) => {
                const apps = c.applications || []
                const hasRejected = apps.some((a: AnyData) => a.status === 'rejected')
                const hasJobClosed = apps.some((a: AnyData) => {
                  const js = a.job?.status
                  return js === 'closed' || js === 'archived'
                })
                const reasons: { label: string; color: string }[] = []
                if (hasRejected) reasons.push({ label: 'Rejected', color: REASON_PILL['Rejected'] })
                if (hasJobClosed) reasons.push({ label: 'Job Closed', color: REASON_PILL['Job Closed'] })

                const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim()
                const grad = getGradient(fullName || c.email || 'U')
                const initials = `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase()

                return (
                  <TableRow key={c.id} className={`group border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${selected.has(c.id) ? 'bg-blue-50/30' : ''}`}>
                    <TableCell className="pl-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <Link href={`/candidates/${c.id}`} className="flex items-center gap-2.5 group/link">
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                          {initials}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium text-gray-900 group-hover/link:text-blue-600 transition-colors">{fullName}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{c.email}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="py-3">
                      {c.current_title ? (
                        <div>
                          <p className="text-[12px] text-gray-700 truncate max-w-[180px]">{c.current_title}</p>
                          {c.current_company && <p className="text-[10px] text-gray-400 mt-0.5">{c.current_company}</p>}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      {c.location ? (
                        <span className="text-[12px] text-gray-500">{c.location}</span>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200/60">
                        {SOURCE_LABELS[c.source] || c.source}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-[12px] text-gray-500 tabular-nums">
                      {c.experience_years != null ? `${c.experience_years} yrs` : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      {apps.length > 0 ? (
                        <div className="space-y-1">
                          {apps.slice(0, 2).map((a: AnyData) => {
                            const jobStatus = a.job?.status
                            const isJobClosed = jobStatus === 'closed' || jobStatus === 'archived'
                            return (
                              <div key={a.id} className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${APP_STATUS_DOT[a.status] ?? 'bg-gray-300'}`} />
                                <span className="text-[11px] text-gray-500 truncate max-w-[140px]">{a.job?.title || 'Unknown'}</span>
                                {isJobClosed && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200/60">{jobStatus}</span>
                                )}
                              </div>
                            )
                          })}
                          {apps.length > 2 && (
                            <p className="text-[10px] text-gray-300">+{apps.length - 2} more</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span key={r.label} className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${r.color}`}>
                            {r.label}
                          </span>
                        ))}
                        {reasons.length === 0 && <span className="text-gray-300 text-[11px]">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).slice(0, 3).map((tag: string) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200/60">{tag}</span>
                        ))}
                        {(c.tags || []).length > 3 && (
                          <span className="text-[9px] text-gray-300">+{c.tags.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => router.push(`/candidates/${c.id}`)}>
                            <Eye className="w-3.5 h-3.5 mr-2 text-gray-400" />
                            <span className="text-[13px]">View Profile</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ── */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            Showing {Math.min((page - 1) * ITEMS_PER_PAGE + 1, totalCount)}–{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-gray-500 px-2 tabular-nums">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Add Candidate Dialog ── */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetNewForm() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add Candidate to {bank.name}</DialogTitle>
            <DialogDescription className="text-[12px]">Create a new candidate and add them to this bank</DialogDescription>
          </DialogHeader>

            <div className="space-y-5">
              {newError && <div className="bg-rose-50 text-rose-700 text-[12px] p-2.5 rounded-lg border border-rose-200">{newError}</div>}

              {/* Resume Upload */}
              <div>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleResumeChange} className="hidden" />
                <div
                  className="flex flex-col items-center text-center p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {parsing ? (
                    <div className="w-full space-y-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2 animate-pulse">
                        <Upload className="w-5 h-5 text-indigo-600" />
                      </div>
                      <p className="text-[12px] font-medium text-indigo-700">Parsing resume with AI...</p>
                      <Skeleton className="h-3 w-1/2 mx-auto" />
                    </div>
                  ) : resumeFile ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${parsed ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                        {parsed ? (
                          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : (
                          <Upload className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-[12px] font-semibold text-gray-900">{resumeFile.name}</p>
                        <p className="text-[11px] text-gray-500">{parsed ? 'Details auto-filled from resume' : 'Uploaded'}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-[12px] font-semibold text-gray-700">Upload Resume to Auto-Fill</p>
                      <p className="text-[10px] text-gray-400">PDF, DOC, DOCX — up to 10MB</p>
                    </>
                  )}
                </div>
              </div>

              {/* Personal Info */}
              <div className="space-y-3">
                <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">Personal Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">First Name <span className="text-rose-500">*</span></Label>
                    <Input value={newCand.first_name} onChange={(e) => setNewCand({ ...newCand, first_name: e.target.value })} placeholder="John" className="text-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Last Name <span className="text-rose-500">*</span></Label>
                    <Input value={newCand.last_name} onChange={(e) => setNewCand({ ...newCand, last_name: e.target.value })} placeholder="Doe" className="text-[12px]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Email <span className="text-rose-500">*</span></Label>
                    <Input type="email" value={newCand.email} onChange={(e) => setNewCand({ ...newCand, email: e.target.value })} placeholder="john@example.com" className="text-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Phone</Label>
                    <Input type="tel" value={newCand.phone} onChange={(e) => setNewCand({ ...newCand, phone: e.target.value })} placeholder="+91 98765 43210" className="text-[12px]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Location</Label>
                  <Input value={newCand.location} onChange={(e) => setNewCand({ ...newCand, location: e.target.value })} placeholder="Mumbai, India" className="text-[12px]" />
                </div>
              </div>

              {/* Professional Info */}
              <div className="space-y-3">
                <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">Professional Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Current Company</Label>
                    <Input value={newCand.current_company} onChange={(e) => setNewCand({ ...newCand, current_company: e.target.value })} placeholder="Acme Inc." className="text-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Current Title</Label>
                    <Input value={newCand.current_title} onChange={(e) => setNewCand({ ...newCand, current_title: e.target.value })} placeholder="Senior Engineer" className="text-[12px]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Experience (years)</Label>
                    <Input type="number" value={newCand.experience_years} onChange={(e) => setNewCand({ ...newCand, experience_years: e.target.value })} placeholder="5" className="text-[12px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">LinkedIn URL</Label>
                    <Input value={newCand.linkedin_url} onChange={(e) => setNewCand({ ...newCand, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." className="text-[12px]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Portfolio URL</Label>
                  <Input value={newCand.portfolio_url} onChange={(e) => setNewCand({ ...newCand, portfolio_url: e.target.value })} placeholder="https://..." className="text-[12px]" />
                </div>
              </div>

              {/* Source & Tags */}
              <div className="space-y-3">
                <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider">Source & Tags</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Source</Label>
                    <Select value={newCand.source} onValueChange={(v) => setNewCand({ ...newCand, source: v })}>
                      <SelectTrigger className="text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CANDIDATE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Source Details</Label>
                    <Input value={newCand.source_details} onChange={(e) => setNewCand({ ...newCand, source_details: e.target.value })} placeholder="Referred by..." className="text-[12px]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag (press Enter)"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim(); if (t && !newTags.includes(t)) { setNewTags([...newTags, t]); setTagInput('') } } }}
                      className="text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() => { const t = tagInput.trim(); if (t && !newTags.includes(t)) { setNewTags([...newTags, t]); setTagInput('') } }}
                      className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {newTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {newTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200/60 cursor-pointer hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                          onClick={() => setNewTags(newTags.filter((t) => t !== tag))}
                        >
                          {tag} &times;
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Notes</Label>
                  <Textarea rows={2} value={newCand.notes} onChange={(e) => setNewCand({ ...newCand, notes: e.target.value })} placeholder="Any additional notes..." className="text-[12px]" />
                </div>
              </div>

              <DialogFooter>
                <button onClick={() => setAddOpen(false)} className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleCreateNewCandidate} disabled={adding || parsing} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {adding ? 'Adding...' : 'Add Candidate'}
                </button>
              </DialogFooter>
            </div>
        </DialogContent>
      </Dialog>

      {/* ── Move to Bank Dialog ── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Move {selected.size} Candidate{selected.size !== 1 ? 's' : ''} to Bank</DialogTitle>
            <DialogDescription className="text-[12px]">Select a target bank to move the selected candidates</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-[12px] font-medium text-gray-700">Select Target Bank</label>
            <Select value={targetBankId} onValueChange={setTargetBankId}>
              <SelectTrigger className="mt-1.5 text-[12px]">
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
              <p className="text-[11px] text-gray-400 mt-2">No other banks available. Create a custom bank first.</p>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setMoveOpen(false)} className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={handleMove}
              disabled={moving || !targetBankId}
              className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {moving ? 'Moving...' : 'Move Candidates'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
