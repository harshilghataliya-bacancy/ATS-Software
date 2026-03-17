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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2, Copy, ArrowLeft, X } from 'lucide-react'

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

function emptyComponent(): SalaryStructureComponent {
  return { name: '', type: 'percentage_of_ctc', value: 0, section: 'earnings' }
}

export default function SalaryStructuresPage() {
  const { organization, user } = useUser()
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
      <div className="max-w-5xl mx-auto p-6 space-y-6">
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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salary Structures</h1>
          <p className="text-sm text-gray-500 mt-1">Define salary breakdown templates used when creating offer letters</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> New Structure
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : structures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            No salary structures yet. Click &quot;New Structure&quot; to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {structures.map(structure => {
            const earnings = structure.components.filter(c => c.section === 'earnings')
            const deductions = structure.components.filter(c => c.section === 'deduction')
            const employer = structure.components.filter(c => c.section === 'employer')

            return (
              <Card key={structure.id} className="hover:border-blue-200 transition-colors">
                <CardContent className="py-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{structure.name}</h3>
                        {structure.is_default && <Badge variant="secondary" className="bg-blue-100 text-blue-700">Default</Badge>}
                      </div>
                      {structure.description && (
                        <p className="text-sm text-gray-500 mb-3">{structure.description}</p>
                      )}
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>{earnings.length} earnings</span>
                        {employer.length > 0 && <span>{employer.length} employer contributions</span>}
                        {deductions.length > 0 && <span>{deductions.length} deductions</span>}
                      </div>
                      {/* Component names summary */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {structure.components.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {c.name}
                            {c.type === 'fixed' ? ` (Rs.${c.value}/mo)` : ` (${c.value}%)`}
                            {c.is_balancing ? ' *' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <Button variant="ghost" size="sm" onClick={() => openClone(structure)} title="Clone">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(structure)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {!structure.is_default && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(structure.id)} title="Delete" className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
