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

      // Also check hash fragment for type (some Supabase flows put it there)
      const hash = window.location.hash
      const hashParams = hash ? new URLSearchParams(hash.substring(1)) : null
      const hashType = hashParams?.get('type')
      const isRecovery = type === 'recovery' || hashType === 'recovery'

      // 1. Handle PKCE code exchange (login/signup/recovery)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          if (isRecovery) {
            window.location.replace('/set-password')
            return
          }
          router.push('/dashboard')
          return
        }
      }

      // 2. Handle OTP token hash (magic link / recovery)
      if (token_hash && type) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any })
        if (!error) {
          if (isRecovery) {
            window.location.replace('/set-password')
            return
          }
          router.push('/dashboard')
          return
        }
      }

      // 3. Handle hash fragment tokens (invite flow)
      if (hash) {
        const access_token = hashParams?.get('access_token')
        const refresh_token = hashParams?.get('refresh_token')

        if (access_token && refresh_token) {
          setStatus('Processing...')
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (!error) {
            window.location.hash = ''
            if (hashType === 'invite' || isRecovery) {
              window.location.replace('/set-password')
              return
            }
            router.push('/dashboard')
            return
          }
          console.error('setSession error:', error)
        }
      }

      // 4. Check if already has a session (fallback)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        if (isRecovery) {
          window.location.replace('/set-password')
          return
        }
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
