'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getOffers, deleteOffer } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG, ITEMS_PER_PAGE } from '@/lib/constants'
import { formatSalary } from '@/lib/offer-template'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import {
  List, LayoutGrid, FileText, Briefcase, DollarSign, Calendar,
  Send, Download, MoreHorizontal, Eye, Trash2, Filter, Search,
} from 'lucide-react'

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

/* ── Status styling ── */
const STATUS_DOT: Record<string, string> = {
  accepted: 'bg-emerald-500',
  declined: 'bg-rose-400',
  sent:     'bg-blue-500',
  expired:  'bg-gray-300',
  draft:    'bg-amber-400',
  revoked:  'bg-orange-400',
}

const STATUS_PILL: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-50 text-rose-600 border-rose-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  expired:  'bg-gray-50 text-gray-500 border-gray-200',
  draft:    'bg-amber-50 text-amber-700 border-amber-200',
  revoked:  'bg-orange-50 text-orange-600 border-orange-200',
}

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  sent:     'Sent',
  expired:  'Expired',
  draft:    'Draft',
  revoked:  'Revoked',
}

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

export default function OffersPage() {
  const { organization, isLoading } = useUser()
  const { role } = useRole()
  const router = useRouter()

  const [offers, setOffers] = useState<OfferItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [showFilters, setShowFilters] = useState(false)

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
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
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
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (search ? 1 : 0)

  // Status summary counts
  const statusCounts = offers.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {})

  function expiryInfo(dateStr: string | null): { text: string; urgent: boolean } | null {
    if (!dateStr) return null
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
    if (diff < 0) return { text: 'Expired', urgent: true }
    if (diff === 0) return { text: 'Expires today', urgent: true }
    if (diff <= 3) return { text: `${diff}d left`, urgent: true }
    if (diff <= 7) return { text: `${diff}d left`, urgent: false }
    return { text: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false }
  }

  /* ── Dropdown actions ── */
  function OfferActions({ offer }: { offer: OfferItem }) {
    const candidateName = offer.application?.candidate
      ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
      : 'Unknown'

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => router.push(`/offers/${offer.id}?from=offers`)}>
            <Eye className="w-3.5 h-3.5 mr-2 text-gray-400" />
            <span className="text-[13px]">View Details</span>
          </DropdownMenuItem>
          {role === 'admin' && offer.status === 'draft' && (
            <>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-rose-600">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    <span className="text-[13px]">Delete</span>
                  </DropdownMenuItem>
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
                    <AlertDialogAction onClick={() => handleDelete(offer.id)} className="bg-rose-600 hover:bg-rose-700">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Offers</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {total > 0 ? `${total} offer${total !== 1 ? 's' : ''}` : 'Manage offer letters'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — dark active state */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'card'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center w-8 h-7 rounded-md transition-all duration-150 ${
                viewMode === 'list'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                showFilters ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
              }`}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Export */}
          <button
            onClick={downloadCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ── Status summary pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(STATUS_LABEL).map(([key, label]) => {
          const count = statusCounts[key] || 0
          const isActive = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(isActive ? 'all' : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                isActive
                  ? STATUS_PILL[key]
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[key]}`} />
              {label}
              {count > 0 && <span className="text-[10px] opacity-70">{count}</span>}
            </button>
          )
        })}
        {statusFilter !== 'all' && (
          <button
            onClick={() => setStatusFilter('all')}
            className="text-[11px] text-gray-400 hover:text-gray-600 ml-1 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Collapsible Filters ── */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1 flex-1 max-w-xs">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  placeholder="Search by candidate name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-[12px] bg-white border-gray-200"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-[12px]">
                  <SelectValue placeholder="All Status" />
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
            {(search || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all') }}
                className="self-end text-[11px] text-gray-400 hover:text-gray-600 pb-2 transition-colors"
              >
                Reset all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-[13px] font-medium text-gray-500">{search ? 'No offers match your search' : 'No offers yet'}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{search ? 'Try a different search term.' : 'Create one from the applications page.'}</p>
          </div>
        </div>

      ) : viewMode === 'card' ? (
        /* ── CARD VIEW ── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((offer) => {
              const candidateName = offer.application?.candidate
                ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
                : 'Unknown'
              const initials = offer.application?.candidate
                ? `${offer.application.candidate.first_name?.[0] ?? ''}${offer.application.candidate.last_name?.[0] ?? ''}`.toUpperCase()
                : '??'
              const job = offer.application?.job
              const expiry = offer.status === 'sent' ? expiryInfo(offer.expiry_date) : null
              const statusLabel = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]?.label ?? offer.status

              return (
                <div
                  key={offer.id}
                  onClick={() => router.push(`/offers/${offer.id}?from=offers`)}
                  className="group bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
                >
                  {/* Top accent line */}
                  <div className={`h-[2px] ${STATUS_DOT[offer.status] ?? 'bg-gray-200'}`} />

                  <div className="p-4 space-y-3">
                    {/* Header: Avatar + Name + Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                          <span className="text-[11px] font-semibold text-white">{initials}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {candidateName}
                          </p>
                          {offer.application?.candidate?.email && (
                            <p className="text-[11px] text-gray-400 truncate">{offer.application.candidate.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[offer.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[offer.status] ?? 'bg-gray-300'}`} />
                          {statusLabel}
                        </span>
                        <OfferActions offer={offer} />
                      </div>
                    </div>

                    {/* Job */}
                    {job && (
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
                        <Briefcase className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <span className="truncate">{job.title}</span>
                        {job.department && <span className="text-gray-300">·</span>}
                        {job.department && <span className="text-gray-400">{job.department}</span>}
                      </div>
                    )}

                    {/* Salary + Dates */}
                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-gray-300" />
                        <span className="font-semibold text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                      </span>
                      {offer.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-300" />
                          {new Date(offer.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        {offer.sent_at && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Send className="w-3 h-3" />
                            Sent {new Date(offer.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {!offer.sent_at && offer.status === 'draft' && (
                          <span className="text-[10px] text-gray-300">Not sent yet</span>
                        )}
                      </div>
                      {expiry && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          expiry.urgent ? 'bg-rose-50 text-rose-600' : 'text-gray-400'
                        }`}>
                          {expiry.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>

      ) : (
        /* ── TABLE VIEW ── */
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-50 hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pl-4">Candidate</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Position</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Salary</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Start Date</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3">Sent</TableHead>
                  <TableHead className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pr-4 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((offer) => {
                  const candidateName = offer.application?.candidate
                    ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
                    : 'Unknown'
                  const initials = offer.application?.candidate
                    ? `${offer.application.candidate.first_name?.[0] ?? ''}${offer.application.candidate.last_name?.[0] ?? ''}`.toUpperCase()
                    : '??'
                  const job = offer.application?.job
                  const statusLabel = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]?.label ?? offer.status
                  const expiry = offer.status === 'sent' ? expiryInfo(offer.expiry_date) : null

                  return (
                    <TableRow
                      key={offer.id}
                      onClick={() => router.push(`/offers/${offer.id}?from=offers`)}
                      className="group cursor-pointer border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Candidate */}
                      <TableCell className="py-3 pl-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getGradient(candidateName)} flex items-center justify-center shrink-0`}>
                            <span className="text-[10px] font-semibold text-white">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                              {candidateName}
                            </p>
                            {offer.application?.candidate?.email && (
                              <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{offer.application.candidate.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Position */}
                      <TableCell className="py-3">
                        <div className="min-w-0">
                          <p className="text-[12px] text-gray-700 truncate max-w-[160px]">{job?.title ?? 'Unknown'}</p>
                          {job?.department && (
                            <p className="text-[11px] text-gray-400">{job.department}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Salary */}
                      <TableCell className="py-3">
                        <span className="text-[12px] font-semibold text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_PILL[offer.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[offer.status] ?? 'bg-gray-300'}`} />
                            {statusLabel}
                          </span>
                          {expiry?.urgent && (
                            <span className="text-[10px] text-rose-500 font-medium">{expiry.text}</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Start Date */}
                      <TableCell className="py-3">
                        <span className="text-[12px] text-gray-600">
                          {offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </span>
                      </TableCell>

                      {/* Sent */}
                      <TableCell className="py-3">
                        <span className="text-[11px] text-gray-400">
                          {offer.sent_at ? new Date(offer.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                        <OfferActions offer={offer} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
