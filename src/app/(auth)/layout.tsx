export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 auth-bg">
      <div className="w-full max-w-md relative z-10">{children}</div>
    </div>
  )
}
