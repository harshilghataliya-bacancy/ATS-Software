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
  Star, ToggleLeft, FileText, ChevronDown, AlertTriangle,
  MoreHorizontal, Weight, FolderPlus,
} from 'lucide-react'

interface CriteriaRow {
  id?: string
  name: string
  description: string
  weight: number
  rating_type: 'rating' | 'yes_no' | 'text'
  display_order: number
  category: string
}

interface ScorecardWithCriteria {
  id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  scorecard_template_criteria: CriteriaRow[]
}

const RATING_TYPE_CONFIG: Record<string, { icon: typeof Star; label: string; shortLabel: string; color: string; bgColor: string }> = {
  rating: { icon: Star, label: '1-5 Rating', shortLabel: 'Rating', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200/60' },
  yes_no: { icon: ToggleLeft, label: 'Yes / No', shortLabel: 'Y/N', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200/60' },
  text: { icon: FileText, label: 'Text', shortLabel: 'Text', color: 'text-slate-600', bgColor: 'bg-slate-50 border-slate-200/60' },
}

// Helper to group criteria by category
function groupByCategory(criteria: CriteriaRow[]): { category: string; items: CriteriaRow[] }[] {
  const map = new Map<string, CriteriaRow[]>()
  for (const c of criteria) {
    const cat = c.category || 'General'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(c)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
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
  const [categories, setCategories] = useState<{ name: string; criteria: CriteriaRow[] }[]>([])

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  // Collapsed categories in expanded view
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

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
    setCategories([{
      name: 'General',
      criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: 'General' }],
    }])
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(sc: ScorecardWithCriteria) {
    setEditingId(sc.id)
    setFormTitle(sc.title)
    setFormDescription(sc.description ?? '')
    setFormActive(sc.is_active)

    const sorted = [...(sc.scorecard_template_criteria ?? [])].sort((a, b) => a.display_order - b.display_order)
    if (sorted.length > 0) {
      const grouped = groupByCategory(sorted)
      setCategories(grouped.map((g) => ({
        name: g.category,
        criteria: g.items.map((c) => ({
          name: c.name,
          description: c.description ?? '',
          weight: c.weight,
          rating_type: c.rating_type as 'rating' | 'yes_no' | 'text',
          display_order: c.display_order,
          category: c.category || 'General',
        })),
      })))
    } else {
      setCategories([{
        name: 'General',
        criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: 'General' }],
      }])
    }
    setError(null)
    setDialogOpen(true)
  }

  function addCategory() {
    setCategories((prev) => [...prev, {
      name: '',
      criteria: [{ name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category: '' }],
    }])
  }

  function removeCategory(catIndex: number) {
    setCategories((prev) => prev.filter((_, i) => i !== catIndex))
  }

  function updateCategoryName(catIndex: number, name: string) {
    setCategories((prev) => prev.map((cat, i) => {
      if (i !== catIndex) return cat
      return {
        ...cat,
        name,
        criteria: cat.criteria.map((c) => ({ ...c, category: name })),
      }
    }))
  }

  function addCriteriaToCategory(catIndex: number) {
    setCategories((prev) => prev.map((cat, i) => {
      if (i !== catIndex) return cat
      return {
        ...cat,
        criteria: [...cat.criteria, {
          name: '', description: '', weight: 5, rating_type: 'rating' as const,
          display_order: cat.criteria.length, category: cat.name,
        }],
      }
    }))
  }

  function removeCriteriaFromCategory(catIndex: number, crIndex: number) {
    setCategories((prev) => prev.map((cat, i) => {
      if (i !== catIndex) return cat
      return { ...cat, criteria: cat.criteria.filter((_, ci) => ci !== crIndex) }
    }))
  }

  function updateCriteriaInCategory(catIndex: number, crIndex: number, field: keyof CriteriaRow, value: string | number) {
    setCategories((prev) => prev.map((cat, i) => {
      if (i !== catIndex) return cat
      return {
        ...cat,
        criteria: cat.criteria.map((c, ci) => ci === crIndex ? { ...c, [field]: value } : c),
      }
    }))
  }

  async function handleSave() {
    if (!organization || !user) return
    if (!formTitle.trim()) { setError('Scorecard title is required'); return }

    // Flatten categories into criteria
    let displayOrder = 0
    const allCriteria: CriteriaRow[] = []
    for (const cat of categories) {
      const catName = cat.name.trim() || 'General'
      for (const c of cat.criteria) {
        if (!c.name.trim()) continue
        allCriteria.push({
          ...c,
          category: catName,
          display_order: displayOrder++,
        })
      }
    }

    if (allCriteria.length === 0) { setError('At least one criteria is required'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    const input = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      is_active: formActive,
      criteria: allCriteria.map((c) => ({
        name: c.name.trim(),
        description: c.description?.trim() || undefined,
        weight: c.weight,
        rating_type: c.rating_type,
        display_order: c.display_order,
        category: c.category,
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

  async function handleSeedDefaults() {
    setSeeding(true)
    try {
      const res = await fetch('/api/scorecards/seed', { method: 'POST' })
      if (res.ok) loadScorecards()
    } catch (err) {
      console.error('[Seed error]', err)
    }
    setSeeding(false)
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

  function toggleCatCollapse(key: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Create evaluation scorecards for standardized interview assessments</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleSeedDefaults} disabled={seeding} className="gap-1.5 h-8 text-xs">
            {seeding ? 'Seeding...' : 'Seed Defaults'}
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Scorecard
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-14 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      ) : scorecards.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <ClipboardList className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium text-sm mb-1">No scorecards yet</p>
          <p className="text-xs text-gray-400 mb-4 max-w-xs mx-auto">
            Create scorecards to standardize your interview evaluation process
          </p>
          <Button size="sm" onClick={openCreate} variant="outline" className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> Create First Scorecard
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            <span>Scorecard</span>
            <span className="w-20 text-center">Criteria</span>
            <span className="w-20 text-center">Weight</span>
            <span className="w-16 text-center">Status</span>
            <span className="w-16" />
          </div>

          {scorecards.map((sc) => {
            const criteriaList = sc.scorecard_template_criteria ?? []
            const criteriaCount = criteriaList.length
            const isExpanded = expandedId === sc.id
            const totalWeight = criteriaList.reduce((sum, c) => sum + c.weight, 0)
            const grouped = groupByCategory([...criteriaList].sort((a, b) => a.display_order - b.display_order))

            const typeCounts = criteriaList.reduce<Record<string, number>>((acc, c) => {
              acc[c.rating_type] = (acc[c.rating_type] || 0) + 1
              return acc
            }, {})

            return (
              <div key={sc.id} className="border-b border-gray-100 last:border-b-0 group">
                {/* Row */}
                <div
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50/60 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : sc.id)}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-900 truncate">{sc.title}</span>
                        <div className="hidden sm:flex items-center gap-1">
                          {Object.entries(typeCounts).map(([type, count]) => {
                            const config = RATING_TYPE_CONFIG[type]
                            if (!config) return null
                            const TypeIcon = config.icon
                            return (
                              <span key={type} className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[9px] font-medium border ${config.bgColor} ${config.color}`}>
                                <TypeIcon className="w-2.5 h-2.5" />
                                {count}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      {sc.description && (
                        <p className="text-[11px] text-gray-400 truncate mt-px">{sc.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="w-20 text-center text-[12px] text-gray-500 tabular-nums">{criteriaCount}</span>
                  <span className="w-20 text-center text-[12px] text-gray-500 tabular-nums flex items-center justify-center gap-1">
                    <Weight className="w-3 h-3 text-gray-300" />
                    {totalWeight}
                  </span>
                  <div className="w-16 flex justify-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      sc.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {sc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="w-16 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={() => openEdit(sc)} className="gap-2 text-[12px]">
                          <PenLine className="w-3 h-3" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteId(sc.id)} className="gap-2 text-[12px] text-red-600 focus:text-red-600">
                          <Trash2 className="w-3 h-3" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Expanded Criteria — grouped by category (Keka-style) */}
                {isExpanded && criteriaList.length > 0 && (
                  <div className="bg-gray-50/50 border-t border-gray-100 px-4 py-3">
                    <div className="ml-6 space-y-2">
                      {grouped.map((group) => {
                        const catKey = `${sc.id}-${group.category}`
                        const isCollapsed = collapsedCats.has(catKey)
                        const catAvgWeight = (group.items.reduce((s, c) => s + c.weight, 0) / group.items.length).toFixed(1)
                        return (
                          <div key={group.category}>
                            {/* Category Header */}
                            <div
                              className="flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-white/50 rounded-md"
                              onClick={(e) => { e.stopPropagation(); toggleCatCollapse(catKey) }}
                            >
                              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`} />
                              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{group.category}</span>
                              <span className="text-[10px] text-gray-400">({group.items.length})</span>
                              <span className="ml-auto text-[10px] text-gray-400 tabular-nums">avg w:{catAvgWeight}</span>
                            </div>
                            {/* Category Items */}
                            {!isCollapsed && (
                              <div className="ml-5 space-y-0.5">
                                {group.items.map((c, i) => {
                                  const typeConfig = RATING_TYPE_CONFIG[c.rating_type] || RATING_TYPE_CONFIG.rating
                                  const TypeIcon = typeConfig.icon
                                  return (
                                    <div key={c.id || i} className="flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-white/70 transition-colors">
                                      <span className="text-[12px] font-medium text-gray-700 flex-1 truncate">{c.name}</span>
                                      {c.description && (
                                        <span className="text-[10px] text-gray-400 truncate max-w-[200px] hidden lg:block">{c.description}</span>
                                      )}
                                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[9px] font-medium border shrink-0 ${typeConfig.bgColor} ${typeConfig.color}`}>
                                        <TypeIcon className="w-2.5 h-2.5" />
                                        {typeConfig.shortLabel}
                                      </span>
                                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0 w-8 text-right">w:{c.weight}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
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

      {/* Create/Edit Dialog — Category-based */}
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

            {/* Categories + Criteria Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                  Categories & Criteria <span className="text-red-400">*</span>
                </Label>
                <button onClick={addCategory} className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-medium">
                  <FolderPlus className="w-3.5 h-3.5" /> Add Category
                </button>
              </div>

              <div className="space-y-4">
                {categories.map((cat, catIndex) => (
                  <div key={catIndex} className="rounded-lg border border-gray-200 overflow-hidden">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-200">
                      <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                      <Input
                        value={cat.name}
                        onChange={(e) => updateCategoryName(catIndex, e.target.value)}
                        placeholder="Category name (e.g. Sales Skills, Communication)"
                        className="h-7 text-sm font-semibold bg-white border-gray-200 flex-1"
                      />
                      <button
                        onClick={() => addCriteriaToCategory(catIndex)}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap px-2"
                      >
                        + Criteria
                      </button>
                      {categories.length > 1 && (
                        <button
                          onClick={() => removeCategory(catIndex)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Criteria inside this category */}
                    <div className="p-2 space-y-2">
                      {cat.criteria.map((c, crIndex) => (
                        <div key={crIndex} className="rounded-md border border-gray-100 bg-white p-2.5 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <div className="grid grid-cols-[1fr_120px_80px] gap-2">
                                <Input
                                  value={c.name}
                                  onChange={(e) => updateCriteriaInCategory(catIndex, crIndex, 'name', e.target.value)}
                                  placeholder="Criteria name"
                                  className="h-8 text-sm"
                                />
                                <Select
                                  value={c.rating_type}
                                  onValueChange={(v) => updateCriteriaInCategory(catIndex, crIndex, 'rating_type', v)}
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
                                  onChange={(e) => updateCriteriaInCategory(catIndex, crIndex, 'weight', Number(e.target.value))}
                                  className="h-8 text-sm text-center"
                                  title="Weight (1-10)"
                                />
                              </div>
                              <Input
                                value={c.description}
                                onChange={(e) => updateCriteriaInCategory(catIndex, crIndex, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="h-7 text-xs text-gray-500"
                              />
                            </div>
                            {cat.criteria.length > 1 && (
                              <button
                                onClick={() => removeCriteriaFromCategory(catIndex, crIndex)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors mt-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
