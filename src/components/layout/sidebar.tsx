'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

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

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      {label}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, organization } = useUser()
  const { canManageMembers } = useRole()

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??'

  return (
    <aside className="w-64 h-screen bg-white border-r flex flex-col">
      {/* Org header */}
      <div className="p-4 border-b">
        <Link href="/dashboard" className="text-lg font-bold">
          Hire<span className="text-blue-600">Flow</span>
        </Link>
        {organization && (
          <p className="text-xs text-gray-500 mt-1 truncate">{organization.name}</p>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {mainNav.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={pathname === item.href || pathname.startsWith(item.href + '/')}
          />
        ))}

        <Separator className="my-3" />

        {secondaryNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname === item.href || pathname.startsWith(item.href + '/')}
            />
          ))}

        <Separator className="my-3" />

        <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
          Settings
        </p>
        {settingsNav
          .filter((item) => {
            if (item.href === '/settings/members' && !canManageMembers) return false
            return true
          })
          .map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={pathname === item.href}
            />
          ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t">
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
        <form action={signOut}>
          <Button variant="ghost" size="sm" className="w-full mt-2 text-gray-500" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}
