import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseResume } from '@/lib/services/resume-parser'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { candidate_id, candidate_ids } = body

    // Derive org from user's membership
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    const orgId = member.organization_id

    // Batch parse
    if (candidate_ids && Array.isArray(candidate_ids)) {
      const results: Array<{ candidate_id: string; success: boolean; error?: string }> = []

      for (const id of candidate_ids) {
        const { error } = await parseResume(supabase, id, orgId)
        results.push({
          candidate_id: id,
          success: !error,
          error: error?.message,
        })
      }

      return NextResponse.json({ data: results })
    }

    // Single parse
    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    const { data, error } = await parseResume(supabase, candidate_id, orgId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to parse resume' }, { status: 500 })
  }
}
