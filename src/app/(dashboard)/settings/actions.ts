'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, sendGmailEmail } from '@/lib/services/gmail'

// ---------------------------------------------------------------------------
// Fetch members with user details (email, name) from auth
// ---------------------------------------------------------------------------

export async function getMembersWithDetails(orgId: string) {
  const adminSupabase = createAdminClient()
  const supabase = await createClient()

  // Verify caller is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  // Fetch members
  const { data: members, error: membersError } = await adminSupabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (membersError) {
    return { error: membersError.message, data: null }
  }

  // Fetch all auth users to get email/name
  const { data: { users }, error: usersError } = await adminSupabase.auth.admin.listUsers()

  if (usersError) {
    return { error: usersError.message, data: null }
  }

  // Merge member data with user details
  const enriched = members.map((member) => {
    const authUser = users.find((u) => u.id === member.user_id)
    return {
      ...member,
      email: authUser?.email ?? 'Unknown',
      full_name: authUser?.user_metadata?.full_name ?? authUser?.email?.split('@')[0] ?? 'Unknown',
    }
  })

  return { data: enriched, error: null }
}

export async function inviteMemberAction(orgId: string, email: string, role: string) {
  const adminSupabase = createAdminClient()
  const supabase = await createClient()

  // Verify the caller is an admin of this org
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (membership?.role !== 'admin') {
    return { error: 'Only admins can invite members' }
  }

  // Look up if user already exists
  const { data: { users }, error: lookupError } = await adminSupabase.auth.admin.listUsers()

  if (lookupError) {
    return { error: lookupError.message }
  }

  let targetUserId: string

  const existingUser = users.find((u) => u.email === email)

  // Fetch org name for email
  const { data: orgData } = await adminSupabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  const orgName = orgData?.name || 'HireFlow'
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

  if (existingUser) {
    // User already has an account — send notification email via Gmail
    targetUserId = existingUser.id

    const tokenResult = await getValidAccessToken(adminSupabase, user.id, orgId)
    if (tokenResult.accessToken) {
      // Fire-and-forget: send notification email in background
      sendGmailEmail(tokenResult.accessToken, {
        from: tokenResult.fromEmail || user.email!,
        to: email,
        subject: `You've been added to ${orgName} on HireFlow`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to ${orgName}!</h2>
            <p>You have been added to <strong>${orgName}</strong> on HireFlow as a <strong>${role.replace('_', ' ')}</strong>.</p>
            <p>You can now log in with your existing account to access the organization.</p>
            <div style="margin: 24px 0;">
              <a href="${appUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Open HireFlow
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">If you did not expect this invitation, you can ignore this email.</p>
          </div>
        `,
      }).catch((err) => console.error('Failed to send member notification email via Gmail:', err))
    }
  } else {
    // Generate invite link without sending email (avoids Supabase rate limits)
    const redirectTo = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/callback`
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          full_name: email.split('@')[0],
          invited_to_org: orgId,
          invited_role: role,
        },
        redirectTo,
      },
    })

    if (linkError) {
      // Fallback: create user directly with temp password
      const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`
      const { data: createData, error: createError } = await adminSupabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: email.split('@')[0],
          invited_to_org: orgId,
          invited_role: role,
        },
      })

      if (createError) {
        return { error: `Could not create account: ${createError.message}` }
      }

      targetUserId = createData.user.id

      // Send credentials email via Gmail
      const fallbackToken = await getValidAccessToken(adminSupabase, user.id, orgId)
      if (fallbackToken.accessToken) {
        // Fire-and-forget: send credentials email in background
        sendGmailEmail(fallbackToken.accessToken, {
          from: fallbackToken.fromEmail || user.email!,
          to: email,
          subject: `You've been invited to ${orgName} on HireFlow`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to ${orgName}!</h2>
              <p>You have been invited to join <strong>${orgName}</strong> on HireFlow as a <strong>${role.replace('_', ' ')}</strong>.</p>
              <p>An account has been created for you. Here are your login credentials:</p>
              <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 8px 0 0 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
              </div>
              <p style="color: #dc2626; font-size: 14px;">Please change your password after first login.</p>
              <div style="margin: 24px 0;">
                <a href="${appUrl}"
                   style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Login to HireFlow
                </a>
              </div>
            </div>
          `,
        }).catch((err) => console.error('Failed to send invite email via Gmail:', err))
      }

      return await addMemberAndReturn(adminSupabase, orgId, targetUserId, role, tempPassword)
    }

    targetUserId = linkData.user.id

    // Send invite email via admin's connected Gmail
    const tokenResult = await getValidAccessToken(adminSupabase, user.id, orgId)
    if (tokenResult.accessToken) {
      const inviteLink = linkData.properties.action_link
      // Fire-and-forget: send invite email in background
      sendGmailEmail(tokenResult.accessToken, {
        from: tokenResult.fromEmail || user.email!,
        to: email,
        subject: `You've been invited to ${orgName} on HireFlow`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You're invited to join ${orgName}!</h2>
            <p>You have been invited to join <strong>${orgName}</strong> on HireFlow as a <strong>${role.replace('_', ' ')}</strong>.</p>
            <p>Click the button below to accept your invitation and set up your account:</p>
            <div style="margin: 24px 0;">
              <a href="${inviteLink}"
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">If the button doesn&rsquo;t work, copy and paste this link into your browser:</p>
            <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${inviteLink}</p>
          </div>
        `,
      }).catch((err) => console.error('Failed to send invite email via Gmail:', err))
    } else {
      console.warn('Gmail not connected — invite created but no email sent. User:', email)
    }
  }

  // Check if already a member
  const { data: existingMember } = await adminSupabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingMember) {
    return { error: 'User is already a member of this organization' }
  }

  // Add them as a member
  const { error: insertError } = await adminSupabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      user_id: targetUserId,
      role,
      joined_at: new Date().toISOString(),
    })

  if (insertError) {
    return { error: insertError.message }
  }

  return { success: true }
}

async function addMemberAndReturn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  orgId: string,
  userId: string,
  role: string,
  tempPassword?: string
) {
  const { data: existingMember } = await adminSupabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingMember) {
    return { error: 'User is already a member of this organization' }
  }

  const { error: insertError } = await adminSupabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      user_id: userId,
      role,
      joined_at: new Date().toISOString(),
    })

  if (insertError) {
    return { error: insertError.message }
  }

  if (tempPassword) {
    return { success: true, tempPassword }
  }

  return { success: true }
}
