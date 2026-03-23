'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, X, Plus, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AvailabilitySlot {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
}

function getCurrentWeekDays() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  const days: { date: Date; label: string; short: string; dateStr: string; isPast: boolean }[] = []
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const shortNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push({
      date: d,
      label: dayNames[i],
      short: shortNames[i],
      dateStr: `${y}-${m}-${dd}`,
      isPast: d < today,
    })
  }
  return days
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

function timeOptions() {
  const opts: string[] = []
  for (let h = 9; h <= 20; h++) {
    for (const m of [0, 30]) {
      if (h === 20 && m === 30) break
      opts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return opts
}

const TIME_OPTIONS = timeOptions()

export default function AvailabilitySection({ userId }: { userId: string }) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Bulk add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('17:00')
  const [checkedDays, setCheckedDays] = useState<Set<string>>(new Set())

  // Edit slot state
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const days = getCurrentWeekDays()

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/availability?user_id=${userId}`)
      const { data } = await res.json()
      if (data) setSlots(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadSlots() }, [loadSlots])

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(null); setSuccess(null) }, 3000)
      return () => clearTimeout(t)
    }
  }, [error, success])

  function toggleDay(dateStr: string) {
    setCheckedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function toggleAllDays() {
    const futureDays = days.filter((d) => !d.isPast).map((d) => d.dateStr)
    if (futureDays.every((d) => checkedDays.has(d))) {
      setCheckedDays(new Set())
    } else {
      setCheckedDays(new Set(futureDays))
    }
  }

  async function addSlotsForCheckedDays() {
    if (checkedDays.size === 0) {
      setError('Select at least one day')
      return
    }
    if (newStart >= newEnd) {
      setError('Start time must be before end time')
      return
    }
    setSaving(true)
    setError(null)
    let addedCount = 0
    const errors: string[] = []

    for (const dateStr of Array.from(checkedDays)) {
      try {
        const res = await fetch('/api/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr, start_time: newStart, end_time: newEnd }),
        })
        if (res.ok) {
          addedCount++
        } else {
          const data = await res.json()
          const dayLabel = days.find((d) => d.dateStr === dateStr)?.short ?? dateStr
          errors.push(`${dayLabel}: ${data.error}`)
        }
      } catch {
        errors.push(`Failed for ${dateStr}`)
      }
    }

    if (addedCount > 0) {
      setSuccess(`Added availability for ${addedCount} day${addedCount > 1 ? 's' : ''}`)
      loadSlots()
    }
    if (errors.length > 0) {
      setError(errors.join(' · '))
    }
    if (addedCount > 0 && errors.length === 0) {
      setShowAddForm(false)
      setCheckedDays(new Set())
    }
    setSaving(false)
  }

  async function updateSlot(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, start_time: editStart, end_time: editEnd }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Failed to update')
      else { setSuccess('Updated'); setEditingSlotId(null); loadSlots() }
    } catch { setError('Failed to update') }
    finally { setSaving(false) }
  }

  async function deleteSlot(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to delete') }
      else { setSuccess('Removed'); loadSlots() }
    } catch { setError('Failed to delete') }
    finally { setSaving(false) }
  }

  function getSlotsForDate(dateStr: string) {
    return slots.filter((s) => s.date === dateStr)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-20 bg-gray-50 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-gray-900">My Availability</h3>
          <button
            onClick={() => { setEditing(!editing); setShowAddForm(false); setEditingSlotId(null) }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Edit availability"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        <span className="text-[11px] text-gray-400">
          {days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {days[4].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-5 mt-3 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="mx-5 mt-3 text-[12px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{success}</div>
      )}

      {/* Add form — time at top, days with checkboxes below */}
      {editing && showAddForm && (
        <div className="mx-5 mt-4 mb-2 bg-blue-50/60 border border-blue-100 rounded-xl p-4">
          {/* Time selectors */}
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="flex items-center gap-2">
              <select
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="text-[13px] font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{formatTime(t)}</option>
                ))}
              </select>
              <span className="text-[12px] text-gray-400 font-medium">to</span>
              <select
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="text-[13px] font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_OPTIONS.filter((t) => t > newStart).map((t) => (
                  <option key={t} value={t}>{formatTime(t)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Day checkboxes */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Select Days</p>
              <button
                onClick={toggleAllDays}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                {days.filter((d) => !d.isPast).every((d) => checkedDays.has(d.dateStr)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {days.map((day) => {
                const isChecked = checkedDays.has(day.dateStr)
                const hasExisting = getSlotsForDate(day.dateStr).length > 0

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    disabled={day.isPast}
                    onClick={() => toggleDay(day.dateStr)}
                    className={`relative flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-lg border text-center transition-all ${
                      day.isPast
                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                        : isChecked
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <span className={`text-[12px] font-semibold ${isChecked ? 'text-white' : ''}`}>{day.short}</span>
                    <span className={`text-[10px] ${isChecked ? 'text-blue-100' : 'text-gray-400'}`}>
                      {day.date.getDate()} {day.date.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    {hasExisting && !isChecked && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={addSlotsForCheckedDays}
              disabled={saving || checkedDays.size === 0}
              className="h-8 text-[12px] px-4"
            >
              {saving ? 'Adding...' : `Apply to ${checkedDays.size} Day${checkedDays.size !== 1 ? 's' : ''}`}
            </Button>
            <button
              onClick={() => { setShowAddForm(false); setCheckedDays(new Set()) }}
              className="h-8 px-3 text-[12px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Slot button */}
      {editing && !showAddForm && (
        <div className="px-5 pt-3">
          <button
            onClick={() => { setShowAddForm(true); setCheckedDays(new Set()); setNewStart('09:00'); setNewEnd('17:00') }}
            className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Time Slot
          </button>
        </div>
      )}

      {/* Weekly grid — display only */}
      <div className="grid grid-cols-5 divide-x divide-gray-100 border-t border-gray-100 mt-2">
        {days.map((day) => {
          const daySlots = getSlotsForDate(day.dateStr)
          const isToday = day.date.toDateString() === new Date().toDateString()

          return (
            <div key={day.dateStr} className={`p-3 min-h-[100px] ${day.isPast ? 'bg-gray-50/50' : ''}`}>
              {/* Day header */}
              <div className="text-center mb-2">
                <p className={`text-[12px] font-semibold ${
                  isToday ? 'text-blue-600' : day.isPast ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  {day.label}
                </p>
                <p className="text-[10px] text-gray-400">
                  {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>

              {/* Slots */}
              {daySlots.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center mt-3">Slots Unavailable</p>
              )}

              <div className="space-y-1.5">
                {daySlots.map((slot) => {
                  if (editingSlotId === slot.id) {
                    return (
                      <div key={slot.id} className="bg-blue-50 rounded-lg p-2 space-y-1.5">
                        <select
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5"
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>{formatTime(t)}</option>
                          ))}
                        </select>
                        <select
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5"
                        >
                          {TIME_OPTIONS.filter((t) => t > editStart).map((t) => (
                            <option key={t} value={t}>{formatTime(t)}</option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateSlot(slot.id)}
                            disabled={saving}
                            className="flex-1 bg-blue-600 text-white text-[10px] rounded py-0.5 hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSlotId(null)}
                            className="flex-1 bg-gray-200 text-gray-600 text-[10px] rounded py-0.5 hover:bg-gray-300"
                          >
                            <X className="w-3 h-3 mx-auto" />
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={slot.id}
                      className="group bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center"
                    >
                      <p className="text-[11px] text-emerald-700 font-medium">
                        {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                      </p>
                      {editing && (
                        <div className="flex gap-1 justify-center mt-1">
                          <button
                            onClick={() => {
                              setEditingSlotId(slot.id)
                              setEditStart(slot.start_time.slice(0, 5))
                              setEditEnd(slot.end_time.slice(0, 5))
                            }}
                            className="text-blue-600 hover:text-blue-700 p-0.5"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteSlot(slot.id)}
                            disabled={saving}
                            className="text-red-500 hover:text-red-600 p-0.5 disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
