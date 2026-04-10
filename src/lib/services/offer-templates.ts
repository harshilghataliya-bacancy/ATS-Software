import { SupabaseClient } from '@supabase/supabase-js'

interface OfferTemplateData {
  name: string
  is_active?: boolean
  logo_url?: string | null
  company_name?: string | null
  terms_and_conditions?: string | null
  // Branding
  primary_color?: string | null
  accent_color?: string | null
  // PDF Content Sections
  greeting_text?: string | null
  intro_text?: string | null
  closing_text?: string | null
  validity_text?: string | null
  acceptance_text?: string | null
  // Signature
  signatory_name?: string | null
  signatory_title?: string | null
  signatory_label?: string | null
  candidate_sig_label?: string | null
  // Section toggles
  show_salary_breakdown?: boolean
  show_bonus_section?: boolean
  show_terms_section?: boolean
  show_acceptance_section?: boolean
  show_signature_block?: boolean
  // Footer
  footer_text?: string | null
  // Email customization
  email_subject?: string | null
  email_body?: string | null
  // Contact info for PDF header/footer
  company_phone?: string | null
  company_email?: string | null
  company_website?: string | null
  company_address?: string | null
  // Word-upload templates
  template_source?: 'manual' | 'word'
  docx_content_html?: string | null
  docx_header_html?: string | null
  docx_footer_html?: string | null
  docx_page_background_url?: string | null
  docx_page_margins?: { top: number; bottom: number; left: number; right: number; header: number; footer: number } | null
  docx_storage_path?: string | null
}

export async function getOfferTemplates(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_templates')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function getOfferTemplateById(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_templates')
    .select('*')
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  return { data, error }
}

export async function getActiveOfferTemplate(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('offer_templates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle()

  return { data, error }
}

export async function createOfferTemplate(
  supabase: SupabaseClient,
  orgId: string,
  data: OfferTemplateData,
  userId: string
) {
  // If the new template is active, deactivate all others
  if (data.is_active) {
    await supabase
      .from('offer_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_active', true)
  }

  const { data: template, error } = await supabase
    .from('offer_templates')
    .insert({
      ...data,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single()

  return { data: template, error }
}

export async function updateOfferTemplate(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string,
  data: Partial<OfferTemplateData>
) {
  // If activating this template, deactivate all others
  if (data.is_active) {
    await supabase
      .from('offer_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .neq('id', templateId)
  }

  const { data: template, error } = await supabase
    .from('offer_templates')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data: template, error }
}

export async function deleteOfferTemplate(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string
) {
  const { error } = await supabase
    .from('offer_templates')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  return { error }
}
