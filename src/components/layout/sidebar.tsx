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

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/jobs', label: 'Jobs', icon: '⊞' },
  { href: '/candidates', label: 'Candidates', icon: '⊡' },
  { href: '/interviews', label: 'Interviews', icon: '◷' },
  { href: '/offers', label: 'Offers', icon: '✉' },
  { href: '/reports', label: 'Reports', icon: '◈' },
]

const secondaryNav = [
  { href: '/email-templates', label: 'Email Templates', icon: '▤' },
]

const settingsNav = [
  { href: '/settings/organization', label: 'Organization', icon: '⚙' },
  { href: '/settings/members', label: 'Members', icon: '⊕' },
]

function NavItem({ href, label, icon, active, collapsed }: { href: string; label: string; icon: string; active: boolean; collapsed: boolean }) {
  const link = (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <span className="text-base w-5 text-center shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
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
  const { canManageMembers, canViewReports } = useRole()
  const [collapsed, setCollapsed] = useState(false)

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <TooltipProvider>
      <aside className={`${collapsed ? 'w-[68px]' : 'w-64'} h-screen bg-white border-r flex flex-col transition-all duration-200 shrink-0`}>
        {/* Org header */}
        <div className={`border-b flex items-center ${collapsed ? 'p-3 justify-center' : 'p-4'}`}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <Link href="/dashboard" className="text-lg font-bold">
                  Hire<span className="text-blue-600">Flow</span>
                </Link>
                {organization && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{organization.name}</p>
                )}
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Main nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'p-2' : 'p-3'} space-y-1`}>
          {mainNav
            .filter((item) => {
              if (item.href === '/reports' && !canViewReports) return false
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

          <Separator className="my-3" />

          {secondaryNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              collapsed={collapsed}
              active={pathname === item.href || pathname.startsWith(item.href + '/')}
            />
          ))}

          {canManageMembers && (
            <>
              <Separator className="my-3" />

              {!collapsed && (
                <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
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
        <div className={`border-t ${collapsed ? 'p-2' : 'p-3'}`}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{user?.full_name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 px-2 py-1">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <form action={signOut}>
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-gray-500 px-0" type="submit">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Sign out
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" size="sm" className="w-full mt-2 text-gray-500" type="submit">
                Sign out
              </Button>
            )}
          </form>
        </div>
      </aside>
    </TooltipProvider>
  )
}
