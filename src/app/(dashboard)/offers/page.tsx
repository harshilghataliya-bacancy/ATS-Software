'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getOffers, deleteOffer } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG, ITEMS_PER_PAGE } from '@/lib/constants'
import { formatSalary } from '@/lib/offer-template'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Pagination } from '@/components/ui/pagination'
import { List, LayoutGrid, FileText, Briefcase, DollarSign, Calendar, Send } from 'lucide-react'

type ViewMode = 'list' | 'card'

interface OfferItem {
  id: string
  status: string
  salary: number
  salary_currency: string
  start_date: string | null
  expiry_date: string | null
  sent_at: string | null
  created_at: string
  application: {
    id: string
    candidate: { id: string; first_name: string; last_name: string; email: string } | null
    job: { id: string; title: string; department: string } | null
  } | null
}

const STATUS_BORDER: Record<string, string> = {
  accepted: 'border-l-emerald-500',
  declined:  'border-l-red-400',
  sent:      'border-l-blue-500',
  expired:   'border-l-gray-300',
  draft:     'border-l-amber-400',
}

const STATUS_COLOR: Record<string, string> = {
  accepted: 'bg-emerald-100 text-emerald-700',
  declined:  'bg-red-100 text-red-600',
  sent:      'bg-blue-100 text-blue-700',
  expired:   'bg-gray-100 text-gray-500',
  draft:     'bg-amber-100 text-amber-700',
}

const STATUS_TOP: Record<string, string> = {
  accepted: 'border-t-emerald-500',
  declined:  'border-t-red-400',
  sent:      'border-t-blue-500',
  expired:   'border-t-gray-300',
  draft:     'border-t-amber-400',
}

export default function OffersPage() {
  const { organization, isLoading } = useUser()
  const { canManageOffers } = useRole()
  const router = useRouter()

  const [offers, setOffers] = useState<OfferItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  useEffect(() => {
    if (!organization) return
    loadOffers()
  }, [organization, statusFilter, page])

  useEffect(() => { setPage(1) }, [statusFilter])

  async function loadOffers() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: Record<string, unknown> = { page }
    if (statusFilter !== 'all') filters.status = statusFilter
    const { data, count } = await getOffers(supabase, organization.id, filters)
    if (data) setOffers(data as OfferItem[])
    if (count !== undefined && count !== null) setTotal(count)
    setLoading(false)
  }

  async function handleDelete(offerId: string) {
    if (!organization) return
    const supabase = createClient()
    await deleteOffer(supabase, offerId, organization.id)
    setOffers((prev) => prev.filter((o) => o.id !== offerId))
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const filtered = search
    ? offers.filter((o) => {
        const name = `${o.application?.candidate?.first_name ?? ''} ${o.application?.candidate?.last_name ?? ''}`.toLowerCase()
        return name.includes(search.toLowerCase())
      })
    : offers

  function downloadCSV() {
    if (filtered.length === 0) return
    const headers = ['Candidate', 'Email', 'Job Title', 'Department', 'Status', 'Salary', 'Start Date', 'Expiry Date', 'Sent At', 'Created At']
    const rows = filtered.map((o) => [
      o.application?.candidate ? `${o.application.candidate.first_name} ${o.application.candidate.last_name}` : 'Unknown',
      o.application?.candidate?.email ?? '',
      o.application?.job?.title ?? '',
      o.application?.job?.department ?? '',
      o.status,
      formatSalary(o.salary, o.salary_currency),
      o.start_date ? new Date(o.start_date).toLocaleDateString() : '',
      o.expiry_date ? new Date(o.expiry_date).toLocaleDateString() : '',
      o.sent_at ? new Date(o.sent_at).toLocaleDateString() : '',
      new Date(o.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Offers</h1>
          <p className="text-sm text-gray-400 mt-0.5 font-medium">
            {total > 0 ? `${total} total offers` : 'Manage offer letters for candidates'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              title="Card view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={downloadCSV} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="Search by candidate name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-white border-gray-200"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        viewMode === 'list' ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-900 font-medium mb-1">{search ? 'No offers match your search' : 'No offers yet'}</p>
              <p className="text-gray-500 text-sm">{search ? 'Try a different search term.' : 'Create one from the applications page.'}</p>
            </div>
          </div>
        </div>

      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="space-y-3">
          {filtered.map((offer) => {
            const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
            const candidateName = offer.application?.candidate
              ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
              : 'Unknown'
            const initials = offer.application?.candidate
              ? `${offer.application.candidate.first_name?.[0] ?? ''}${offer.application.candidate.last_name?.[0] ?? ''}`.toUpperCase()
              : '??'

            return (
              <div
                key={offer.id}
                onClick={() => router.push(`/offers/${offer.id}?from=offers`)}
                className={`bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 ${STATUS_BORDER[offer.status] ?? 'border-l-gray-300'} hover:shadow-md transition-shadow cursor-pointer`}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-semibold text-gray-900">{candidateName}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[offer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {statusConfig?.label ?? offer.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 shrink-0" />
                            {offer.application?.job?.title ?? 'Unknown Position'}
                          </span>
                          {offer.application?.job?.department && (
                            <span>{offer.application.job.department}</span>
                          )}
                          <span className="font-medium text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                          {offer.start_date && <span>Start: {new Date(offer.start_date).toLocaleDateString()}</span>}
                          {offer.sent_at && <span>Sent: {new Date(offer.sent_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    {canManageOffers && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600">Delete</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete offer?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the offer for {candidateName}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(offer.id)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>

      ) : (
        /* ── CARD VIEW ── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((offer) => {
              const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
              const candidateName = offer.application?.candidate
                ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
                : 'Unknown'
              const initials = offer.application?.candidate
                ? `${offer.application.candidate.first_name?.[0] ?? ''}${offer.application.candidate.last_name?.[0] ?? ''}`.toUpperCase()
                : '??'

              return (
                <div
                  key={offer.id}
                  onClick={() => router.push(`/offers/${offer.id}?from=offers`)}
                  className={`group bg-white rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-t-4 ${STATUS_TOP[offer.status] ?? 'border-t-gray-300'}`}
                >
                  <div className="p-5 space-y-3">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-gray-900 group-hover:text-blue-700 transition-colors leading-tight">
                            {candidateName}
                          </p>
                          {offer.application?.candidate?.email && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{offer.application.candidate.email}</p>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[offer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusConfig?.label ?? offer.status}
                      </span>
                    </div>

                    {/* Job */}
                    {offer.application?.job && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
                        <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="font-medium truncate">{offer.application.job.title}</span>
                        <span className="text-gray-400 shrink-0">· {offer.application.job.department}</span>
                      </div>
                    )}

                    {/* Salary + dates */}
                    <div className="space-y-1 text-[12px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="font-semibold text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                      </div>
                      {offer.start_date && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>Start: {new Date(offer.start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {offer.sent_at && (
                        <div className="flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>Sent: {new Date(offer.sent_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {canManageOffers && (
                      <div className="pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 px-2">Delete</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete offer?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the offer for {candidateName}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(offer.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
