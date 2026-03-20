import { AuthBackground } from '@/components/auth/auth-background'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center dashboard-bg px-4">
      <AuthBackground />
      <div className="w-full max-w-md relative z-10">{children}</div>
    </div>
  )
}
