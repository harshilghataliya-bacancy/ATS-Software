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

function IconList({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="5" y1="3.5" x2="13.5" y2="3.5" />
      <line x1="5" y1="7.5" x2="13.5" y2="7.5" />
      <line x1="5" y1="11.5" x2="13.5" y2="11.5" />
      <circle cx="2" cy="3.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="7.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
      <circle cx="2" cy="11.5" r="0.8" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

function IconGrid({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" />
    </svg>
  )
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
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">Offers</h1>
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
              <IconList active={viewMode === 'list'} />
            </button>
            <button
              onClick={() => setViewMode('card')}
              title="Card view"
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <IconGrid active={viewMode === 'card'} />
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
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
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
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
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
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        <span className="font-medium truncate">{offer.application.job.title}</span>
                        <span className="text-gray-400 shrink-0">· {offer.application.job.department}</span>
                      </div>
                    )}

                    {/* Salary + dates */}
                    <div className="space-y-1 text-[12px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="font-semibold text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                      </div>
                      {offer.start_date && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                          <span>Start: {new Date(offer.start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {offer.sent_at && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
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
