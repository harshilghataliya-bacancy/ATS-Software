'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getCandidates, deleteCandidate } from '@/lib/services/candidates'
import { CANDIDATE_SOURCES } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  current_company?: string | null
  current_title?: string | null
  location?: string | null
  source: string
  tags?: string[] | null
  created_at: string
  applications?: { count: number }[]
}

export default function CandidatesPage() {
  const { organization, isLoading } = useUser()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!organization) return
    loadCandidates()
  }, [organization, sourceFilter])

  async function loadCandidates() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = {}
    if (sourceFilter !== 'all') filters.source = sourceFilter
    if (search) filters.search = search
    const { data, count } = await getCandidates(supabase, organization.id, filters)
    if (data) setCandidates(data as Candidate[])
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }

  async function handleSearch() {
    loadCandidates()
  }

  async function handleDelete(candidateId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteCandidate(supabase, candidateId, organization.id)
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId))
  }

  const sourceLabel = (val: string) =>
    CANDIDATE_SOURCES.find((s) => s.value === val)?.label ?? val

  function downloadCSV() {
    if (candidates.length === 0) return
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Source', 'Current Title', 'Current Company', 'Location', 'Tags', 'Created At']
    const rows = candidates.map((c) => [
      c.first_name,
      c.last_name,
      c.email,
      c.phone || '',
      sourceLabel(c.source),
      c.current_title || '',
      c.current_company || '',
      c.location || '',
      (c.tags ?? []).join('; '),
      new Date(c.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 mt-1">
            {total > 0 ? `${total} total candidates` : 'Manage your candidate pool'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadCSV} disabled={candidates.length === 0}>
            Download CSV
          </Button>
          <Link href="/candidates/new">
            <Button>+ Add Candidate</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search candidates by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {CANDIDATE_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Candidates List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No candidates found. Add your first candidate!</p>
            <Link href="/candidates/new">
              <Button>Add Candidate</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate) => {
            const initials = `${candidate.first_name?.[0] ?? ''}${candidate.last_name?.[0] ?? ''}`.toUpperCase()
            return (
              <Card key={candidate.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/candidates/${candidate.id}`}
                            className="text-base font-semibold text-gray-900 hover:text-blue-600"
                          >
                            {candidate.first_name} {candidate.last_name}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            {sourceLabel(candidate.source)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-0.5 text-sm text-gray-500">
                          <span>{candidate.email}</span>
                          {candidate.current_title && candidate.current_company && (
                            <span>{candidate.current_title} at {candidate.current_company}</span>
                          )}
                          {candidate.location && <span>{candidate.location}</span>}
                        </div>
                        {candidate.tags && candidate.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {candidate.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                            {candidate.tags.length > 4 && (
                              <span className="text-xs text-gray-400">+{candidate.tags.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/candidates/${candidate.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600">Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will soft-delete {candidate.first_name} {candidate.last_name}. Associated applications will remain.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(candidate.id)} className="bg-red-600 hover:bg-red-700">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
