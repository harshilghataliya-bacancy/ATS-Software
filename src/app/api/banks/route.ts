import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getBanks,
  createBank,
  ensureDefaultBank,
  addCandidatesToBank,
  removeCandidatesFromBank,
  moveCandidatesToBank,
  deleteBank,
  addCandidateToDefaultBank,
  isCandidateInDefaultBank,
} from '@/lib/services/candidate-banks'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!['admin', 'recruiter', 'hiring_manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const orgId = membership.organization_id

  // Ensure default bank exists
  await ensureDefaultBank(supabase, orgId)

  const { data, error } = await getBanks(supabase, orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!['admin', 'recruiter', 'hiring_manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json()
  const { action } = body

  const orgId = membership.organization_id

  // Create a new bank
  if (action === 'create') {
    const { name, description } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
    }
    const { data, error } = await createBank(supabase, orgId, name.trim(), description || null, user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Delete a bank
  if (action === 'delete') {
    const { bankId } = body
    if (!bankId) return NextResponse.json({ error: 'bankId is required' }, { status: 400 })
    const { error } = await deleteBank(supabase, bankId, orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Add candidates to a bank
  if (action === 'add_candidates') {
    const { bankId, candidateIds } = body
    if (!bankId || !candidateIds?.length) {
      return NextResponse.json({ error: 'bankId and candidateIds are required' }, { status: 400 })
    }
    const { error } = await addCandidatesToBank(supabase, bankId, orgId, candidateIds, user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Remove candidates from a bank (move back to default)
  if (action === 'remove_candidates') {
    const { bankId, candidateIds } = body
    if (!bankId || !candidateIds?.length) {
      return NextResponse.json({ error: 'bankId and candidateIds are required' }, { status: 400 })
    }
    const { error } = await removeCandidatesFromBank(supabase, bankId, orgId, candidateIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Move candidates between banks
  if (action === 'move_candidates') {
    const { fromBankId, toBankId, candidateIds } = body
    if (!toBankId || !candidateIds?.length) {
      return NextResponse.json({ error: 'toBankId and candidateIds are required' }, { status: 400 })
    }
    const { error } = await moveCandidatesToBank(supabase, fromBankId || null, toBankId, orgId, candidateIds, user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Move candidate to default bank
  if (action === 'move_to_default') {
    const { candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
    const { error, alreadyExists } = await addCandidateToDefaultBank(supabase, orgId, candidateId, user.id)
    if (alreadyExists) return NextResponse.json({ error: error?.message, alreadyExists: true }, { status: 409 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Check if candidate is in default bank
  if (action === 'check_default') {
    const { candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
    const inBank = await isCandidateInDefaultBank(supabase, orgId, candidateId)
    return NextResponse.json({ inBank })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
