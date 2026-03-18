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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ClipboardList, Plus, PenLine, Trash2, GripVertical,
  Star, ToggleLeft, FileText, ChevronRight, AlertTriangle,
  MoreHorizontal,
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

const RATING_TYPE_CONFIG: Record<string, { icon: typeof Star; label: string; color: string; bgColor: string }> = {
  rating: { icon: Star, label: '1-5 Rating', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-100' },
  yes_no: { icon: ToggleLeft, label: 'Yes / No', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-100' },
  text: { icon: FileText, label: 'Text', color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-100' },
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
      <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
        <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Access Denied</p>
        <p className="text-sm text-gray-400 mt-1">Only administrators can manage scorecards.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Create evaluation scorecards for standardized interview assessments</p>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Scorecard
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-6">
              <Skeleton className="h-5 w-48 mb-3" />
              <Skeleton className="h-4 w-72 mb-5" />
              <div className="flex gap-3">
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : scorecards.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ClipboardList className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium mb-1">No scorecards yet</p>
          <p className="text-sm text-gray-400 mb-4 max-w-xs mx-auto">
            Create scorecards to standardize your interview evaluation process
          </p>
          <Button size="sm" onClick={openCreate} variant="outline" className="gap-1.5">
            <Plus className="w-4 h-4" /> Create First Scorecard
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {scorecards.map((sc) => {
            const criteriaList = sc.scorecard_template_criteria ?? []
            const criteriaCount = criteriaList.length
            const isExpanded = expandedId === sc.id
            const totalWeight = criteriaList.reduce((sum, c) => sum + c.weight, 0)

            // Count by type
            const typeCounts = criteriaList.reduce<Record<string, number>>((acc, c) => {
              acc[c.rating_type] = (acc[c.rating_type] || 0) + 1
              return acc
            }, {})

            return (
              <div
                key={sc.id}
                className="group rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all duration-200 overflow-hidden"
              >
                {/* Card Header */}
                <div
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : sc.id)}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    sc.is_active ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'
                  }`}>
                    <ClipboardList className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-[15px] font-semibold text-gray-900 truncate">{sc.title}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        sc.is_active
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}>
                        {sc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {sc.description && (
                      <p className="text-[12px] text-gray-400 mt-0.5 truncate">{sc.description}</p>
                    )}
                  </div>

                  {/* Quick Stats */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-gray-400">{criteriaCount} criteria</p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => openEdit(sc)} className="gap-2 text-[13px]">
                          <PenLine className="w-3.5 h-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(sc.id)}
                          className="gap-2 text-[13px] text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {/* Type Pills Row */}
                {!isExpanded && criteriaCount > 0 && (
                  <div className="px-6 pb-3.5 flex items-center gap-2">
                    {Object.entries(typeCounts).map(([type, count]) => {
                      const config = RATING_TYPE_CONFIG[type]
                      if (!config) return null
                      const TypeIcon = config.icon
                      return (
                        <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bgColor} ${config.color}`}>
                          <TypeIcon className="w-3 h-3" />
                          {count} {config.label}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Expanded Criteria */}
                {isExpanded && criteriaList.length > 0 && (
                  <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/30">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Evaluation Criteria</p>
                      <p className="text-[11px] text-gray-400">Total weight: <span className="font-semibold tabular-nums">{totalWeight}</span></p>
                    </div>
                    <div className="space-y-2">
                      {[...criteriaList]
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((c, i) => {
                          const typeConfig = RATING_TYPE_CONFIG[c.rating_type] || RATING_TYPE_CONFIG.rating
                          const TypeIcon = typeConfig.icon
                          return (
                            <div key={c.id || i} className="flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-3.5 py-2.5">
                              <span className="text-[11px] font-bold text-gray-300 w-5 text-center tabular-nums">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-gray-800">{c.name}</p>
                                {c.description && <p className="text-[11px] text-gray-400 truncate mt-0.5">{c.description}</p>}
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${typeConfig.bgColor} ${typeConfig.color}`}>
                                <TypeIcon className="w-3 h-3" />
                                {typeConfig.label}
                              </span>
                              <span className="text-[11px] font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 tabular-nums shrink-0">
                                w:{c.weight}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-gray-100 px-6 py-2.5 flex items-center gap-6 text-[12px] text-gray-400">
                  <span className="tabular-nums">{criteriaCount} {criteriaCount === 1 ? 'criterion' : 'criteria'}</span>
                  <span className="w-px h-3 bg-gray-200" />
                  <span>Total weight: {totalWeight}</span>
                </div>
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
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[13px] px-3 py-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Title <span className="text-red-400">*</span></Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. HR Round, Technical Round"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Status</Label>
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
              <Label className="text-[12px] text-gray-500">Description</Label>
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
                <Label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                  Evaluation Criteria <span className="text-red-400">*</span>
                </Label>
                <button onClick={addCriteria} className="text-[12px] text-blue-600 hover:text-blue-700 font-medium">
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
                                    {(() => { const cfg = RATING_TYPE_CONFIG[rt.value]; const I = cfg?.icon || Star; return <I className="w-3 h-3" /> })()}
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
                    {criteria.filter((c) => c.name.trim()).map((c, i) => {
                      const typeConfig = RATING_TYPE_CONFIG[c.rating_type] || RATING_TYPE_CONFIG.rating
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-blue-400 w-4">{i + 1}.</span>
                          <span className="text-xs font-medium text-gray-700 flex-1">{c.name}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-500">
                            {(() => { const I = typeConfig.icon; return <I className="w-3 h-3" /> })()}
                            {typeConfig.label}
                          </span>
                          <span className="text-[10px] text-blue-400">w:{c.weight}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : (editingId ? 'Update Scorecard' : 'Create Scorecard')}
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
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
