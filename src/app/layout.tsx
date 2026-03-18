import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-dm-sans' })

export const metadata: Metadata = {
  title: 'HireFlow - Applicant Tracking System',
  description: 'Modern ATS for IT startups. Post jobs, track candidates, schedule interviews, and hire faster.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
