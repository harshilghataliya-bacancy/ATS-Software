'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { inviteMemberSchema, type InviteMemberInput } from '@/lib/validators/organization'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { updateMemberRole, removeMember } from '@/lib/services/organization'
import { inviteMemberAction, getMembersWithDetails } from '../actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Member {
  id: string
  user_id: string
  role: string
  email: string
  full_name: string
  created_at: string
}

export default function MembersPage() {
  const { user, organization, isLoading } = useUser()
  const { isAdmin } = useRole()
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema) as any,
    defaultValues: { role: 'recruiter' },
  })

  useEffect(() => {
    if (!organization) return
    loadMembers()
  }, [organization])

  async function loadMembers() {
    if (!organization) return
    const result = await getMembersWithDetails(organization.id)
    if (result.data) setMembers(result.data as Member[])
    setLoadingMembers(false)
  }

  async function onInvite(data: InviteMemberInput) {
    if (!organization) return
    setInviting(true)
    setError(null)
    setSuccess(null)

    const result = await inviteMemberAction(organization.id, data.email, data.role)

    if (result.error) {
      setError(result.error)
    } else {
      const tempPwdMsg = result.tempPassword
        ? ` Their temporary password is: ${result.tempPassword} (share this with them securely)`
        : ''
      setSuccess(`${data.email} added to the organization as ${data.role}.${tempPwdMsg}`)
      reset()
      await loadMembers()
    }
    setInviting(false)
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    if (!organization) return
    const supabase = createClient()
    const { error: roleError } = await updateMemberRole(supabase, memberId, organization.id, newRole)
    if (roleError) {
      setError(roleError.message)
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      )
    }
  }

  async function handleRemove(memberId: string) {
    if (!organization) return
    const supabase = createClient()
    const { error: removeError } = await removeMember(supabase, memberId, organization.id)
    if (removeError) {
      setError(removeError.message)
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const roleBadgeColor: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    recruiter: 'bg-blue-100 text-blue-700',
    hiring_manager: 'bg-green-100 text-green-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
        <p className="text-gray-500 mt-1">Manage who has access to your organization</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md whitespace-pre-wrap">{success}</div>
      )}

      {/* Invite form */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Member</CardTitle>
            <CardDescription>Add a team member by email. If they don&apos;t have an account, one will be created automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onInvite)} className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div className="w-44 space-y-2">
                <Label>Role</Label>
                <Select
                  defaultValue="recruiter"
                  onValueChange={(val) => setValue('role', val as InviteMemberInput['role'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={inviting}>
                {inviting ? 'Adding...' : 'Add'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No members yet</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const isYou = member.user_id === user?.id
                const initials = member.full_name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || '?'

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {member.full_name}
                          {isYou && (
                            <span className="text-gray-400 ml-1">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className={roleBadgeColor[member.role] ?? 'bg-gray-100 text-gray-700'}>
                        {member.role.replace('_', ' ')}
                      </Badge>

                      {isAdmin && !isYou && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={member.role}
                            onValueChange={(val) => handleRoleChange(member.id, val)}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="recruiter">Recruiter</SelectItem>
                              <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                            </SelectContent>
                          </Select>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 h-8">
                                Remove
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove member?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will revoke {member.full_name}&apos;s access to the organization.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemove(member.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
