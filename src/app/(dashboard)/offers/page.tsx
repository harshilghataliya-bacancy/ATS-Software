'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getOffers, deleteOffer } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG, ITEMS_PER_PAGE } from '@/lib/constants'
import { formatSalary } from '@/lib/offer-template'
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
import { Pagination } from '@/components/ui/pagination'

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

export default function OffersPage() {
  const { organization, isLoading } = useUser()
  const [offers, setOffers] = useState<OfferItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!organization) return
    loadOffers()
  }, [organization, statusFilter, page])

  // Reset page when filter changes
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

  // Client-side search filter on candidate name
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <p className="text-gray-500 mt-1">{total > 0 ? `${total} total offers` : 'Manage offer letters for candidates'}</p>
        </div>
        <Button variant="outline" onClick={downloadCSV} disabled={filtered.length === 0}>
          Download CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search by candidate name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
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

      {/* Offers List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-gray-900 font-medium mb-1">{search ? 'No offers match your search' : 'No offers yet'}</p>
              <p className="text-gray-500 text-sm">{search ? 'Try a different search term.' : 'Create one from the applications page.'}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((offer) => {
            const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
            const candidateName = offer.application?.candidate
              ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
              : 'Unknown'
            const initials = offer.application?.candidate
              ? `${offer.application.candidate.first_name?.[0] ?? ''}${offer.application.candidate.last_name?.[0] ?? ''}`.toUpperCase()
              : '??'
            const statusBorder = offer.status === 'accepted' ? 'border-l-emerald-500' : offer.status === 'declined' ? 'border-l-red-400' : offer.status === 'sent' ? 'border-l-blue-500' : offer.status === 'expired' ? 'border-l-gray-300' : 'border-l-amber-400'

            return (
              <Card key={offer.id} className={`border-l-4 ${statusBorder} hover:shadow-md transition-shadow`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <Link href={`/offers/${offer.id}`} className="text-base font-semibold text-gray-900 hover:text-blue-600">
                            {candidateName}
                          </Link>
                          <Badge variant={statusConfig?.variant ?? 'secondary'}>
                            {statusConfig?.label ?? offer.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            {offer.application?.job?.title ?? 'Unknown Position'}
                          </span>
                          {offer.application?.job?.department && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                              {offer.application.job.department}
                            </span>
                          )}
                          <span className="font-medium text-gray-700">{formatSalary(offer.salary, offer.salary_currency)}</span>
                          {offer.start_date && (
                            <span>Start: {new Date(offer.start_date).toLocaleDateString()}</span>
                          )}
                          {offer.sent_at && (
                            <span>Sent: {new Date(offer.sent_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/offers/${offer.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
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
                  </div>
                </CardContent>
              </Card>
            )
          })}
          <Pagination page={page} totalPages={Math.ceil(total / ITEMS_PER_PAGE)} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
