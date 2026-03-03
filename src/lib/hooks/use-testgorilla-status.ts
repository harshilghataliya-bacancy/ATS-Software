'use client'

import { useEffect, useState } from 'react'

export function useTestGorillaStatus() {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)

  async function check() {
    try {
      const res = await fetch('/api/testgorilla/config')
      const data = await res.json()
      setConfigured(data.configured)
    } catch {
      setConfigured(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    check()
  }, [])

  return { configured, loading, refresh: check }
}
