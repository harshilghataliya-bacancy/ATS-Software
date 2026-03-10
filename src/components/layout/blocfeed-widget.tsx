'use client'

import { BlocFeedWidget } from 'blocfeed'
import { useUser } from '@/lib/hooks/use-user'

export function BlocFeedFeedback() {
  const { user, organization } = useUser()

  return (
    <BlocFeedWidget
      blocfeed_id="bf_mlyqg076_5df518435926da5ba5b626868f523e5d"
      config={{
        // User identity — attached to every submission
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.full_name,
            }
          : undefined,

        // Widget UI
        ui: {
          position: 'bottom-right',
          triggerStyle: 'classic',
          triggerLabel: 'Feedback',
          shortcut: 'mod+shift+f',
          theme: {
            mode: 'light',
          },
          categories: ['bug', 'feature', 'ux', 'general'],
        },

        // Console + network diagnostics captured with every submission
        diagnostics: {
          console: true,
          consoleLevels: ['error', 'warn'],
          consoleLimit: 20,
          network: true,
          networkLimit: 15,
        },

        // Video screen recording for bug reproduction
        recording: {
          enabled: true,
          maxDurationMs: 30_000,
          videoBitsPerSecond: 2_500_000,
        },

        // Voice feedback (mic + Whisper transcription)
        voice: {
          enabled: true,
          maxDurationMs: 60_000,
        },

        // Screenshot defaults
        capture: {
          element: true,
          fullPage: false,
          mime: 'image/png',
          quality: 0.92,
          timeoutMs: 12000,
          maxDimension: 2048,
          pixelRatio: 2,
        },

        // Retry & transport
        transport: {
          timeoutMs: 15000,
          maxAttempts: 3,
          backoffMs: 1000,
        },

        // Secret leak detection — warn if API keys end up client-side
        security: {
          secretScan: true,
          scanTargets: ['hydration', 'scripts', 'meta', 'dom'],
        },

        // Enrich every submission with org context
        metadata: {
          enabled: true,
          enrich: async () => ({
            orgId: organization?.id,
            orgName: organization?.name,
            appVersion: '1.0.0',
          }),
        },
      }}
    />
  )
}
