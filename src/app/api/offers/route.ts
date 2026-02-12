import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOffers, createOffer } from '@/lib/services/offers'
import { createOfferSchema } from '@/lib/validators/offer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)

  const { data, error, count } = await getOffers(supabase, membership.organization_id, {
    status,
    page,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createOfferSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    )
  }

  // Resolve candidate_id and job_id from the application
  const { data: application } = await supabase
    .from('applications')
    .select('candidate_id, job_id')
    .eq('id', parsed.data.application_id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const { data, error } = await createOffer(
    supabase,
    membership.organization_id,
    {
      application_id: parsed.data.application_id,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      salary: parsed.data.salary,
      salary_currency: parsed.data.salary_currency,
      start_date: parsed.data.start_date,
      expiry_date: parsed.data.expiry_date,
      template_html: parsed.data.template_html,
    },
    user.id
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
