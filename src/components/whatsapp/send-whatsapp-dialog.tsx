'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useWhatsAppStatus } from '@/lib/hooks/use-whatsapp-status'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

interface WhatsAppMessageItem {
  id: string
  message_body: string
  direction: 'outbound' | 'inbound'
  status: string
  created_at: string
}

interface SendWhatsAppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateId: string
  candidateName: string
  candidatePhone: string | null
  jobTitle?: string
  applicationId?: string
}

export function SendWhatsAppDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  candidatePhone,
  jobTitle,
  applicationId,
}: SendWhatsAppDialogProps) {
  const { configured, loading: waLoading } = useWhatsAppStatus()

  const [messages, setMessages] = useState<WhatsAppMessageItem[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async (showLoading = true) => {
    if (!candidateId) return
    if (showLoading) setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?candidateId=${candidateId}`)
      const data = await res.json()
      if (data.data) setMessages(data.data)
    } catch {
      // ignore
    }
    if (showLoading) setMessagesLoading(false)
  }, [candidateId])

  // Load conversation history when dialog opens + poll for new messages
  useEffect(() => {
    if (open && candidateId) {
      loadMessages()
      setError(null)
      setSuccess(false)
      setMessageBody('')

      // Poll every 5 seconds for new inbound messages
      const interval = setInterval(() => {
        loadMessages(false)
      }, 5000)

      return () => clearInterval(interval)
    }
  }, [open, candidateId, loadMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!messageBody.trim() || !candidatePhone) {
      setError('Message and phone number are required')
      return
    }

    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          candidatePhone,
          message: messageBody.trim(),
          applicationId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to send message')
      } else {
        setSuccess(true)
        setMessageBody('')
        await loadMessages()
        setTimeout(() => setSuccess(false), 2000)
      }
    } catch {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp message to {candidateName}
            {candidatePhone && <span className="ml-1 font-mono text-xs">({candidatePhone})</span>}
            {jobTitle && <span> regarding {jobTitle}</span>}
          </DialogDescription>
        </DialogHeader>

        {waLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !configured ? (
          <div className="py-6 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <p className="text-sm text-gray-600 mb-1">WhatsApp is not configured</p>
            <p className="text-xs text-gray-400">
              Ask an admin to set up Twilio WhatsApp in Settings.
            </p>
          </div>
        ) : !candidatePhone ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600">
              This candidate does not have a phone number on file.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>
            )}
            {success && (
              <div className="bg-green-50 text-green-700 text-sm p-2 rounded">Message sent!</div>
            )}

            {/* Conversation History */}
            <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[350px] border rounded-lg p-3 bg-gray-50 space-y-2">
              {messagesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-8 w-1/2 ml-auto" />
                  <Skeleton className="h-8 w-2/3" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No previous messages</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-green-100 text-green-900'
                          : 'bg-white text-gray-900 border'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.message_body}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(msg.created_at).toLocaleString()}
                        {msg.status === 'failed' && (
                          <span className="text-red-500 ml-1">Failed</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input */}
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={messageBody}
                onChange={(e) => { setMessageBody(e.target.value); setError(null) }}
                placeholder="Type your WhatsApp message..."
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSend()
                  }
                }}
              />
              <p className="text-[10px] text-gray-400">Press Cmd+Enter to send</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={sending || !messageBody.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {sending ? 'Sending...' : 'Send WhatsApp'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
