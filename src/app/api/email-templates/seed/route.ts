import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_EMAIL_TEMPLATES, SYSTEM_EMAIL_TYPES } from '@/lib/email-templates/defaults'

/**
 * POST /api/email-templates/seed
 * Seeds all default system email templates for the current org.
 * Skips types that already have a template.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership || !['admin', 'recruiter'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgId = membership.organization_id

  // Get existing templates for this org
  const { data: existing } = await supabase
    .from('email_templates')
    .select('template_type')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  const existingTypes = new Set((existing || []).map((t: { template_type: string }) => t.template_type))

  // Seed missing types
  const toInsert = SYSTEM_EMAIL_TYPES
    .filter((type) => !existingTypes.has(type))
    .map((type) => {
      const def = DEFAULT_EMAIL_TEMPLATES[type]
      return {
        organization_id: orgId,
        name: def.name,
        subject: def.subject,
        body_html: def.body_html,
        template_type: type,
        variables: def.variables,
        is_system: true,
        created_by: user.id,
      }
    })

  if (toInsert.length === 0) {
    return NextResponse.json({ success: true, seeded: 0 })
  }

  const { error } = await supabase.from('email_templates').insert(toInsert)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, seeded: toInsert.length })
}
