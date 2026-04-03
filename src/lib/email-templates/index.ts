/**
 * Unified email template system.
 *
 * - getOrCreateTemplate: Fetches from DB or auto-seeds the code default
 * - renderEmail: Substitutes variables + wraps in professional HTML chrome
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_EMAIL_TEMPLATES, SystemEmailType } from './defaults'
import { wrapEmailHtml } from './wrapper'

export { wrapEmailHtml, buildDetailTable } from './wrapper'
export { DEFAULT_EMAIL_TEMPLATES, SYSTEM_EMAIL_TYPES, SYSTEM_EMAIL_TYPE_LABELS } from './defaults'
export type { SystemEmailType } from './defaults'

// ---------------------------------------------------------------------------
// Template Resolution
// ---------------------------------------------------------------------------

interface ResolvedTemplate {
  subject: string
  body_html: string
  template_id: string | null
}

/**
 * Get the email template for a given type + org.
 * 1. Check DB for a custom/system template
 * 2. If none, auto-seed the code default into DB
 * 3. Return subject + body_html + template_id
 */
export async function getOrCreateTemplate(
  supabase: SupabaseClient,
  orgId: string,
  templateType: SystemEmailType,
  userId?: string
): Promise<ResolvedTemplate> {
  // 1. Query DB
  const { data: existing } = await supabase
    .from('email_templates')
    .select('id, subject, body_html, is_system')
    .eq('organization_id', orgId)
    .eq('template_type', templateType)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Auto-update system templates when code defaults change (e.g. new variables/buttons added)
    const defaults = DEFAULT_EMAIL_TEMPLATES[templateType]
    if (existing.is_system && defaults) {
      const codeBody = defaults.body_html
      // Check if the DB body is missing content from the latest code default
      // by comparing key structural elements (like links/buttons)
      const dbHasAllVars = (defaults.variables ?? []).every((v: string) => {
        // If the code default uses this variable in its body, the DB template should too
        if (!codeBody.includes(`{{${v}}}`)) return true
        return existing.body_html.includes(`{{${v}}}`)
      })
      if (!dbHasAllVars) {
        const { data: updated } = await supabase
          .from('email_templates')
          .update({ body_html: codeBody, subject: defaults.subject, variables: defaults.variables })
          .eq('id', existing.id)
          .select('id, subject, body_html')
          .single()
        if (updated) {
          return { subject: updated.subject, body_html: updated.body_html, template_id: updated.id }
        }
      }
    }
    return { subject: existing.subject, body_html: existing.body_html, template_id: existing.id }
  }

  // 2. Auto-seed default
  const defaults = DEFAULT_EMAIL_TEMPLATES[templateType]
  if (!defaults) {
    return { subject: '', body_html: '', template_id: null }
  }

  const { data: seeded } = await supabase
    .from('email_templates')
    .insert({
      organization_id: orgId,
      name: defaults.name,
      subject: defaults.subject,
      body_html: defaults.body_html,
      template_type: templateType,
      variables: defaults.variables,
      is_system: true,
      created_by: userId || null,
    })
    .select('id, subject, body_html')
    .single()

  if (seeded) {
    return { subject: seeded.subject, body_html: seeded.body_html, template_id: seeded.id }
  }

  // 3. Fallback to code defaults (insert failed, maybe race condition)
  return { subject: defaults.subject, body_html: defaults.body_html, template_id: null }
}

// ---------------------------------------------------------------------------
// Variable Substitution
// ---------------------------------------------------------------------------

export function substituteVariables(
  text: string,
  vars: Record<string, string>
): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
  }
  // Strip any remaining unreplaced variables
  result = result.replace(/\{\{[a-z_]+\}\}/g, '')
  // Remove button/link divs with empty href (e.g. when view_interview_link is empty)
  result = result.replace(/<div[^>]*>[\s\S]*?<a\s+href=""\s[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/div>/g, '')
  return result
}

// ---------------------------------------------------------------------------
// Full Render Pipeline
// ---------------------------------------------------------------------------

/**
 * Render an email template end-to-end:
 * 1. Substitute variables in subject + body
 * 2. Wrap body in the professional HTML wrapper
 */
export function renderEmail(
  template: { subject: string; body_html: string },
  vars: Record<string, string>,
  companyName: string,
  options?: { accentColor?: string; footerText?: string }
): { subject: string; html: string } {
  const subject = substituteVariables(template.subject, vars)
  const innerHtml = substituteVariables(template.body_html, vars)
  const html = wrapEmailHtml(innerHtml, companyName, options)

  return { subject, html }
}
