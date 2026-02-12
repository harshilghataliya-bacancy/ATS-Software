import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailTemplateData {
  name: string
  subject: string
  body_html: string
  template_type: string
  variables?: Record<string, unknown>
  [key: string]: unknown
}

interface EmailLogData {
  candidate_id: string
  application_id?: string
  template_id?: string
  subject: string
  body_html: string
  to_email: string
  from_email: string
  status: 'sent' | 'failed' | 'bounced'
  sent_at?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

export async function getEmailTemplates(
  supabase: SupabaseClient,
  orgId: string,
  templateType?: string
) {
  let query = supabase
    .from('email_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (templateType) {
    query = query.eq('template_type', templateType)
  }

  const { data, error } = await query

  return { data, error }
}

export async function createEmailTemplate(
  supabase: SupabaseClient,
  orgId: string,
  data: EmailTemplateData,
  userId: string
) {
  const { data: template, error } = await supabase
    .from('email_templates')
    .insert({
      ...data,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single()

  return { data: template, error }
}

export async function updateEmailTemplate(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: template, error } = await supabase
    .from('email_templates')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data: template, error }
}

export async function deleteEmailTemplate(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Email Logs
// ---------------------------------------------------------------------------

export async function getEmailLogs(
  supabase: SupabaseClient,
  orgId: string,
  candidateId?: string
) {
  let query = supabase
    .from('email_logs')
    .select(
      `
      *,
      candidate:candidates(id, first_name, last_name, email),
      template:email_templates(id, name, template_type)
    `
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (candidateId) {
    query = query.eq('candidate_id', candidateId)
  }

  const { data, error } = await query

  return { data, error }
}

export async function logEmail(
  supabase: SupabaseClient,
  orgId: string,
  data: EmailLogData
) {
  const { data: log, error } = await supabase
    .from('email_logs')
    .insert({
      ...data,
      organization_id: orgId,
    })
    .select()
    .single()

  return { data: log, error }
}
