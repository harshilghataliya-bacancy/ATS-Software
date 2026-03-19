'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { ensureDefaultBank, getBanks } from '@/lib/services/candidate-banks'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Landmark, FolderOpen, Plus, Trash2, Users, ArrowRight, MoreHorizontal,
  Search, LayoutGrid, List, Eye,
} from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

type ViewMode = 'card' | 'table'

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

function relativeDate(d: string) {
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function BanksPage() {
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { canAccessBanks, isInterviewer, isAdmin } = useRole()

  const [banks, setBanks] = useState<AnyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('card')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete dialog
  const [deleteBank, setDeleteBank] = useState<AnyData | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!userLoading && (isInterviewer || !canAccessBanks)) {
      router.replace('/dashboard')
    }
  }, [userLoading, isInterviewer, canAccessBanks, router])

  const loadBanks = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    await ensureDefaultBank(supabase, organization.id)
    const { data, error: err } = await getBanks(supabase, organization.id)
    if (err) setError(err.message)
    else setBanks(data || [])
    setLoading(false)
  }, [organization])

  useEffect(() => {
    if (organization) loadBanks()
  }, [organization, loadBanks])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: newName.trim(), description: newDesc.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else {
        setCreateOpen(false)
        setNewName('')
        setNewDesc('')
        await loadBanks()
      }
    } catch {
      setError('Failed to create bank')
    }
    setCreating(false)
  }

  async function handleDelete() {
    if (!deleteBank) return
    setDeleting(true)
    try {
      const res = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', bankId: deleteBank.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
      } else {
        setDeleteBank(null)
        await loadBanks()
      }
    } catch {
      setError('Failed to delete bank')
    }
    setDeleting(false)
  }

  function getBankCount(bank: AnyData): number {
    const members = bank.candidate_bank_members
    if (Array.isArray(members) && members.length > 0 && members[0]?.count !== undefined) {
      return members[0].count
    }
    return 0
  }

  /* ── Filtered banks ── */
  const filteredBanks = banks.filter((bank) => {
    if (search) {
      const q = search.toLowerCase()
      const nameMatch = bank.name?.toLowerCase().includes(q)
      const descMatch = bank.description?.toLowerCase().includes(q)
      if (!nameMatch && !descMatch) return false
    }
    return true
  })

  const totalCandidates = banks.reduce((sum, b) => sum + getBankCount(b), 0)
  const customBanks = banks.filter((b) => !b.is_default).length

  /* ── Actions dropdown ── */
  function BankActions({ bank }: { bank: AnyData }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => router.push(`/banks/${bank.id}`)}>
            <Eye className="w-3.5 h-3.5 mr-2 text-gray-400" />
            <span className="text-[13px]">View Bank</span>
          </DropdownMenuItem>
          {!bank.is_default && isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDeleteBank(bank) }} className="text-rose-600">
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                <span className="text-[13px]">Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Candidate Banks</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Organize candidates into talent pools for future hiring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Bank
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2.5 rounded-lg text-[12px]">{error}</div>
      )}

      {/* ── Summary pills + search + view toggle ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200/60">
            {banks.length} bank{banks.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
            {totalCandidates} total candidate{totalCandidates !== 1 ? 's' : ''}
          </span>
          {customBanks > 0 && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 border border-violet-200/60">
              {customBanks} custom
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search banks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 pr-3 w-52 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
          />
        </div>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'card' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {filteredBanks.length === 0 && !loading ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <Landmark className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 font-medium">
            {search ? 'No banks match your search' : 'No candidate banks yet'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Create your first bank to start organizing candidates</p>
          {!search && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-4 flex items-center gap-1.5 mx-auto h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Bank
            </button>
          )}
        </div>
      ) : viewMode === 'card' ? (
        /* ── CARD VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBanks.map((bank) => {
            const count = getBankCount(bank)
            const grad = getGradient(bank.name || 'Bank')
            return (
              <div
                key={bank.id}
                onClick={() => router.push(`/banks/${bank.id}`)}
                className="group bg-white rounded-xl border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-200 transition-all duration-200"
              >
                <div className={`h-[2px] bg-gradient-to-r ${bank.is_default ? 'from-blue-500 to-indigo-600' : grad}`} />
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${bank.is_default ? 'from-blue-500 to-indigo-600' : grad} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                        {bank.is_default ? <Landmark className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[13px] font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                            {bank.name}
                          </h3>
                          {bank.is_default && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 uppercase tracking-wide">
                              Default
                            </span>
                          )}
                        </div>
                        {bank.description && (
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 leading-relaxed">{bank.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                      <BankActions bank={bank} />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Users className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-medium">
                        {bank.is_default ? 'Auto-populated' : `${count} candidate${count === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {bank.created_at && (
                        <span className="text-[10px] text-gray-300">{relativeDate(bank.created_at)}</span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100 hover:bg-transparent">
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Bank</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Candidates</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBanks.map((bank) => {
                const count = getBankCount(bank)
                const grad = getGradient(bank.name || 'Bank')
                return (
                  <TableRow
                    key={bank.id}
                    className="group cursor-pointer border-b border-gray-50 hover:bg-gray-50/50"
                    onClick={() => router.push(`/banks/${bank.id}`)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${bank.is_default ? 'from-blue-500 to-indigo-600' : grad} text-white flex items-center justify-center shrink-0`}>
                          {bank.is_default ? <Landmark className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[13px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{bank.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {bank.is_default ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 uppercase tracking-wide">Default</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200/60 uppercase tracking-wide">Custom</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <span className="text-[12px] tabular-nums text-gray-600 font-medium">
                        {bank.is_default ? '—' : count}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[11px] text-gray-400 line-clamp-1 max-w-[200px]">{bank.description || '—'}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-[11px] text-gray-400">{bank.created_at ? relativeDate(bank.created_at) : '—'}</span>
                    </TableCell>
                    <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                      <BankActions bank={bank} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Create Bank Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Create Candidate Bank</DialogTitle>
            <DialogDescription className="text-[12px]">Create a new talent pool to organize candidates</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[12px] font-medium text-gray-700">Bank Name <span className="text-rose-400">*</span></label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Python Developers, React Engineers"
                className="mt-1.5 text-[13px]"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">Description</label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this bank"
                className="mt-1.5 text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setCreateOpen(false)} className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={creating || !newName.trim()} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {creating ? 'Creating...' : 'Create Bank'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteBank} onOpenChange={(open) => !open && setDeleteBank(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Delete &quot;{deleteBank?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Candidates in this bank will be moved back to the Default Bank. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="text-[12px] bg-rose-600 hover:bg-rose-500">
              {deleting ? 'Deleting...' : 'Delete Bank'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
