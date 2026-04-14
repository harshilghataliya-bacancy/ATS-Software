import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenantByHost } from '@/lib/tenant-resolver'

export async function updateSession(request: NextRequest) {
  // Skip auth if Supabase is not configured yet
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  // Integration endpoints authenticate via integration keys and should not depend on user session/tenant resolution.
  // Avoid extra Supabase calls and prevent middleware-level failures from impacting integrations.
  if (request.nextUrl.pathname.startsWith('/api/integrations/') || request.nextUrl.pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Tenant resolution: resolve org from custom domain or subdomain
  const host = request.headers.get('host') || ''
  const tenant = await resolveTenantByHost(host)
  if (tenant) {
    supabaseResponse.headers.set('x-org-id', tenant.orgId)
    supabaseResponse.headers.set('x-tenant-source', tenant.source)
  }

  // If host looks like a subdomain but tenant wasn't found → show 404
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'getroa.com'
  const normalizedHost = host.toLowerCase().replace(/:\d+$/, '')
  const isSubdomainHost = normalizedHost.endsWith(`.${platformDomain}`) && !normalizedHost.startsWith('www.')
  if (isSubdomainHost && !tenant) {
    const url = request.nextUrl.clone()
    url.pathname = '/not-found'
    return NextResponse.rewrite(url)
  }

  // Subdomain/custom-domain careers rewrite:
  // When a tenant is resolved via subdomain or custom domain, rewrite
  // the root and job-detail paths to the internal careers routes.
  // e.g. acme.hireflow.com/ → /careers/s
  //      acme.hireflow.com/abc-123 → /careers/s/abc-123
  if (tenant) {
    const pathname = request.nextUrl.pathname

    // Skip static assets and API routes
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
      // Root page → careers listing
      if (pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/careers/s'
        return NextResponse.rewrite(url, { headers: supabaseResponse.headers })
      }

      // Single-segment path (e.g., /uuid-job-id) → job detail
      // But skip known dashboard routes
      const dashboardPrefixes = ['/login', '/signup', '/forgot-password', '/set-password', '/dashboard', '/jobs', '/candidates', '/applications', '/interviews', '/offers', '/pipeline', '/reports', '/settings', '/email-templates', '/org', '/careers', '/callback']
      const isKnownRoute = dashboardPrefixes.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!isKnownRoute) {
        // Treat as a job ID
        const jobId = pathname.slice(1) // remove leading /
        if (jobId && !jobId.includes('/')) {
          const url = request.nextUrl.clone()
          url.pathname = `/careers/s/${jobId}`
          return NextResponse.rewrite(url, { headers: supabaseResponse.headers })
        }
      }
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Never redirect API callers (integration/webhook clients expect JSON, not HTML redirects).
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  const publicRoutes = ['/login', '/signup', '/forgot-password', '/set-password', '/careers', '/api/webhooks', '/api/public', '/api/whatsapp/webhook', '/api/whatsapp/webhook/debug', '/org/new', '/offers/respond', '/api/offers/public-respond']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))
  const isAuthCallback = request.nextUrl.pathname.startsWith('/api/auth') || request.nextUrl.pathname.startsWith('/callback')
  const isRootPage = request.nextUrl.pathname === '/'

  if (!user && !isPublicRoute && !isAuthCallback && !isRootPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup' || isRootPage)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
