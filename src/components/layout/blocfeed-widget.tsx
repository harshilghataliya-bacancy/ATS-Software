'use client'

import { BlocFeedWidget } from 'blocfeed'
import { useUser } from '@/lib/hooks/use-user'

export function BlocFeedFeedback() {
  const { user } = useUser()

  return (
    <BlocFeedWidget
      blocfeed_id="bf_mlyqg076_5df518435926da5ba5b626868f523e5d"
      config={{
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.full_name,
            }
          : undefined,
        ui: {
          position: 'bottom-right',
          triggerStyle: 'classic',
          theme: {
            mode: 'light',
          },
        },
      }}
    />
  )
}
