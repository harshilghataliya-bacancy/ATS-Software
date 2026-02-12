'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Authenticating...')

  useEffect(() => {
    const supabase = createClient()

    async function handleCallback() {
      const code = searchParams.get('code')
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      // 1. Handle PKCE code exchange (regular login/signup)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          if (type === 'recovery') {
            router.push('/login?message=Password updated successfully')
            return
          }
          router.push('/dashboard')
          return
        }
      }

      // 2. Handle OTP token hash (magic link)
      if (token_hash && type) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any })
        if (!error) {
          router.push('/dashboard')
          return
        }
      }

      // 3. Handle hash fragment tokens (invite flow)
      // Supabase redirects with #access_token=...&refresh_token=...
      // We must manually parse the hash and call setSession()
      const hash = window.location.hash
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')

        if (access_token && refresh_token) {
          setStatus('Processing invitation...')
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (!error) {
            const hashType = hashParams.get('type')
            window.location.hash = ''
            // Invite users need to set a password for future logins
            if (hashType === 'invite') {
              router.push('/set-password')
              return
            }
            router.push('/dashboard')
            return
          }
          console.error('setSession error:', error)
        }
      }

      // 4. Check if already has a session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
        return
      }

      router.push('/login?error=Could not authenticate')
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500">{status}</p>
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
