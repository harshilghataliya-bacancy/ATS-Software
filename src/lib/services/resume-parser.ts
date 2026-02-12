import { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { extractText } from 'unpdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedResume {
  current_title: string | null
  current_company: string | null
  location: string | null
  skills: string[]
  experience_years: number | null
  education: Array<{ degree: string; institution: string; year: number | null }>
  work_history: Array<{ title: string; company: string; duration: string; highlights: string[] }>
  summary: string | null
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
// Resume text extraction from Supabase storage
// ---------------------------------------------------------------------------

async function fetchResumeText(
  supabase: SupabaseClient,
  resumeUrl: string
): Promise<string> {
  try {
    const urlObj = new URL(resumeUrl)
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/resumes\/(.+)/)
    if (!pathMatch) return ''

    const storagePath = decodeURIComponent(pathMatch[1])

    const { data, error } = await supabase.storage
      .from('resumes')
      .download(storagePath)

    if (error || !data) return ''

    const arrayBuffer = await data.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    const result = await extractText(bytes)
    const text = Array.isArray(result.text)
      ? result.text.join('\n')
      : (result.text || '')

    return text.substring(0, 8000)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Core: Parse a single resume
// ---------------------------------------------------------------------------

export async function parseResume(
  supabase: SupabaseClient,
  candidateId: string,
  orgId: string
): Promise<{ data: ParsedResume | null; error: Error | null }> {
  try {
    // 1. Fetch candidate with resume_url
    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('id, resume_url, resume_parsed_data, current_title, current_company, location, tags')
      .eq('id', candidateId)
      .eq('organization_id', orgId)
      .single()

    if (fetchError || !candidate) {
      return { data: null, error: fetchError ?? new Error('Candidate not found') }
    }

    if (!candidate.resume_url) {
      return { data: null, error: new Error('No resume uploaded') }
    }

    // Skip if already parsed (non-empty parsed data)
    if (candidate.resume_parsed_data && Object.keys(candidate.resume_parsed_data).length > 0) {
      return { data: candidate.resume_parsed_data as ParsedResume, error: null }
    }

    // 2. Extract text from PDF
    const resumeText = await fetchResumeText(supabase, candidate.resume_url)
    if (!resumeText || resumeText.trim().length < 20) {
      return { data: null, error: new Error('Could not extract text from resume') }
    }

    // 3. Call GPT-4o for structured parsing
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a resume parsing expert. Extract structured data from the resume text below. Return ONLY valid JSON with this exact structure:
{
  "current_title": "string or null",
  "current_company": "string or null",
  "location": "string or null",
  "skills": ["skill1", "skill2"],
  "experience_years": number or null,
  "education": [{"degree": "...", "institution": "...", "year": 2019}],
  "work_history": [{"title": "...", "company": "...", "duration": "2 years", "highlights": ["..."]}],
  "summary": "2-3 sentence professional summary"
}

Be accurate and extract only what is clearly stated in the resume. Use null for fields that cannot be determined.`,
        },
        { role: 'user', content: resumeText },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { data: null, error: new Error('Empty response from GPT-4o') }
    }

    const parsed = JSON.parse(content) as ParsedResume

    // 4. Update candidate record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {
      resume_parsed_data: parsed,
    }

    // Auto-fill empty fields
    if (!candidate.current_title && parsed.current_title) {
      updatePayload.current_title = parsed.current_title
    }
    if (!candidate.current_company && parsed.current_company) {
      updatePayload.current_company = parsed.current_company
    }
    if (!candidate.location && parsed.location) {
      updatePayload.location = parsed.location
    }

    // Append skills to tags (deduplicate)
    if (parsed.skills && parsed.skills.length > 0) {
      const existingTags: string[] = candidate.tags ?? []
      const newTags = parsed.skills.filter(
        (s) => !existingTags.some((t) => t.toLowerCase() === s.toLowerCase())
      )
      if (newTags.length > 0) {
        updatePayload.tags = [...existingTags, ...newTags]
      }
    }

    await supabase
      .from('candidates')
      .update(updatePayload)
      .eq('id', candidateId)
      .eq('organization_id', orgId)

    return { data: parsed, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Resume parsing failed'),
    }
  }
}
