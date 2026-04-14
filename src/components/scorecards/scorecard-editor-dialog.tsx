'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { SCORECARD_RATING_TYPES } from '@/lib/constants'
import { X, GripVertical, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScorecardCriterion {
  name: string
  description: string
  weight: number
  rating_type: 'rating' | 'yes_no' | 'text'
  display_order: number
  category: string
}

export interface ScorecardFormData {
  title: string
  label: string
  description: string
  criteria: ScorecardCriterion[]
}

interface ScorecardEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ScorecardFormData
  isEditing: boolean
  onSave: (data: ScorecardFormData) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group criteria by category, preserving order */
function groupByCategory(criteria: ScorecardCriterion[]): { category: string; items: ScorecardCriterion[] }[] {
  const groups: { category: string; items: ScorecardCriterion[] }[] = []
  const seen = new Map<string, number>()
  for (const c of criteria) {
    const cat = c.category || 'General'
    if (seen.has(cat)) {
      groups[seen.get(cat)!].items.push(c)
    } else {
      seen.set(cat, groups.length)
      groups.push({ category: cat, items: [c] })
    }
  }
  return groups
}

/** Flatten category groups back to a flat criteria array */
function flattenGroups(groups: { category: string; items: ScorecardCriterion[] }[]): ScorecardCriterion[] {
  let order = 0
  return groups.flatMap((g) =>
    g.items.map((item) => ({ ...item, category: g.category, display_order: order++ }))
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScorecardEditorDialog({
  open,
  onOpenChange,
  initial,
  isEditing,
  onSave,
}: ScorecardEditorDialogProps) {
  const [title, setTitle] = useState(initial.title)
  const [label, setLabel] = useState(initial.label)
  const [description, setDescription] = useState(initial.description)
  const [groups, setGroups] = useState<{ category: string; items: ScorecardCriterion[] }[]>([])

  // Re-initialize when dialog opens with new data
  useEffect(() => {
    if (open) {
      setTitle(initial.title)
      setLabel(initial.label)
      setDescription(initial.description)
      const g = groupByCategory(initial.criteria)
      setGroups(g.length > 0 ? g : [{ category: 'General', items: [makeEmptyCriterion('General')] }])
    }
  }, [open, initial])

  function makeEmptyCriterion(category: string): ScorecardCriterion {
    return { name: '', description: '', weight: 5, rating_type: 'rating', display_order: 0, category }
  }

  function updateCriterion(gIdx: number, cIdx: number, updates: Partial<ScorecardCriterion>) {
    setGroups((prev) => {
      const next = prev.map((g, gi) =>
        gi === gIdx
          ? { ...g, items: g.items.map((item, ci) => ci === cIdx ? { ...item, ...updates } : item) }
          : g
      )
      return next
    })
  }

  function removeCriterion(gIdx: number, cIdx: number) {
    setGroups((prev) => {
      const next = prev.map((g, gi) =>
        gi === gIdx ? { ...g, items: g.items.filter((_, ci) => ci !== cIdx) } : g
      )
      // Remove empty groups (except if it's the last one)
      return next.filter((g, i) => g.items.length > 0 || (next.length === 1 && i === 0))
    })
  }

  function addCriterion(gIdx: number) {
    setGroups((prev) =>
      prev.map((g, gi) =>
        gi === gIdx ? { ...g, items: [...g.items, makeEmptyCriterion(g.category)] } : g
      )
    )
  }

  function addCategory() {
    setGroups((prev) => [...prev, { category: '', items: [makeEmptyCriterion('')] }])
  }

  function updateCategoryName(gIdx: number, name: string) {
    setGroups((prev) =>
      prev.map((g, gi) => gi === gIdx ? { ...g, category: name } : g)
    )
  }

  function removeCategory(gIdx: number) {
    setGroups((prev) => prev.filter((_, gi) => gi !== gIdx))
  }

  function handleSave() {
    onSave({
      title,
      label,
      description,
      criteria: flattenGroups(groups),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Scorecard' : 'Create Scorecard'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Edit this job-specific scorecard. Changes only apply to this job.'
              : 'Create a new scorecard for this job.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title & Label */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input
                placeholder="e.g. Technical Round"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                placeholder="e.g. Round 1, Final"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              placeholder="What this scorecard evaluates…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          {/* Categories & Criteria */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Categories & Criteria <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 gap-1 h-7 text-xs"
                onClick={addCategory}
              >
                <Plus className="w-3.5 h-3.5" /> Add Category
              </Button>
            </div>

            {groups.map((group, gIdx) => (
              <div key={gIdx} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
                {/* Category header */}
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                  <Input
                    value={group.category}
                    onChange={(e) => updateCategoryName(gIdx, e.target.value)}
                    placeholder="Category name"
                    className="font-medium text-sm bg-white"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 gap-1 h-8 text-xs shrink-0"
                    onClick={() => addCriterion(gIdx)}
                  >
                    + Criteria
                  </Button>
                  {groups.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-600 px-1.5 h-8 shrink-0"
                      onClick={() => removeCategory(gIdx)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Criteria under this category */}
                {group.items.map((c, cIdx) => (
                  <div key={cIdx} className="ml-6 rounded-lg border border-gray-100 bg-white p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Criteria name"
                        value={c.name}
                        className="text-sm flex-1"
                        onChange={(e) => updateCriterion(gIdx, cIdx, { name: e.target.value })}
                      />
                      <Select
                        value={c.rating_type}
                        onValueChange={(val) => updateCriterion(gIdx, cIdx, { rating_type: val as 'rating' | 'yes_no' | 'text' })}
                      >
                        <SelectTrigger className="w-28 shrink-0 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCORECARD_RATING_TYPES.map((rt) => (
                            <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={c.weight}
                        className="w-14 text-sm text-center shrink-0"
                        title="Weight (1-10)"
                        onChange={(e) => updateCriterion(gIdx, cIdx, { weight: Number(e.target.value) })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600 px-1 h-7 shrink-0"
                        onClick={() => removeCriterion(gIdx, cIdx)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Description (optional)"
                      value={c.description}
                      className="text-xs"
                      onChange={(e) => updateCriterion(gIdx, cIdx, { description: e.target.value })}
                    />
                  </div>
                ))}

                {group.items.length === 0 && (
                  <p className="ml-6 text-xs text-gray-400 py-2">No criteria yet. Click &quot;+ Criteria&quot; to add one.</p>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!title.trim()}
              onClick={handleSave}
            >
              {isEditing ? 'Save Changes' : 'Create Scorecard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
