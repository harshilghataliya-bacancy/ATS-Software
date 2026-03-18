'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { inviteMemberSchema, type InviteMemberInput } from '@/lib/validators/organization'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { updateMemberRole, removeMember } from '@/lib/services/organization'
import { inviteMemberAction, getMembersWithDetails } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  UserPlus, MoreHorizontal, Shield, Users, Briefcase, Eye,
  CheckCircle2, XCircle,
} from 'lucide-react'

interface Member {
  id: string
  user_id: string
  role: string
  email: string
  full_name: string
  created_at: string
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', color: 'text-violet-600', bgColor: 'bg-violet-50 border-violet-100', icon: Shield },
  recruiter: { label: 'Recruiter', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-100', icon: Users },
  hiring_manager: { label: 'Hiring Manager', color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-100', icon: Briefcase },
  interviewer: { label: 'Interviewer', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-100', icon: Eye },
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
]

function getAvatarGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
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
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  // Group by role
  const roleOrder = ['admin', 'recruiter', 'hiring_manager', 'interviewer']
  const sortedMembers = [...members].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
  const roleCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Manage who has access to your organization</p>
        {/* Role summary pills */}
        <div className="flex items-center gap-2">
          {roleOrder.filter(r => roleCounts[r]).map(role => {
            const config = ROLE_CONFIG[role]
            return (
              <span key={role} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.bgColor} ${config.color}`}>
                {roleCounts[role]} {config.label}{roleCounts[role] !== 1 ? 's' : ''}
              </span>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[13px] px-3.5 py-2.5 rounded-lg">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[13px] px-3.5 py-2.5 rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{success}</span>
        </div>
      )}

      {/* Add Member */}
      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-gray-900">Add Member</h3>
              <p className="text-[11px] text-gray-400">If they don&apos;t have an account, one will be created automatically</p>
            </div>
          </div>
          <form onSubmit={handleSubmit(onInvite)} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-[12px] text-gray-500">Email</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                {...register('email')}
                className="h-9 text-sm"
              />
              {errors.email && <p className="text-[12px] text-red-500">{errors.email.message}</p>}
            </div>
            <div className="w-40 space-y-1.5">
              <Label className="text-[12px] text-gray-500">Role</Label>
              <Select
                defaultValue="recruiter"
                onValueChange={(val) => setValue('role', val as InviteMemberInput['role'])}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                  <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                  <SelectItem value="interviewer">Interviewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={inviting} className="h-9 px-4">
              {inviting ? 'Adding...' : 'Add'}
            </Button>
          </form>
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-gray-900">Team Members</h3>
            <span className="text-[12px] text-gray-400 tabular-nums">({members.length})</span>
          </div>
        </div>

        {loadingMembers ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1.5" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No members yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sortedMembers.map((member) => {
              const isYou = member.user_id === user?.id
              const initials = member.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || '?'
              const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.recruiter
              const gradient = getAvatarGradient(member.email)

              return (
                <div
                  key={member.id}
                  className="group flex items-center gap-3.5 px-5 py-3 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                    <span className="text-[11px] font-semibold text-white">{initials}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{member.full_name}</p>
                      {isYou && (
                        <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">you</span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-400 truncate">{member.email}</p>
                  </div>

                  {/* Role Badge */}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0 ${roleConfig.bgColor} ${roleConfig.color}`}>
                    {roleConfig.label}
                  </span>

                  {/* Actions */}
                  {isAdmin && !isYou ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <div className="px-2 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Change Role</div>
                        {roleOrder.map(role => {
                          const rc = ROLE_CONFIG[role]
                          return (
                            <DropdownMenuItem
                              key={role}
                              onClick={() => handleRoleChange(member.id, role)}
                              className={`gap-2 text-[13px] ${member.role === role ? 'bg-gray-50 font-medium' : ''}`}
                            >
                              <rc.icon className={`w-3.5 h-3.5 ${rc.color}`} />
                              {rc.label}
                              {member.role === role && <CheckCircle2 className="w-3 h-3 ml-auto text-blue-500" />}
                            </DropdownMenuItem>
                          )
                        })}
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="gap-2 text-[13px] text-red-600 focus:text-red-600"
                            >
                              Remove Member
                            </DropdownMenuItem>
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="w-7" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
