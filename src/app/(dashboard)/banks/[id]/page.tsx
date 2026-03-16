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
import { CANDIDATE_SOURCES, ITEMS_PER_PAGE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Search, MapPin, ArrowRightLeft, X, ChevronLeft, ChevronRight,
  Landmark, FolderOpen, Users,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

const SOURCE_LABELS: Record<string, string> = {}
CANDIDATE_SOURCES.forEach((s) => { SOURCE_LABELS[s.value] = s.label })

export default function BankDetailPage() {
  const params = useParams()
  const router = useRouter()
  const bankId = params.id as string
  const { organization, isLoading: userLoading } = useUser()
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
        <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
          <Users className="w-3.5 h-3.5" />
          {totalCount} candidate{totalCount !== 1 ? 's' : ''}
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
