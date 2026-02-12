'use client'

import { useEffect, useState } from 'react'

export function useGmailStatus() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  async function check() {
    try {
      const res = await fetch('/api/gmail/status')
      const data = await res.json()
      setConnected(data.connected)
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    check()
  }, [])

  return { connected, loading, refresh: check }
}
