'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getOffers, deleteOffer } from '@/lib/services/offers'
import { OFFER_STATUS_CONFIG } from '@/lib/constants'
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

  useEffect(() => {
    if (!organization) return
    loadOffers()
  }, [organization, statusFilter])

  async function loadOffers() {
    if (!organization) return
    setLoading(true)
    const supabase = createClient()
    const filters: { status?: string } = {}
    if (statusFilter !== 'all') filters.status = statusFilter
    const { data } = await getOffers(supabase, organization.id, filters)
    if (data) setOffers(data as OfferItem[])
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <p className="text-gray-500 mt-1">Manage offer letters for candidates</p>
        </div>
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">
              {search ? 'No offers match your search.' : 'No offers yet. Create one from a candidate\'s detail page.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((offer) => {
            const statusConfig = OFFER_STATUS_CONFIG[offer.status as keyof typeof OFFER_STATUS_CONFIG]
            const candidateName = offer.application?.candidate
              ? `${offer.application.candidate.first_name} ${offer.application.candidate.last_name}`
              : 'Unknown'

            return (
              <Card key={offer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Link href={`/offers/${offer.id}`} className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                          {candidateName}
                        </Link>
                        <Badge variant={statusConfig?.variant ?? 'secondary'}>
                          {statusConfig?.label ?? offer.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                        <span>{offer.application?.job?.title ?? 'Unknown Position'}</span>
                        {offer.application?.job?.department && (
                          <span>{offer.application.job.department}</span>
                        )}
                        <span>{formatSalary(offer.salary, offer.salary_currency)}</span>
                        {offer.start_date && (
                          <span>Start: {new Date(offer.start_date).toLocaleDateString()}</span>
                        )}
                        {offer.sent_at && (
                          <span>Sent: {new Date(offer.sent_at).toLocaleDateString()}</span>
                        )}
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
        </div>
      )}
    </div>
  )
}
