import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getSalaryStructures,
  createSalaryStructure,
  seedDefaultStructures,
  getBuiltInStructures,
} from '@/lib/services/salary-structures'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) return null
  return { user, orgId: membership.organization_id, role: membership.role }
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Try DB first — auto-seed defaults
  await seedDefaultStructures(admin, ctx.orgId, ctx.user.id)
  const { data, error } = await getSalaryStructures(admin, ctx.orgId)

  // If DB works, return from DB
  if (!error && data && data.length > 0) {
    return NextResponse.json({ data })
  }

  // Fallback: return built-in structures if DB table not accessible
  return NextResponse.json({ data: getBuiltInStructures() })
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const admin = createAdminClient()
  const body = await request.json()
  const { name, description, is_default, components } = body

  if (!name || !components || !Array.isArray(components)) {
    return NextResponse.json({ error: 'Name and components are required' }, { status: 400 })
  }

  const { data, error } = await createSalaryStructure(admin, ctx.orgId, {
    name,
    description,
    is_default,
    components,
  }, ctx.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
