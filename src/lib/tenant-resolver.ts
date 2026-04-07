import { createAdminClient } from '@/lib/supabase/admin'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'getroa.com'

export type TenantResolution = {
  orgId: string
  source: 'customDomain' | 'subdomain'
} | null

// In-memory cache for tenant resolution (avoids DB query on every request)
const tenantCache = new Map<string, { result: TenantResolution; expiry: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function resolveTenantByHost(host: string): Promise<TenantResolution> {
  // Normalize: lowercase, strip port
  const normalizedHost = host.toLowerCase().replace(/:\d+$/, '')

  // Skip localhost and platform domain itself
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === PLATFORM_DOMAIN ||
    normalizedHost === `www.${PLATFORM_DOMAIN}`
  ) {
    return null
  }

  // Check cache first
  const cached = tenantCache.get(normalizedHost)
  if (cached && Date.now() < cached.expiry) {
    return cached.result
  }

  const supabase = createAdminClient()

  // Check if it's a platform subdomain (e.g., acme.hireflow.com)
  if (normalizedHost.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const subdomain = normalizedHost.replace(`.${PLATFORM_DOMAIN}`, '')

    // Skip multi-level subdomains
    if (subdomain.includes('.')) return null

    const { data } = await supabase
      .from('organization_subdomains')
      .select('organization_id')
      .eq('subdomain', subdomain)
      .eq('status', 'active')
      .single()

    if (data) {
      const result: TenantResolution = { orgId: data.organization_id, source: 'subdomain' }
      tenantCache.set(normalizedHost, { result, expiry: Date.now() + CACHE_TTL_MS })
      return result
    }

    tenantCache.set(normalizedHost, { result: null, expiry: Date.now() + CACHE_TTL_MS })
    return null
  }

  // Check custom domain (exact match)
  const { data } = await supabase
    .from('organization_domains')
    .select('organization_id')
    .eq('domain', normalizedHost)
    .eq('status', 'verified')
    .single()

  if (data) {
    const result: TenantResolution = { orgId: data.organization_id, source: 'customDomain' }
    tenantCache.set(normalizedHost, { result, expiry: Date.now() + CACHE_TTL_MS })
    return result
  }

  // Try without www prefix
  if (normalizedHost.startsWith('www.')) {
    const bareHost = normalizedHost.replace(/^www\./, '')
    const { data: bareData } = await supabase
      .from('organization_domains')
      .select('organization_id')
      .eq('domain', bareHost)
      .eq('status', 'verified')
      .single()

    if (bareData) {
      const result: TenantResolution = { orgId: bareData.organization_id, source: 'customDomain' }
      tenantCache.set(normalizedHost, { result, expiry: Date.now() + CACHE_TTL_MS })
      return result
    }
  }

  tenantCache.set(normalizedHost, { result: null, expiry: Date.now() + CACHE_TTL_MS })
  return null
}
