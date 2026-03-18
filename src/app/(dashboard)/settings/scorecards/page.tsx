'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getScorecards, createScorecard, updateScorecard, deleteScorecard } from '@/lib/services/scorecards'
import { SCORECARD_RATING_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  ClipboardList, Plus, PenLine, Trash2, GripVertical,
  Star, ToggleLeft, FileText, ChevronRight, AlertTriangle,
} from 'lucide-react'

interface CriteriaRow {
  id?: string
  name: string
  description: string
  weight: number
  rating_type: 'rating' | 'yes_no' | 'text'
  display_order: number
}

interface ScorecardWithCriteria {
  id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  scorecard_template_criteria: CriteriaRow[]
}

const RATING_TYPE_ICONS: Record<string, React.ReactNode> = {
  rating: <Star className="w-3.5 h-3.5" />,
  yes_no: <ToggleLeft className="w-3.5 h-3.5" />,
  text: <FileText className="w-3.5 h-3.5" />,
}

export default function ScorecardsPage() {
  const { organization } = useUser()
  const { user } = useUser()
  const { isAdmin } = useRole()

  const [scorecards, setScorecards] = useState<ScorecardWithCriteria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [criteria, setCriteria] = useState<CriteriaRow[]>([])

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadScorecards = useCallback(async () => {
    if (!organization) return
    const supabase = createClient()
    const { data, error: fetchError } = await getScorecards(supabase, organization.id)
    if (fetchError) setError(fetchError.message)
    else setScorecards((data ?? []) as ScorecardWithCriteria[])
    setLoading(false)
  }, [organization])

  useEffect(() => { if (organization) loadScorecards() }, [organization, loadScorecards])

  function openCreate() {
    setEditingId(null)
    setFormTitle('')
    setFormDescription('')
    setFormActive(true)
    setCriteria([{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0 }])
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(sc: ScorecardWithCriteria) {
    setEditingId(sc.id)
    setFormTitle(sc.title)
    setFormDescription(sc.description ?? '')
    setFormActive(sc.is_active)
    const sorted = [...(sc.scorecard_template_criteria ?? [])].sort((a, b) => a.display_order - b.display_order)
    setCriteria(sorted.length > 0 ? sorted.map((c) => ({
      name: c.name,
      description: c.description ?? '',
      weight: c.weight,
      rating_type: c.rating_type as 'rating' | 'yes_no' | 'text',
      display_order: c.display_order,
    })) : [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0 }])
    setError(null)
    setDialogOpen(true)
  }

  function addCriteria() {
    setCriteria((prev) => [...prev, {
      name: '',
      description: '',
      weight: 5,
      rating_type: 'rating',
      display_order: prev.length,
    }])
  }

  function removeCriteria(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, display_order: i })))
  }

  function updateCriteria(index: number, field: keyof CriteriaRow, value: string | number) {
    setCriteria((prev) => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  async function handleSave() {
    if (!organization || !user) return
    if (!formTitle.trim()) { setError('Scorecard title is required'); return }
    const validCriteria = criteria.filter((c) => c.name.trim())
    if (validCriteria.length === 0) { setError('At least one criteria is required'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    const input = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      is_active: formActive,
      criteria: validCriteria.map((c, i) => ({
        name: c.name.trim(),
        description: c.description?.trim() || undefined,
        weight: c.weight,
        rating_type: c.rating_type,
        display_order: i,
      })),
    }

    if (editingId) {
      const { error: err } = await updateScorecard(supabase, editingId, organization.id, input)
      if (err) setError(err.message)
      else { setDialogOpen(false); loadScorecards() }
    } else {
      const { error: err } = await createScorecard(supabase, organization.id, user.id, input)
      if (err) setError(err.message)
      else { setDialogOpen(false); loadScorecards() }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!organization || !deleteId) return
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await deleteScorecard(supabase, deleteId, organization.id)
    if (err) setError(err.message)
    else { setDeleteId(null); loadScorecards() }
    setDeleting(false)
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-1">Only administrators can manage scorecards.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Scorecards</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create evaluation scorecards for interview rounds</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-3.5 h-3.5" /> New Scorecard
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : scorecards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-6 h-6 text-gray-300" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">No scorecards yet</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Create scorecards to standardize your interview evaluation process across different rounds.
          </p>
          <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5" /> Create First Scorecard
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {scorecards.map((sc) => {
            const criteriaCount = sc.scorecard_template_criteria?.length ?? 0
            const isExpanded = expandedId === sc.id
            return (
              <div key={sc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : sc.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{sc.title}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        sc.is_active
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-gray-50 text-gray-400 border border-gray-100'
                      }`}>
                        {sc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {sc.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{sc.description}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {criteriaCount} {criteriaCount === 1 ? 'criterion' : 'criteria'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(sc) }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(sc.id) }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {isExpanded && sc.scorecard_template_criteria?.length > 0 && (
                  <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Evaluation Criteria</p>
                    <div className="space-y-2">
                      {[...sc.scorecard_template_criteria]
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((c, i) => {
                          const ratingType = SCORECARD_RATING_TYPES.find((rt) => rt.value === c.rating_type)
                          return (
                            <div key={c.id || i} className="flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2">
                              <span className="text-[10px] font-bold text-gray-300 w-5 text-center">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800">{c.name}</p>
                                {c.description && <p className="text-[10px] text-gray-400 truncate">{c.description}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                  {RATING_TYPE_ICONS[c.rating_type]}
                                  {ratingType?.label}
                                </span>
                                <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                  w:{c.weight}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Scorecard' : 'New Scorecard'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Title <span className="text-red-400">*</span></Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. HR Round, Technical Round"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Status</Label>
                <Select value={formActive ? 'active' : 'inactive'} onValueChange={(v) => setFormActive(v === 'active')}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Description</Label>
              <Textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of when to use this scorecard..."
                className="text-sm resize-none"
              />
            </div>

            {/* Criteria Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                  Evaluation Criteria <span className="text-red-400">*</span>
                </Label>
                <button
                  onClick={addCriteria}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add Criteria
                </button>
              </div>

              <div className="space-y-3">
                {criteria.map((c, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-gray-300 mt-2 shrink-0" />
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-[1fr_120px_80px] gap-2">
                          <Input
                            value={c.name}
                            onChange={(e) => updateCriteria(index, 'name', e.target.value)}
                            placeholder="Criteria name (e.g. Communication)"
                            className="h-8 text-sm"
                          />
                          <Select
                            value={c.rating_type}
                            onValueChange={(v) => updateCriteria(index, 'rating_type', v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCORECARD_RATING_TYPES.map((rt) => (
                                <SelectItem key={rt.value} value={rt.value}>
                                  <span className="flex items-center gap-1.5">
                                    {RATING_TYPE_ICONS[rt.value]}
                                    {rt.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={c.weight}
                            onChange={(e) => updateCriteria(index, 'weight', Number(e.target.value))}
                            className="h-8 text-sm text-center"
                            title="Weight (1-10)"
                          />
                        </div>
                        <Input
                          value={c.description}
                          onChange={(e) => updateCriteria(index, 'description', e.target.value)}
                          placeholder="Description (optional)"
                          className="h-7 text-xs text-gray-500"
                        />
                      </div>
                      {criteria.length > 1 && (
                        <button
                          onClick={() => removeCriteria(index)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors mt-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {criteria.some((c) => c.name.trim()) && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-2">Preview</p>
                  <div className="space-y-1.5">
                    {criteria.filter((c) => c.name.trim()).map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-400 w-4">{i + 1}.</span>
                        <span className="text-xs font-medium text-gray-700 flex-1">{c.name}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-blue-500">
                          {RATING_TYPE_ICONS[c.rating_type]}
                          {SCORECARD_RATING_TYPES.find((rt) => rt.value === c.rating_type)?.label}
                        </span>
                        <span className="text-[10px] text-blue-400">w:{c.weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? 'Saving…' : (editingId ? 'Update Scorecard' : 'Create Scorecard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Scorecard
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete this scorecard? This will remove all its criteria. Interviews already using this scorecard will no longer have a linked scorecard.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button size="sm" onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
