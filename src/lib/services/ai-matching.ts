import { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { extractText } from 'unpdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoringWeights {
  skill: number
  experience: number
  semantic: number
}

interface MatchScoreResult {
  overall_score: number
  skill_score: number
  experience_score: number
  semantic_score: number
  ai_summary: string
  recommendation: string
  strengths: string[]
  concerns: string[]
  breakdown: Record<string, unknown>
}

interface CandidateData {
  first_name: string
  last_name: string
  email: string
  current_company?: string | null
  current_title?: string | null
  location?: string | null
  resume_url?: string | null
  resume_parsed_data?: Record<string, unknown> | null
  tags?: string[]
  notes?: string | null
}

interface JobData {
  title: string
  department?: string | null
  location?: string | null
  employment_type: string
  description?: string | null
  requirements?: string | null
}

// ---------------------------------------------------------------------------
// OpenAI Client
// ---------------------------------------------------------------------------

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return new OpenAI({ apiKey })
}

// ---------------------------------------------------------------------------
// Get scoring config for org
// ---------------------------------------------------------------------------

export async function getScoringConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ enabled: boolean; weights: ScoringWeights; autoScore: boolean }> {
  const { data } = await supabase
    .from('ai_scoring_config')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!data) {
    return {
      enabled: true,
      weights: { skill: 40, experience: 30, semantic: 30 },
      autoScore: true,
    }
  }

  return {
    enabled: data.enabled,
    weights: {
      skill: data.skill_weight,
      experience: data.experience_weight,
      semantic: data.semantic_weight,
    },
    autoScore: data.auto_score,
  }
}

export async function updateScoringConfig(
  supabase: SupabaseClient,
  orgId: string,
  config: {
    enabled?: boolean
    skill_weight?: number
    experience_weight?: number
    semantic_weight?: number
    auto_score?: boolean
  }
) {
  // Upsert
  const { data, error } = await supabase
    .from('ai_scoring_config')
    .upsert(
      {
        organization_id: orgId,
        ...config,
      },
      { onConflict: 'organization_id' }
    )
    .select()
    .single()

  return { data, error }
}

// ---------------------------------------------------------------------------
// Get existing match score
// ---------------------------------------------------------------------------

export async function getMatchScore(
  supabase: SupabaseClient,
  applicationId: string
) {
  const { data, error } = await supabase
    .from('candidate_match_scores')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle()

  return { data, error }
}

export async function getMatchScoresForJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('candidate_match_scores')
    .select('*')
    .eq('job_id', jobId)
    .eq('organization_id', orgId)

  return { data, error }
}

// ---------------------------------------------------------------------------
// Resume text extraction from Supabase storage
// ---------------------------------------------------------------------------

async function fetchResumeText(
  supabase: SupabaseClient,
  resumeUrl: string
): Promise<string> {
  try {
    // Extract the storage path from the public URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/resumes/orgId/candidateId/resume.pdf
    const urlObj = new URL(resumeUrl)
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/resumes\/(.+)/)
    if (!pathMatch) return ''

    const storagePath = decodeURIComponent(pathMatch[1])

    // Download the file from Supabase storage
    const { data, error } = await supabase.storage
      .from('resumes')
      .download(storagePath)

    if (error || !data) return ''

    // Convert to Uint8Array for pdf-parse
    const arrayBuffer = await data.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Use unpdf to extract text properly
    const result = await extractText(bytes)
    const text = Array.isArray(result.text)
      ? result.text.join('\n')
      : (result.text || '')

    // Limit to ~8K chars to keep prompt sizes reasonable
    return text.substring(0, 8000)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Core: Score a candidate against a job using GPT-4o + embeddings
// ---------------------------------------------------------------------------

export async function scoreCandidate(
  supabase: SupabaseClient,
  applicationId: string,
  orgId: string
): Promise<{ data: MatchScoreResult | null; error: Error | null }> {
  try {
    // 1. Get application with candidate and job data
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select(`
        id, candidate_id, job_id,
        candidate:candidates(
          first_name, last_name, email, current_company, current_title,
          location, resume_url, resume_parsed_data, tags, notes
        ),
        job:jobs(
          title, department, location, employment_type, description, requirements
        )
      `)
      .eq('id', applicationId)
      .eq('organization_id', orgId)
      .single()

    if (appError || !app) {
      return { data: null, error: appError ?? new Error('Application not found') }
    }

    const candidate = app.candidate as unknown as CandidateData
    const job = app.job as unknown as JobData

    if (!candidate || !job) {
      return { data: null, error: new Error('Missing candidate or job data') }
    }

    // 2. Get scoring config
    const config = await getScoringConfig(supabase, orgId)
    const weights = config.weights

    // 3. Extract resume text if available
    let resumeText = ''
    if (candidate.resume_url) {
      resumeText = await fetchResumeText(supabase, candidate.resume_url)
    }

    // 4. Build candidate profile text
    const candidateText = buildCandidateText(candidate, resumeText)
    const jobText = buildJobText(job)

    // 4. Run GPT-4o analysis + embedding similarity in parallel
    const openai = getOpenAIClient()

    const [analysisResult, semanticScore] = await Promise.all([
      analyzeWithGPT(openai, candidateText, jobText),
      computeSemanticSimilarity(openai, candidateText, jobText),
    ])

    // 5. Calculate weighted overall score
    const skillScore = clamp(analysisResult.skill_score, 0, 100)
    const experienceScore = clamp(analysisResult.experience_score, 0, 100)
    const safeSemanticScore = clamp(semanticScore, 0, 100)
    const totalWeight = weights.skill + weights.experience + weights.semantic
    const rawScore = totalWeight > 0
      ? (skillScore * weights.skill +
          experienceScore * weights.experience +
          safeSemanticScore * weights.semantic) /
          totalWeight
      : 0
    // Apply gentle upward curve: boosts mid-range scores (60→72, 70→80, 80→87)
    // while keeping extremes stable (0→0, 100→100)
    const curvedScore = 100 * Math.pow(rawScore / 100, 0.75)
    const overallScore = Math.round(curvedScore)

    const result: MatchScoreResult = {
      overall_score: clamp(overallScore, 0, 100),
      skill_score: skillScore,
      experience_score: experienceScore,
      semantic_score: safeSemanticScore,
      ai_summary: analysisResult.summary,
      recommendation: analysisResult.recommendation,
      strengths: analysisResult.strengths,
      concerns: analysisResult.concerns,
      breakdown: {
        skills_found: analysisResult.skills_found,
        skills_missing: analysisResult.skills_missing,
        experience_details: analysisResult.experience_details,
      },
    }

    // 6. Upsert into DB
    const { error: upsertError } = await supabase
      .from('candidate_match_scores')
      .upsert(
        {
          organization_id: orgId,
          application_id: applicationId,
          candidate_id: app.candidate_id,
          job_id: app.job_id,
          overall_score: result.overall_score,
          skill_score: result.skill_score,
          experience_score: result.experience_score,
          semantic_score: result.semantic_score,
          ai_summary: result.ai_summary,
          recommendation: result.recommendation,
          strengths: result.strengths,
          concerns: result.concerns,
          breakdown: result.breakdown,
          weights: weights,
          model_used: 'gpt-4o',
          scored_at: new Date().toISOString(),
        },
        { onConflict: 'application_id' }
      )

    if (upsertError) {
      return { data: null, error: upsertError }
    }

    return { data: result, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Scoring failed'),
    }
  }
}

// ---------------------------------------------------------------------------
// GPT-4o Analysis
// ---------------------------------------------------------------------------

interface GPTAnalysis {
  skill_score: number
  experience_score: number
  summary: string
  recommendation: string
  strengths: string[]
  concerns: string[]
  skills_found: string[]
  skills_missing: string[]
  experience_details: string
}

async function analyzeWithGPT(
  openai: OpenAI,
  candidateText: string,
  jobText: string
): Promise<GPTAnalysis> {
  const systemPrompt = `You are an expert HR analyst evaluating candidate-job fit. Analyze the candidate profile against the job requirements and return a JSON response.

Return ONLY valid JSON with this exact structure:
{
  "skill_score": <0-100 integer>,
  "experience_score": <0-100 integer>,
  "summary": "<2-3 sentence summary of the match>",
  "recommendation": "<one of: strong_match, good_match, moderate_match, weak_match, poor_match>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "concerns": ["<concern 1>", "<concern 2>", ...],
  "skills_found": ["<matching skill 1>", ...],
  "skills_missing": ["<missing required skill 1>", ...],
  "experience_details": "<brief assessment of experience relevance>"
}

Scoring guidelines:
- skill_score: How well the candidate's skills match job requirements (0=no overlap, 100=perfect match). Give credit for related/transferable skills, not just exact keyword matches. A candidate with 70%+ of required skills should score 75+.
- experience_score: How relevant their experience is (0=completely unrelated field, 100=exact role match). Value years of industry experience, leadership, and domain knowledge generously. Similar roles in the same industry should score 80+.
- Score generously — focus on what the candidate CAN do, not just gaps. Most qualified candidates should score 70-95.
- A candidate who matches most requirements but is missing 1-2 nice-to-haves should still score 80+.
- List concrete strengths and concerns
- Keep summary concise and actionable`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `## Candidate Profile\n${candidateText}\n\n## Job Description\n${jobText}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('Empty response from GPT-4o')
  }

  const parsed = JSON.parse(content) as GPTAnalysis
  return {
    skill_score: clamp(parsed.skill_score ?? 0, 0, 100),
    experience_score: clamp(parsed.experience_score ?? 0, 0, 100),
    summary: parsed.summary ?? 'Analysis unavailable',
    recommendation: parsed.recommendation ?? 'moderate_match',
    strengths: parsed.strengths ?? [],
    concerns: parsed.concerns ?? [],
    skills_found: parsed.skills_found ?? [],
    skills_missing: parsed.skills_missing ?? [],
    experience_details: parsed.experience_details ?? '',
  }
}

// ---------------------------------------------------------------------------
// Embedding-based Semantic Similarity
// ---------------------------------------------------------------------------

async function computeSemanticSimilarity(
  openai: OpenAI,
  candidateText: string,
  jobText: string
): Promise<number> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: [candidateText, jobText],
  })

  const candidateEmbedding = response.data[0].embedding
  const jobEmbedding = response.data[1].embedding

  const similarity = cosineSimilarity(candidateEmbedding, jobEmbedding)

  // Convert cosine similarity to 0-100 score
  // Typical resume-job cosine similarity ranges from 0.55 (weak) to 0.85 (strong)
  // Rescale: 0.45 -> 0, 0.85 -> 100 (more generous mapping)
  const score = Math.round(Math.max(0, (similarity - 0.45) * 250))
  return clamp(score, 0, 100)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return dotProduct / denom
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCandidateText(candidate: CandidateData, resumeText?: string): string {
  const parts: string[] = []
  parts.push(`Name: ${candidate.first_name} ${candidate.last_name}`)
  if (candidate.current_title) parts.push(`Current Title: ${candidate.current_title}`)
  if (candidate.current_company) parts.push(`Current Company: ${candidate.current_company}`)
  if (candidate.location) parts.push(`Location: ${candidate.location}`)
  if (candidate.tags && candidate.tags.length > 0) parts.push(`Skills/Tags: ${candidate.tags.join(', ')}`)
  if (candidate.notes) parts.push(`Notes: ${candidate.notes}`)

  // Include parsed resume data if available
  if (candidate.resume_parsed_data && Object.keys(candidate.resume_parsed_data).length > 0) {
    parts.push(`Resume Data: ${JSON.stringify(candidate.resume_parsed_data)}`)
  }

  // Include extracted resume text
  if (resumeText && resumeText.trim().length > 0) {
    parts.push(`\nResume Content:\n${resumeText}`)
  }

  return parts.join('\n')
}

function buildJobText(job: JobData): string {
  const parts: string[] = []
  parts.push(`Title: ${job.title}`)
  if (job.department) parts.push(`Department: ${job.department}`)
  if (job.location) parts.push(`Location: ${job.location}`)
  parts.push(`Employment Type: ${job.employment_type}`)
  if (job.description) parts.push(`Description: ${job.description}`)
  if (job.requirements) parts.push(`Requirements: ${job.requirements}`)
  return parts.join('\n')
}

function clamp(value: number, min: number, max: number): number {
  if (isNaN(value) || !isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
