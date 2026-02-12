'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function forgotPassword(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/callback?type=recovery`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: 'Check your email for a password reset link.' }
}

export async function signInWithGoogle() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  redirect(data.url)
}

export async function createOrg(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in' }
  }

  const name = formData.get('name') as string
  const slug = formData.get('slug') as string

  // Use admin client to bypass RLS for bootstrapping
  const admin = createAdminClient()

  // Create the organization
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name, slug })
    .select()
    .single()

  if (orgError) {
    return { error: orgError.message }
  }

  // Add the creator as an admin member
  const { error: memberError } = await admin
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'admin',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: memberError.message }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
