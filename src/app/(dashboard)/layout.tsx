import { UserProvider } from '@/components/layout/user-provider'
import { Sidebar } from '@/components/layout/sidebar'
import { BlocFeedFeedback } from '@/components/layout/blocfeed-widget'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[#f8f9fb]">
          <div className="max-w-7xl mx-auto px-6 py-5">
            {children}
          </div>
        </main>
      </div>
      <BlocFeedFeedback />
    </UserProvider>
  )
}
