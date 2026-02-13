import { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { addDomainToProject, removeDomainFromProject } from './vercel'

// =============================================================================
// Custom Domains
// =============================================================================

export async function getOrganizationDomains(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organization_domains')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function addCustomDomain(
  supabase: SupabaseClient,
  orgId: string,
  domain: string
) {
  const normalizedDomain = domain.toLowerCase().trim()

  // Check if domain already exists
  const { data: existing } = await supabase
    .from('organization_domains')
    .select('id')
    .eq('domain', normalizedDomain)
    .maybeSingle()

  if (existing) {
    return { data: null, error: new Error('This domain is already registered') }
  }

  // Generate verification token
  const verificationToken = randomBytes(32).toString('hex')

  // Register with Vercel (best-effort — domain can still be added if Vercel is not configured)
  let vercelError: string | null = null
  try {
    const { error: vErr } = await addDomainToProject(normalizedDomain)
    if (vErr) vercelError = vErr.message
  } catch {
    vercelError = 'Vercel API not configured — domain added locally only'
  }

  // Insert into database
  const { data, error } = await supabase
    .from('organization_domains')
    .insert({
      organization_id: orgId,
      domain: normalizedDomain,
      status: 'pending',
      verification_token: verificationToken,
    })
    .select()
    .single()

  if (error) return { data: null, error }

  return {
    data: { ...data, vercel_warning: vercelError },
    error: null,
  }
}

export async function verifyCustomDomain(
  supabase: SupabaseClient,
  domainId: string
) {
  // Get the domain record
  const { data: domainRecord, error: fetchError } = await supabase
    .from('organization_domains')
    .select('*')
    .eq('id', domainId)
    .single()

  if (fetchError || !domainRecord) {
    return { data: null, error: fetchError || new Error('Domain not found') }
  }

  // Perform DNS TXT record verification
  let verified = false
  try {
    const { promises: dns } = await import('dns')
    const records = await dns.resolveTxt(domainRecord.domain)
    const flatRecords = records.map((r: string[]) => r.join(''))
    verified = flatRecords.some((r: string) =>
      r.includes(`hireflow-verify=${domainRecord.verification_token}`)
    )
  } catch {
    // DNS lookup failed
    verified = false
  }

  const newStatus = verified ? 'verified' : 'failed'
  const { data, error } = await supabase
    .from('organization_domains')
    .update({
      status: newStatus,
      verified_at: verified ? new Date().toISOString() : null,
    })
    .eq('id', domainId)
    .select()
    .single()

  return { data, error }
}

export async function removeCustomDomain(
  supabase: SupabaseClient,
  domainId: string
) {
  // Get domain to remove from Vercel
  const { data: domainRecord } = await supabase
    .from('organization_domains')
    .select('domain')
    .eq('id', domainId)
    .single()

  if (domainRecord) {
    try {
      await removeDomainFromProject(domainRecord.domain)
    } catch {
      // Continue even if Vercel removal fails
    }
  }

  const { data, error } = await supabase
    .from('organization_domains')
    .delete()
    .eq('id', domainId)
    .select()
    .single()

  return { data, error }
}

// =============================================================================
// Platform Subdomains
// =============================================================================

export async function getOrganizationSubdomains(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organization_subdomains')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function addSubdomain(
  supabase: SupabaseClient,
  orgId: string,
  subdomain: string
) {
  const normalizedSubdomain = subdomain.toLowerCase().trim()

  // Check if subdomain already exists
  const { data: existing } = await supabase
    .from('organization_subdomains')
    .select('id')
    .eq('subdomain', normalizedSubdomain)
    .maybeSingle()

  if (existing) {
    return { data: null, error: new Error('This subdomain is already taken') }
  }

  const { data, error } = await supabase
    .from('organization_subdomains')
    .insert({
      organization_id: orgId,
      subdomain: normalizedSubdomain,
      status: 'active',
    })
    .select()
    .single()

  return { data, error }
}

export async function removeSubdomain(
  supabase: SupabaseClient,
  subdomainId: string
) {
  const { data, error } = await supabase
    .from('organization_subdomains')
    .delete()
    .eq('id', subdomainId)
    .select()
    .single()

  return { data, error }
}

// =============================================================================
// Organization Branding
// =============================================================================

export async function getOrganizationBranding(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organization_branding')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data, error }
}

export async function updateOrganizationBranding(
  supabase: SupabaseClient,
  orgId: string,
  brandingData: {
    brand_name?: string | null
    logo_url?: string | null
    favicon_url?: string | null
    primary_color?: string
    accent_color?: string
  }
) {
  // Try update first, then insert (upsert)
  const { data: existing } = await supabase
    .from('organization_branding')
    .select('organization_id')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('organization_branding')
      .update(brandingData)
      .eq('organization_id', orgId)
      .select()
      .single()

    return { data, error }
  }

  const { data, error } = await supabase
    .from('organization_branding')
    .insert({
      organization_id: orgId,
      ...brandingData,
    })
    .select()
    .single()

  return { data, error }
}

// =============================================================================
// DNS Instructions Helper
// =============================================================================

export function getDnsInstructions(domain: string, token: string) {
  return {
    verification: {
      type: 'TXT',
      host: domain,
      value: `hireflow-verify=${token}`,
      description: `Add a TXT record to verify ownership of ${domain}`,
    },
    cname: {
      type: 'CNAME',
      host: domain,
      value: 'cname.vercel-dns.com',
      description: `Add a CNAME record to point ${domain} to HireFlow`,
    },
  }
}
