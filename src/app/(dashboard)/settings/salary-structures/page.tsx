'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser, useRole } from '@/lib/hooks/use-user'
import { buildSalaryComponentsFromStructure } from '@/lib/services/salary-structures'
import type { SalaryStructure, SalaryStructureComponent, SalaryComponentCalcType, SalaryComponentSection } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus, Pencil, Trash2, Copy, ArrowLeft, X,
  TrendingUp, Building2, ArrowDownCircle, Star, MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const CALC_TYPES: { value: SalaryComponentCalcType; label: string }[] = [
  { value: 'percentage_of_ctc', label: '% of CTC' },
  { value: 'percentage_of_basic', label: '% of Basic' },
  { value: 'fixed', label: 'Fixed (Monthly)' },
]

const SECTIONS: { value: SalaryComponentSection; label: string }[] = [
  { value: 'earnings', label: 'Earnings' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'employer', label: 'Employer Contribution' },
]

const SECTION_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; color: string; dotColor: string }> = {
  earnings: { label: 'Earnings', icon: TrendingUp, color: 'text-emerald-600', dotColor: 'bg-emerald-500' },
  employer: { label: 'Employer Contributions', icon: Building2, color: 'text-blue-600', dotColor: 'bg-blue-500' },
  deduction: { label: 'Deductions', icon: ArrowDownCircle, color: 'text-amber-600', dotColor: 'bg-amber-500' },
}

function emptyComponent(): SalaryStructureComponent {
  return { name: '', type: 'percentage_of_ctc', value: 0, section: 'earnings' }
}

export default function SalaryStructuresPage() {
  const { organization } = useUser()
  const { isAdmin } = useRole()
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState<SalaryStructure | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDefault, setFormDefault] = useState(false)
  const [formComponents, setFormComponents] = useState<SalaryStructureComponent[]>([])

  // Preview
  const [previewCtc, setPreviewCtc] = useState(1200000)

  const fetchStructures = useCallback(async () => {
    if (!organization) return
    setLoading(true)
    const res = await fetch('/api/salary-structures')
    const json = await res.json()
    setStructures(json.data || [])
    setLoading(false)
  }, [organization])

  useEffect(() => {
    fetchStructures()
  }, [fetchStructures])

  function openEdit(structure: SalaryStructure) {
    setEditing(structure)
    setIsNew(false)
    setFormName(structure.name)
    setFormDescription(structure.description || '')
    setFormDefault(structure.is_default)
    setFormComponents([...structure.components])
  }

  function openNew() {
    setEditing(null)
    setIsNew(true)
    setFormName('')
    setFormDescription('')
    setFormDefault(false)
    setFormComponents([
      { name: 'Basic', type: 'percentage_of_ctc', value: 30, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 40, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
    ])
  }

  function openClone(structure: SalaryStructure) {
    setEditing(null)
    setIsNew(true)
    setFormName(`${structure.name} (Copy)`)
    setFormDescription(structure.description || '')
    setFormDefault(false)
    setFormComponents([...structure.components])
  }

  function cancelEdit() {
    setEditing(null)
    setIsNew(false)
  }

  function updateComponent(index: number, field: string, value: string | number | boolean) {
    setFormComponents(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  function removeComponent(index: number) {
    setFormComponents(prev => prev.filter((_, i) => i !== index))
  }

  function addComponent() {
    setFormComponents(prev => [...prev, emptyComponent()])
  }

  async function handleSave() {
    if (!formName.trim() || formComponents.length === 0) return
    setSaving(true)

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      is_default: formDefault,
      components: formComponents,
    }

    if (isNew) {
      await fetch('/api/salary-structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else if (editing) {
      await fetch(`/api/salary-structures/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setSaving(false)
    cancelEdit()
    fetchStructures()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this salary structure?')) return
    await fetch(`/api/salary-structures/${id}`, { method: 'DELETE' })
    fetchStructures()
  }

  // Preview calculation
  const previewComponents = buildSalaryComponentsFromStructure(previewCtc, formComponents)
  const previewEarnings = previewComponents.filter(c => c.section === 'earnings')
  const previewEmployer = previewComponents.filter(c => c.section === 'employer')
  const previewDeductions = previewComponents.filter(c => c.section === 'deduction')
  const earningsTotal = previewEarnings.reduce((s, c) => s + c.annual, 0)
  const employerTotal = previewEmployer.reduce((s, c) => s + c.annual, 0)
  const deductionsTotal = previewDeductions.reduce((s, c) => s + c.annual, 0)

  const fmtNum = (n: number) => n.toLocaleString('en-IN')

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-500">
        Only admins can manage salary structures.
      </div>
    )
  }

  // ── EDIT / CREATE VIEW ──
  if (isNew || editing) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold">{isNew ? 'Create Salary Structure' : 'Edit Salary Structure'}</h1>
        </div>

        {/* Basic info */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Standard CTC (with PF)" />
              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={formDefault} onCheckedChange={setFormDefault} />
                  <Label>Set as Default</Label>
                </div>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} placeholder="Brief description of this salary structure" />
            </div>
          </CardContent>
        </Card>

        {/* Components editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Components</CardTitle>
              <Button variant="outline" size="sm" onClick={addComponent}>
                <Plus className="w-4 h-4 mr-1" /> Add Component
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_150px_100px_160px_80px_40px] bg-gray-100 border-b">
                <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Component Name</span>
                <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Calculation</span>
                <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Value</span>
                <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Section</span>
                <span className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Balance</span>
                <span />
              </div>
              {formComponents.map((comp, i) => (
                <div key={i} className="grid grid-cols-[1fr_150px_100px_160px_80px_40px] border-b last:border-b-0 items-center">
                  <div className="px-2 py-1.5">
                    <Input
                      value={comp.name}
                      onChange={e => updateComponent(i, 'name', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Component name"
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <Select value={comp.type} onValueChange={v => updateComponent(i, 'type', v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CALC_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="px-2 py-1.5">
                    <Input
                      type="number"
                      value={comp.is_balancing ? '' : comp.value}
                      onChange={e => updateComponent(i, 'value', Number(e.target.value) || 0)}
                      className="h-8 text-sm"
                      disabled={!!comp.is_balancing}
                      placeholder={comp.is_balancing ? 'Auto' : '0'}
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <Select value={comp.section} onValueChange={v => updateComponent(i, 'section', v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={!!comp.is_balancing}
                      onCheckedChange={v => updateComponent(i, 'is_balancing', v)}
                    />
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => removeComponent(i)} className="text-gray-400 hover:text-red-500 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preview</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-500">Sample CTC:</Label>
                <Input
                  type="number"
                  value={previewCtc}
                  onChange={e => setPreviewCtc(Number(e.target.value) || 0)}
                  className="w-40 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {previewComponents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Add components and enter a sample CTC to see preview</p>
            ) : (
              <div className="border rounded-lg overflow-hidden text-sm">
                {/* Earnings */}
                {previewEarnings.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 bg-gray-50 border-b font-semibold">
                      <span className="px-3 py-2">EARNINGS</span>
                      <span className="px-3 py-2 text-right">Monthly</span>
                      <span className="px-3 py-2 text-right">Annual</span>
                    </div>
                    {previewEarnings.map((c, i) => (
                      <div key={i} className="grid grid-cols-3 border-b">
                        <span className="px-3 py-1.5 text-gray-600">{c.name}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.monthly)}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.annual)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 border-b bg-blue-50 font-semibold">
                      <span className="px-3 py-2">GROSS (A)</span>
                      <span className="px-3 py-2 text-right">{fmtNum(Math.round(earningsTotal / 12))}</span>
                      <span className="px-3 py-2 text-right">{fmtNum(earningsTotal)}</span>
                    </div>
                  </>
                )}
                {/* Employer */}
                {previewEmployer.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 bg-gray-50 border-b font-semibold">
                      <span className="px-3 py-2">EMPLOYER CONTRIBUTIONS (B)</span>
                      <span className="px-3 py-2 text-right"></span>
                      <span className="px-3 py-2 text-right"></span>
                    </div>
                    {previewEmployer.map((c, i) => (
                      <div key={i} className="grid grid-cols-3 border-b">
                        <span className="px-3 py-1.5 text-gray-600">{c.name}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.monthly)}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.annual)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 border-b bg-indigo-50 font-semibold">
                      <span className="px-3 py-2">TOTAL CTC (A + B)</span>
                      <span className="px-3 py-2 text-right">{fmtNum(Math.round((earningsTotal + employerTotal) / 12))}</span>
                      <span className="px-3 py-2 text-right">{fmtNum(earningsTotal + employerTotal)}</span>
                    </div>
                  </>
                )}
                {/* Deductions */}
                {previewDeductions.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 bg-gray-50 border-b font-semibold">
                      <span className="px-3 py-2">DEDUCTIONS (C)</span>
                      <span className="px-3 py-2 text-right"></span>
                      <span className="px-3 py-2 text-right"></span>
                    </div>
                    {previewDeductions.map((c, i) => (
                      <div key={i} className="grid grid-cols-3 border-b">
                        <span className="px-3 py-1.5 text-gray-600">{c.name}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.monthly)}</span>
                        <span className="px-3 py-1.5 text-right text-gray-600">{fmtNum(c.annual)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 bg-green-50 font-semibold">
                      <span className="px-3 py-2">NET PAY (A - C)</span>
                      <span className="px-3 py-2 text-right">{fmtNum(Math.round((earningsTotal - deductionsTotal) / 12))}</span>
                      <span className="px-3 py-2 text-right">{fmtNum(earningsTotal - deductionsTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !formName.trim() || formComponents.length === 0}>
            {saving ? 'Saving...' : isNew ? 'Create Structure' : 'Save Changes'}
          </Button>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Define salary breakdown templates used when creating offer letters
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New Structure
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-5">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border border-gray-200 p-6">
              <Skeleton className="h-5 w-48 mb-3" />
              <Skeleton className="h-4 w-72 mb-5" />
              <div className="flex gap-8">
                <Skeleton className="h-24 w-1/3" />
                <Skeleton className="h-24 w-1/3" />
                <Skeleton className="h-24 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : structures.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium mb-1">No salary structures yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first template to use in offer letters</p>
          <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> Create Structure
          </Button>
        </div>
      ) : (
        <div className="grid gap-5">
          {structures.map(structure => {
            const earnings = structure.components.filter(c => c.section === 'earnings')
            const deductions = structure.components.filter(c => c.section === 'deduction')
            const employer = structure.components.filter(c => c.section === 'employer')

            const sections = [
              { key: 'earnings', items: earnings },
              { key: 'employer', items: employer },
              { key: 'deduction', items: deductions },
            ].filter(s => s.items.length > 0)

            return (
              <div
                key={structure.id}
                className="group rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all duration-200"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[15px] font-semibold text-gray-900">{structure.name}</h3>
                    {structure.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                        <Star className="w-3 h-3 fill-blue-500 text-blue-500" />
                        Default
                      </span>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => openEdit(structure)} className="gap-2 text-sm">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openClone(structure)} className="gap-2 text-sm">
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                      </DropdownMenuItem>
                      {!structure.is_default && (
                        <DropdownMenuItem
                          onClick={() => handleDelete(structure.id)}
                          className="gap-2 text-sm text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {structure.description && (
                  <p className="px-6 -mt-2 pb-4 text-sm text-gray-500">{structure.description}</p>
                )}

                {/* Component Sections */}
                <div className="px-6 pb-5">
                  <div className={`grid gap-4 ${sections.length === 3 ? 'grid-cols-3' : sections.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {sections.map(({ key, items }) => {
                      const config = SECTION_CONFIG[key]
                      const SectionIcon = config.icon
                      return (
                        <div key={key} className="rounded-lg bg-gray-50/80 border border-gray-100 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <SectionIcon className={`w-3.5 h-3.5 ${config.color}`} />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              {config.label}
                            </span>
                            <span className="ml-auto text-[11px] text-gray-400 font-medium tabular-nums">
                              {items.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {items.map((c, i) => (
                              <div key={i} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotColor}`} />
                                  <span className="text-[13px] text-gray-700 truncate">{c.name}</span>
                                  {c.is_balancing && (
                                    <span className="text-[10px] font-medium text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded">
                                      BAL
                                    </span>
                                  )}
                                </div>
                                <span className="text-[12px] font-medium text-gray-500 tabular-nums shrink-0">
                                  {c.is_balancing
                                    ? 'Auto'
                                    : c.type === 'fixed'
                                      ? `Rs.${c.value.toLocaleString('en-IN')}/mo`
                                      : `${c.value}%`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Footer Stats */}
                <div className="border-t border-gray-100 px-6 py-3 flex items-center gap-6 text-[12px] text-gray-400">
                  <span className="tabular-nums">{structure.components.length} components</span>
                  <span className="w-px h-3 bg-gray-200" />
                  <span>
                    {structure.components.filter(c => c.is_balancing).length > 0
                      ? `${structure.components.filter(c => c.is_balancing).length} balancing`
                      : 'No balancing component'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
