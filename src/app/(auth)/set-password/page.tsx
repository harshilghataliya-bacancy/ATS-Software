'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [initializing, setInitializing] = useState(true)

  // On mount: exchange PKCE code if present, then verify session
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (code) {
        // Exchange PKCE code for session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          // Code might already have been exchanged by Supabase client internals
          console.warn('Code exchange:', exchangeError.message)
        }
        // Clean the URL
        window.history.replaceState({}, '', '/set-password')
      }

      // Verify we have a valid session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setReady(true)
      } else {
        setError('Session expired. Please request a new password reset link.')
      }
      setInitializing(false)
    }
    init()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Sign out so user logs in with new password
    await supabase.auth.signOut()
    router.push('/login?message=Password updated successfully')
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          Hire<span className="text-blue-600">Flow</span>
        </CardTitle>
        <CardDescription>Set a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        {initializing ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !ready ? (
          <div className="text-center py-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            <Button onClick={() => router.push('/forgot-password')} variant="outline">
              Request new reset link
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Setting password...' : 'Set Password & Continue'}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
