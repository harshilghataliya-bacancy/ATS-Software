'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { REMINDER_INTERVAL_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Bell, Clock, CheckCircle2, Loader2 } from 'lucide-react'

export default function NotificationsPage() {
  const { organization } = useUser()
  const [intervals, setIntervals] = useState<number[]>([60])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const fetchSettings = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data } = await supabase
      .from('organizations')
      .select('reminder_intervals')
      .eq('id', organization.id)
      .single()
    if (data?.reminder_intervals) {
      setIntervals(data.reminder_intervals)
    }
    setLoading(false)
  }, [organization])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const toggleInterval = (value: number) => {
    setIntervals((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value].sort((a, b) => b - a)
    )
    setSaved(false)
  }

  const handleSave = async () => {
    if (!organization) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': organization.id,
        },
        body: JSON.stringify({ reminder_intervals: intervals }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Interview Reminders Card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Bell className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Interview Reminders</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Send reminder emails to candidates and interviewers before scheduled interviews
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-3 block">
              Send reminders before interview
            </Label>
            <p className="text-xs text-gray-500 mb-4">
              Select when reminder emails should be sent. You can choose multiple intervals.
              Each reminder sends one email to the candidate and one to each interviewer, with the recruiter in CC.
            </p>

            <div className="space-y-3">
              {REMINDER_INTERVAL_OPTIONS.map((option) => {
                const isActive = intervals.includes(option.value)
                return (
                  <div
                    key={option.value}
                    className={`flex items-center justify-between p-3.5 rounded-lg border transition-all cursor-pointer ${
                      isActive
                        ? 'border-indigo-200 bg-indigo-50/50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => toggleInterval(option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                        {option.label}
                      </span>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => toggleInterval(option.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {intervals.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                No reminders selected. Interview reminder emails will not be sent.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cron Setup Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Setup Required</h4>
        <p className="text-xs text-gray-500 leading-relaxed">
          Interview reminders require an external cron service (like cron-job.org) to call your
          reminder endpoint every 5 minutes. Set up a GET request to{' '}
          <code className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 text-[11px]">
            {typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com'}/api/cron/interview-reminders
          </code>{' '}
          with the header{' '}
          <code className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 text-[11px]">
            Authorization: Bearer YOUR_CRON_SECRET
          </code>.
          Set the <code className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 text-[11px]">CRON_SECRET</code> environment
          variable in your deployment.
        </p>
      </div>
    </div>
  )
}
