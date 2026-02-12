import { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrganizationData {
  name: string
  slug: string
  logo_url?: string
  website?: string
  description?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOrganization(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  return { data, error }
}

export async function getOrganizationBySlug(
  supabase: SupabaseClient,
  slug: string
) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createOrganization(
  supabase: SupabaseClient,
  data: OrganizationData,
  userId: string
) {
  // Create the organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: data.name,
      slug: data.slug,
      logo_url: data.logo_url,
      website: data.website,
      description: data.description,
    })
    .select()
    .single()

  if (orgError) {
    return { data: null, error: orgError }
  }

  // Add the creator as an admin member
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'admin',
      joined_at: new Date().toISOString(),
    })

  if (memberError) {
    // Clean up the organization if member creation fails
    await supabase.from('organizations').delete().eq('id', org.id)
    return { data: null, error: memberError }
  }

  return { data: org, error: null }
}

export async function updateOrganization(
  supabase: SupabaseClient,
  orgId: string,
  data: Record<string, unknown>
) {
  const { data: org, error } = await supabase
    .from('organizations')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .select()
    .single()

  return { data: org, error }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function getMembers(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  return { data, error }
}

export async function inviteMember(
  supabase: SupabaseClient,
  orgId: string,
  email: string,
  role: string
) {
  // Look up user by email using admin API
  const { data: { users }, error: lookupError } = await supabase.auth.admin.listUsers()

  if (lookupError) {
    return { data: null, error: lookupError }
  }

  const targetUser = users.find((u) => u.email === email)
  if (!targetUser) {
    return { data: null, error: new Error('No account found with that email. The user must sign up first.') }
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', targetUser.id)
    .maybeSingle()

  if (existing) {
    return { data: null, error: new Error('User is already a member of this organization') }
  }

  // Add them directly as a member
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      user_id: targetUser.id,
      role,
      joined_at: new Date().toISOString(),
    })
    .select()
    .single()

  return { data, error }
}

export async function updateMemberRole(
  supabase: SupabaseClient,
  memberId: string,
  orgId: string,
  role: string
) {
  const { data, error } = await supabase
    .from('organization_members')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
}

export async function removeMember(
  supabase: SupabaseClient,
  memberId: string,
  orgId: string
) {
  // Prevent removing the last admin
  const { data: admins } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')

  const targetMember = await supabase
    .from('organization_members')
    .select('role')
    .eq('id', memberId)
    .eq('organization_id', orgId)
    .single()

  if (
    targetMember.data?.role === 'admin' &&
    admins &&
    admins.length <= 1
  ) {
    return {
      data: null,
      error: new Error('Cannot remove the last admin of the organization'),
    }
  }

  const { data, error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// User Organizations
// ---------------------------------------------------------------------------

export async function getUserOrganizations(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      role,
      organization:organizations(*)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    return { data: null, error }
  }

  // Flatten the result to return organizations with the user's role
  const organizations = data?.map((membership) => ({
    ...membership.organization,
    user_role: membership.role,
  }))

  return { data: organizations, error: null }
}
