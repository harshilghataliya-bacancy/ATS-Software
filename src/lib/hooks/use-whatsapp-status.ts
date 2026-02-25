'use client'

import { useEffect, useState } from 'react'

export function useWhatsAppStatus() {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null)

  async function check() {
    try {
      const res = await fetch('/api/whatsapp/config')
      const data = await res.json()
      setConfigured(data.configured)
      setWhatsappNumber(data.whatsappNumber || null)
    } catch {
      setConfigured(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    check()
  }, [])

  return { configured, loading, whatsappNumber, refresh: check }
}
