'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { MapPin, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'

interface Location {
  id: string
  name: string
  created_at: string
}

export default function InterviewLocationsPage() {
  const { toast } = useToast()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function loadLocations() {
    const res = await fetch('/api/interview-locations')
    const json = await res.json()
    if (res.ok) setLocations(json.data || [])
    setLoading(false)
  }

  useEffect(() => { loadLocations() }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const res = await fetch('/api/interview-locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      setLocations(prev => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      toast({ title: 'Location added' })
    } else {
      toast({ variant: 'destructive', title: 'Error', description: json.error })
    }
    setAdding(false)
  }

  async function handleUpdate(id: string) {
    if (!editingName.trim()) return
    setSavingEdit(true)
    const res = await fetch('/api/interview-locations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editingName.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      setLocations(prev => prev.map(l => l.id === id ? { ...l, name: editingName.trim() } : l).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
      toast({ title: 'Location updated' })
    } else {
      toast({ variant: 'destructive', title: 'Error', description: json.error })
    }
    setSavingEdit(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/interview-locations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setLocations(prev => prev.filter(l => l.id !== id))
      toast({ title: 'Location deleted' })
    } else {
      const json = await res.json()
      toast({ variant: 'destructive', title: 'Error', description: json.error })
    }
  }

  return (
    <Card className="rounded-xl border-gray-100">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div>
              <CardTitle className="text-[15px]">Interview Locations</CardTitle>
              <p className="text-[11px] text-gray-400 mt-0.5">Manage office locations for face-to-face interviews</p>
            </div>
          </div>
          <span className="text-[11px] text-gray-400">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new location */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter location name..."
            className="text-[13px]"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            size="sm"
            className="bg-gray-900 hover:bg-gray-800 text-white shrink-0 gap-1.5"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
        </div>

        {/* Location list */}
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">No locations added yet</p>
            <p className="text-[11px] text-gray-300 mt-1">Add your first office location above</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center gap-3 py-2.5 group">
                {editingId === loc.id ? (
                  <>
                    <MapPin className="w-4 h-4 text-gray-300 shrink-0" />
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="text-[13px] h-8 flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(loc.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleUpdate(loc.id)}
                      disabled={savingEdit}
                    >
                      {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="text-[13px] text-gray-700 flex-1">{loc.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                        onClick={() => { setEditingId(loc.id); setEditingName(loc.name) }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(loc.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
