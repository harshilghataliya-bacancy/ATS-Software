import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenantByHost } from '@/lib/tenant-resolver'

export async function updateSession(request: NextRequest) {
  // Skip auth if Supabase is not configured yet
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const publicRoutes = ['/login', '/signup', '/forgot-password', '/set-password', '/careers', '/api/webhooks', '/org/new']
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
