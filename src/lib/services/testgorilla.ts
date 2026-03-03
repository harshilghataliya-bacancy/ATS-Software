import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const TG_API_BASE = 'https://app.testgorilla.com/api'

// ---------------------------------------------------------------------------
// TestGorilla API Helper
// ---------------------------------------------------------------------------

async function tgFetch(apiKey: string, path: string, options?: RequestInit) {
  const res = await fetch(`${TG_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TestGorilla API error (${res.status}): ${text}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Config — Get (safe, no api_key exposed)
// ---------------------------------------------------------------------------

export async function getTestGorillaConfig(
  supabase: SupabaseClient,
  orgId: string
) {
  const { data, error } = await supabase
    .from('testgorilla_config')
    .select('id, organization_id, is_enabled, created_at, updated_at')
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Config — Get Full Credentials (server-only, uses admin client)
// ---------------------------------------------------------------------------

export async function getTestGorillaCredentials(orgId: string) {
  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('testgorilla_config')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error || !data) {
    return { config: null, error: error?.message || 'TestGorilla not configured' }
  }

  return { config: data, error: null }
}

// ---------------------------------------------------------------------------
// Config — Save / Update (admin only, RLS enforced)
// ---------------------------------------------------------------------------

export async function saveTestGorillaConfig(
  supabase: SupabaseClient,
  orgId: string,
  config: { api_key: string }
) {
  const { data, error } = await supabase
    .from('testgorilla_config')
    .upsert(
      {
        organization_id: orgId,
        api_key: config.api_key,
        is_enabled: true,
      },
      { onConflict: 'organization_id' }
    )
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Config — Disconnect (delete config)
// ---------------------------------------------------------------------------

export async function disconnectTestGorilla(
  supabase: SupabaseClient,
  orgId: string
) {
  const { error } = await supabase
    .from('testgorilla_config')
    .delete()
    .eq('organization_id', orgId)

  return { error }
}

// ---------------------------------------------------------------------------
// TestGorilla API — List Assessments
// ---------------------------------------------------------------------------

export async function listAssessments(apiKey: string) {
  const data = await tgFetch(apiKey, '/assessments/')
  return data.results ?? data
}

// ---------------------------------------------------------------------------
// TestGorilla API — Invite Candidate
// ---------------------------------------------------------------------------

export async function inviteCandidate(
  apiKey: string,
  assessmentId: string,
  candidate: { email: string; first_name: string; last_name: string }
) {
  return tgFetch(apiKey, `/assessments/${assessmentId}/invite_candidate/`, {
    method: 'POST',
    body: JSON.stringify(candidate),
  })
}

// ---------------------------------------------------------------------------
// TestGorilla API — Get Results
// ---------------------------------------------------------------------------

export async function getResults(
  apiKey: string,
  assessmentId: string,
  testTakerId?: string
) {
  const params = new URLSearchParams()
  if (testTakerId) params.set('test_taker', testTakerId)
  const query = params.toString() ? `?${params.toString()}` : ''
  return tgFetch(apiKey, `/assessments/${assessmentId}/results/${query}`)
}

// ---------------------------------------------------------------------------
// Assessment Invitations — Get for Application
// ---------------------------------------------------------------------------

export async function getAssessmentInvitation(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('*')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Assessment Invitations — Get All for Job
// ---------------------------------------------------------------------------

export async function getAssessmentInvitationsForJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('*')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)

  return { data, error }
}

// ---------------------------------------------------------------------------
// Assessment Invitations — Create / Upsert
// ---------------------------------------------------------------------------

export async function createAssessmentInvitation(
  supabase: SupabaseClient,
  orgId: string,
  data: {
    application_id: string
    candidate_id: string
    job_id: string
    testgorilla_assessment_id: string
    testgorilla_test_taker_id?: string
    testgorilla_candidature_id?: string
    invited_by?: string
  }
) {
  const { data: invitation, error } = await supabase
    .from('assessment_invitations')
    .upsert(
      {
        ...data,
        organization_id: orgId,
        status: 'invited',
        invited_at: new Date().toISOString(),
      },
      { onConflict: 'application_id' }
    )
    .select()
    .single()

  return { data: invitation, error }
}

// ---------------------------------------------------------------------------
// Assessment Invitations — Update Results
// ---------------------------------------------------------------------------

export async function updateAssessmentResults(
  supabase: SupabaseClient,
  invitationId: string,
  orgId: string,
  updates: {
    status?: 'invited' | 'started' | 'completed' | 'expired'
    score?: number | null
    results_data?: Record<string, unknown>
    completed_at?: string
    testgorilla_test_taker_id?: string
    testgorilla_candidature_id?: string
  }
) {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .update(updates)
    .eq('id', invitationId)
    .eq('organization_id', orgId)
    .select()
    .single()

  return { data, error }
}
