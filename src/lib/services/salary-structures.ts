import { SupabaseClient } from '@supabase/supabase-js'
import type { SalaryStructure, SalaryStructureComponent, SalaryComponent } from '@/types/database'

// ---------------------------------------------------------------------------
// Default salary structure definitions (Keka-style)
// ---------------------------------------------------------------------------
const DEFAULT_STRUCTURES: { name: string; description: string; is_default: boolean; components: SalaryStructureComponent[] }[] = [
  // 1. Full Keka-style Indian CTC with PF + Gratuity (your existing template)
  {
    name: 'Full CTC - With PF & Gratuity',
    description: 'Complete Indian payroll: Basic 30%, HRA, LTA, Flexi Pay, Uniform, Bonus Allowance, PF 12%, Gratuity 4.81%, Professional Tax',
    is_default: true,
    components: [
      { name: 'Basic', type: 'percentage_of_ctc', value: 30, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 40, section: 'earnings' },
      { name: 'Travel Reimbursement (LTA)', type: 'percentage_of_ctc', value: 2, section: 'earnings' },
      { name: 'Uniform Allowance', type: 'fixed', value: 2000, section: 'earnings' },
      { name: 'Bonus Allowance', type: 'percentage_of_basic', value: 8.33, section: 'earnings' },
      { name: 'Flexi Pay', type: 'percentage_of_ctc', value: 25, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
      { name: 'Gratuity', type: 'percentage_of_basic', value: 4.81, section: 'employer' },
      { name: 'Employer PF', type: 'percentage_of_basic', value: 12, section: 'employer' },
      { name: 'Employee PF', type: 'percentage_of_basic', value: 12, section: 'deduction' },
      { name: 'Professional Tax', type: 'fixed', value: 200, section: 'deduction' },
    ],
  },
  // 2. CTC without PF — for consultants, contractors, or PF-exempt employees
  {
    name: 'CTC - Without PF (Consultants)',
    description: 'Indian payroll without PF contributions — Gratuity still included. Suitable for consultants or PF-exempt hires',
    is_default: false,
    components: [
      { name: 'Basic', type: 'percentage_of_ctc', value: 30, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 40, section: 'earnings' },
      { name: 'Travel Reimbursement (LTA)', type: 'percentage_of_ctc', value: 2, section: 'earnings' },
      { name: 'Uniform Allowance', type: 'fixed', value: 2000, section: 'earnings' },
      { name: 'Bonus Allowance', type: 'percentage_of_basic', value: 8.33, section: 'earnings' },
      { name: 'Flexi Pay', type: 'percentage_of_ctc', value: 25, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
      { name: 'Gratuity', type: 'percentage_of_basic', value: 4.81, section: 'employer' },
      { name: 'Professional Tax', type: 'fixed', value: 200, section: 'deduction' },
    ],
  },
  // 3. Basic 40% structure — higher basic for better PF/gratuity benefits (Keka "High Basic" template)
  {
    name: 'High Basic (40%) - With PF',
    description: 'Higher basic at 40% of CTC for better PF, Gratuity & retirement benefits. Ideal for senior hires',
    is_default: false,
    components: [
      { name: 'Basic', type: 'percentage_of_ctc', value: 40, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 50, section: 'earnings' },
      { name: 'Conveyance Allowance', type: 'fixed', value: 1600, section: 'earnings' },
      { name: 'Medical Allowance', type: 'fixed', value: 1250, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
      { name: 'Gratuity', type: 'percentage_of_basic', value: 4.81, section: 'employer' },
      { name: 'Employer PF', type: 'percentage_of_basic', value: 12, section: 'employer' },
      { name: 'Employee PF', type: 'percentage_of_basic', value: 12, section: 'deduction' },
      { name: 'Professional Tax', type: 'fixed', value: 200, section: 'deduction' },
    ],
  },
  // 4. Simple Gross Salary — no employer contributions, straightforward structure
  {
    name: 'Simple Gross Salary',
    description: 'Minimal structure: Basic 50%, HRA, and Special Allowance. No PF, Gratuity, or statutory deductions',
    is_default: false,
    components: [
      { name: 'Basic', type: 'percentage_of_ctc', value: 50, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 40, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
    ],
  },
  // 5. Intern / Contract — flat components, no statutory benefits
  {
    name: 'Intern / Stipend Structure',
    description: 'Fixed stipend-based structure for interns and short-term contracts. No PF, Gratuity, or complex deductions',
    is_default: false,
    components: [
      { name: 'Basic', type: 'percentage_of_ctc', value: 60, section: 'earnings' },
      { name: 'HRA', type: 'percentage_of_basic', value: 30, section: 'earnings' },
      { name: 'Transport Allowance', type: 'fixed', value: 1000, section: 'earnings' },
      { name: 'Special Allowance', type: 'percentage_of_ctc', value: 0, section: 'earnings', is_balancing: true },
    ],
  },
]

// ---------------------------------------------------------------------------
// Built-in structures fallback (no DB needed)
// ---------------------------------------------------------------------------
export function getBuiltInStructures(): SalaryStructure[] {
  return DEFAULT_STRUCTURES.map((s, i) => ({
    id: `builtin-${i + 1}`,
    organization_id: '',
    name: s.name,
    description: s.description,
    is_default: s.is_default,
    components: s.components,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }))
}

// ---------------------------------------------------------------------------
// Pure calculation function (no Supabase — safe for client-side import)
// ---------------------------------------------------------------------------
export function buildSalaryComponentsFromStructure(
  ctc: number,
  components: SalaryStructureComponent[]
): SalaryComponent[] {
  if (ctc <= 0 || components.length === 0) return []

  // 1. Compute Basic (always percentage_of_ctc)
  const basicDef = components.find(c => c.name === 'Basic' && c.section === 'earnings')
  const basic = basicDef ? Math.round(ctc * basicDef.value / 100) : Math.round(ctc * 0.3)

  // Helper to compute a component's annual value
  function calcAnnual(comp: SalaryStructureComponent): number {
    switch (comp.type) {
      case 'percentage_of_ctc': return Math.round(ctc * comp.value / 100)
      case 'percentage_of_basic': return Math.round(basic * comp.value / 100)
      case 'fixed': return Math.round(comp.value * 12)
      default: return 0
    }
  }

  // 2. Compute employer contributions
  const employerComps = components.filter(c => c.section === 'employer')
  const employerTotal = employerComps.reduce((sum, c) => sum + calcAnnual(c), 0)

  // 3. Gross = CTC - employer contributions
  const gross = ctc - employerTotal

  // 4. Compute all non-balancing earnings
  const earningsComps = components.filter(c => c.section === 'earnings' && !c.is_balancing)
  const earningsTotal = earningsComps.reduce((sum, c) => sum + calcAnnual(c), 0)

  // 5. Balancing component = Gross - all other earnings
  const balancingAmount = Math.max(0, gross - earningsTotal)

  // 6. Build result array
  const result: SalaryComponent[] = []

  // Earnings (non-balancing first, then balancing)
  for (const comp of components.filter(c => c.section === 'earnings')) {
    const annual = comp.is_balancing ? balancingAmount : calcAnnual(comp)
    result.push({
      name: comp.name,
      monthly: Math.round(annual / 12),
      annual,
      section: 'earnings',
    })
  }

  // Employer contributions
  for (const comp of employerComps) {
    const annual = calcAnnual(comp)
    result.push({
      name: comp.name,
      monthly: Math.round(annual / 12),
      annual,
      section: 'employer',
    })
  }

  // Deductions
  for (const comp of components.filter(c => c.section === 'deduction')) {
    const annual = calcAnnual(comp)
    result.push({
      name: comp.name,
      monthly: Math.round(annual / 12),
      annual,
      section: 'deduction',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------
export async function getSalaryStructures(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('salary_structures')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  return { data: data as SalaryStructure[] | null, error }
}

export async function getSalaryStructureById(
  supabase: SupabaseClient,
  id: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('salary_structures')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  return { data: data as SalaryStructure | null, error }
}

export async function createSalaryStructure(
  supabase: SupabaseClient,
  orgId: string,
  data: { name: string; description?: string; is_default?: boolean; components: SalaryStructureComponent[] },
  userId: string
) {
  // If new one is default, unset others
  if (data.is_default) {
    await supabase
      .from('salary_structures')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_default', true)
  }

  const { data: structure, error } = await supabase
    .from('salary_structures')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description || null,
      is_default: data.is_default || false,
      components: data.components,
      created_by: userId,
    })
    .select()
    .single()

  return { data: structure as SalaryStructure | null, error }
}

export async function updateSalaryStructure(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
  data: { name?: string; description?: string; is_default?: boolean; components?: SalaryStructureComponent[] }
) {
  if (data.is_default) {
    await supabase
      .from('salary_structures')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .neq('id', id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updatePayload.name = data.name
  if (data.description !== undefined) updatePayload.description = data.description
  if (data.is_default !== undefined) updatePayload.is_default = data.is_default
  if (data.components !== undefined) updatePayload.components = data.components

  const { data: structure, error } = await supabase
    .from('salary_structures')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select()
    .single()

  return { data: structure as SalaryStructure | null, error }
}

export async function deleteSalaryStructure(
  supabase: SupabaseClient,
  id: string,
  orgId: string
) {
  const { error } = await supabase
    .from('salary_structures')
    .update({ deleted_at: new Date().toISOString(), is_default: false })
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)

  return { error }
}

// Seed default structures if none exist for the org
export async function seedDefaultStructures(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
) {
  const { data: existing } = await supabase
    .from('salary_structures')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(1)

  if (existing && existing.length > 0) return // Already has structures

  const rows = DEFAULT_STRUCTURES.map(s => ({
    organization_id: orgId,
    name: s.name,
    description: s.description,
    is_default: s.is_default,
    components: s.components,
    created_by: userId,
  }))

  await supabase.from('salary_structures').insert(rows)
}
