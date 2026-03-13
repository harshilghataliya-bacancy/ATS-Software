'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { ensureDefaultBank, getBanks } from '@/lib/services/candidate-banks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Landmark, FolderOpen, Plus, Trash2, Users, ArrowRight } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>

export default function BanksPage() {
  const router = useRouter()
  const { organization, isLoading: userLoading } = useUser()
  const { canAccessBanks, isInterviewer } = useRole()

  const [banks, setBanks] = useState<AnyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (userLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Candidate Bank</h1>
          <p className="text-sm text-gray-400 mt-0.5">Organize candidates into talent pools for future hiring</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          Create Bank
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Banks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {banks.map((bank) => {
          const count = getBankCount(bank)
          return (
            <div
              key={bank.id}
              onClick={() => router.push(`/banks/${bank.id}`)}
              className={`relative bg-white rounded-xl border p-5 cursor-pointer transition-all duration-200 group hover:shadow-md ${
                bank.is_default
                  ? 'border-blue-200/80 hover:border-blue-300 ring-1 ring-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Delete button */}
              {!bank.is_default && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteBank(bank) }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  bank.is_default
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-200'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200/70'
                }`}>
                  {bank.is_default ? <Landmark className="w-[18px] h-[18px]" /> : <FolderOpen className="w-[18px] h-[18px]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[15px] text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {bank.name}
                    </h3>
                    {bank.is_default && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 uppercase tracking-wide">
                        Default
                      </span>
                    )}
                  </div>
                  {bank.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{bank.description}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">
                    {bank.is_default ? 'Auto-populated' : `${count} candidate${count === 1 ? '' : 's'}`}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          )
        })}
      </div>

      {banks.length === 0 && !loading && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <Landmark className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No candidate banks yet</p>
          <p className="text-xs text-gray-400 mt-1">Create your first bank to start organizing candidates</p>
          <Button onClick={() => setCreateOpen(true)} size="sm" variant="outline" className="mt-4 gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Create Bank
          </Button>
        </div>
      )}

      {/* Create Bank Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Candidate Bank</DialogTitle>
            <DialogDescription>Create a new talent pool to organize candidates</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Bank Name <span className="text-red-400">*</span></label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Python Developers, React Engineers"
                className="mt-1.5"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this bank"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              {creating ? 'Creating...' : 'Create Bank'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteBank} onOpenChange={(open) => !open && setDeleteBank(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteBank?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Candidates in this bank will be moved back to the Default Bank. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-500">
              {deleting ? 'Deleting...' : 'Delete Bank'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
