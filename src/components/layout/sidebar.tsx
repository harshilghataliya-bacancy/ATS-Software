'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard, Briefcase, CalendarClock, FileText, Landmark,
  BarChart3, Mail, FileSignature, Building2, Users, LogOut,
  ChevronsLeft, ChevronsRight, Calculator, ClipboardList,
} from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/interviews', label: 'Interviews', icon: CalendarClock },
  { href: '/offers', label: 'Offers', icon: FileText },
  { href: '/banks', label: 'Candidate Bank', icon: Landmark },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
]

const secondaryNav = [
  { href: '/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/settings/offer-templates', label: 'Offer Templates', icon: FileSignature },
]

const settingsNav = [
  { href: '/settings/organization', label: 'Organization', icon: Building2 },
  { href: '/settings/members', label: 'Members', icon: Users },
  { href: '/settings/salary-structures', label: 'Salary Structures', icon: Calculator },
  { href: '/settings/scorecards', label: 'Scorecards', icon: ClipboardList },
]

function NavItem({ href, label, icon: Icon, active, collapsed }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; collapsed: boolean }) {
  const link = (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        active
          ? 'bg-blue-50 text-blue-700 shadow-sm shadow-blue-100/50'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      } ${collapsed ? 'justify-center px-2' : ''}`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-600 rounded-r-full" />
      )}
      <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return link
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, organization } = useUser()
  const { role, canManageMembers, canViewReports, canViewDashboard, canAccessBanks, isInterviewer, isAdmin } = useRole()
  const [collapsed, setCollapsed] = useState(false)

  const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Admin', color: 'bg-violet-100 text-violet-700' },
    recruiter: { label: 'Recruiter', color: 'bg-blue-100 text-blue-700' },
    hiring_manager: { label: 'Hiring Mgr', color: 'bg-emerald-100 text-emerald-700' },
    interviewer: { label: 'Interviewer', color: 'bg-amber-100 text-amber-700' },
  }
  const currentRole = role ? roleBadge[role] : null

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <TooltipProvider>
      <aside className={`${collapsed ? 'w-[68px]' : 'w-60'} h-screen bg-white border-r border-gray-200/80 flex flex-col transition-all duration-200 shrink-0`}>
        {/* Org header */}
        <div className={`border-b border-gray-100 flex items-center ${collapsed ? 'p-3 justify-center' : 'px-4 py-3.5'}`}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <Link href="/dashboard" className="text-[15px] font-bold tracking-tight">
                  Hire<span className="text-blue-600">Flow</span>
                </Link>
                {organization && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{organization.name}</p>
                )}
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Main nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'p-2' : 'px-3 py-3'} space-y-0.5`}>
          {mainNav
            .filter((item) => {
              if (item.href === '/dashboard' && !canViewDashboard && !isInterviewer) return false
              if (item.href === '/reports' && !canViewReports) return false
              if (item.href === '/banks' && !canAccessBanks) return false
              if (isInterviewer && !['/dashboard', '/interviews'].includes(item.href)) return false
              return true
            })
            .map((item) => (
              <NavItem
                key={item.href}
                {...item}
                collapsed={collapsed}
                active={pathname === item.href || pathname.startsWith(item.href + '/')}
              />
            ))}

          {!isInterviewer && (
            <>
              <Separator className="!my-3" />

              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
                  Templates
                </p>
              )}
              {secondaryNav
                .filter((item) => {
                  if (item.href === '/settings/offer-templates' && !isAdmin) return false
                  return true
                })
                .map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  collapsed={collapsed}
                  active={pathname === item.href || pathname.startsWith(item.href + '/')}
                />
              ))}
            </>
          )}

          {canManageMembers && (
            <>
              <Separator className="!my-3" />

              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
                  Settings
                </p>
              )}
              {settingsNav.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  collapsed={collapsed}
                  active={pathname === item.href}
                />
              ))}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className={`border-t border-gray-100 ${collapsed ? 'p-2' : 'px-3 py-3'}`}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium text-sm">{user?.full_name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
                {currentRole && <p className="text-xs font-medium mt-1">{currentRole.label}</p>}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-1 py-1">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
              </div>
              {currentRole && (
                <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${currentRole.color}`}>
                  {currentRole.label}
                </span>
              )}
            </div>
          )}
          <form action={signOut}>
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-gray-400 hover:text-red-500 px-0" type="submit">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Sign out
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" size="sm" className="w-full mt-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs justify-start gap-2" type="submit">
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </Button>
            )}
          </form>
        </div>
      </aside>
    </TooltipProvider>
  )
}
