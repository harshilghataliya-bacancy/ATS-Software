import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify org membership
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { prompt } = await req.json()
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return NextResponse.json({ error: 'Please provide a job description prompt (at least 5 characters)' }, { status: 400 })
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert HR recruiter and job description writer. Given a brief description of a job role, generate a complete, professional job posting with all structured fields.

Return a JSON object with exactly these fields:
{
  "title": "Job title (e.g. Senior Python Developer)",
  "department": "Department name (e.g. Engineering, Marketing, Sales)",
  "location": "Location (e.g. Remote, New York, NY, Bangalore, India). If not mentioned, use 'Remote'",
  "employment_type": "One of: full_time, part_time, contract, internship",
  "experience_level": "One of: entry, mid, senior, lead, director, vp, c_level",
  "remote_policy": "One of: on_site, hybrid, remote",
  "description": "A detailed job description in HTML format (wrap paragraphs in <p> tags, use <strong> for emphasis)",
  "requirements": "An HTML bulleted list of required qualifications using <ul><li>item</li></ul> format",
  "nice_to_have": "An HTML bulleted list of preferred qualifications using <ul><li>item</li></ul> format",
  "benefits": "An HTML bulleted list of benefits and perks using <ul><li>item</li></ul> format",
  "skills": ["Array of 5-10 relevant technical skills/tags"],
  "education_level": "One of: any, high_school, associate, bachelor, master, doctorate",
  "experience_min": number (minimum years of experience),
  "experience_max": number (maximum years of experience),
  "salary_min": number or null (estimated minimum annual salary in INR, can be null if unclear),
  "salary_max": number or null (estimated maximum annual salary in INR, can be null if unclear),
  "priority": "One of: low, medium, high, urgent. Default to medium."
}

Guidelines:
- Write professionally and inclusively
- Make the description engaging and specific to the role
- Skills should be specific technologies/tools/methodologies, not generic terms
- Requirements should be concrete and measurable where possible
- If salary is not mentioned, estimate reasonable market rates or set both to null
- If experience is mentioned (e.g. "3+ years"), use that for experience_min and set experience_max to experience_min + 3
- Keep the description rich but not excessively long`,
        },
        {
          role: 'user',
          content: prompt.trim(),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 500 })
    }

    const generated = JSON.parse(content)

    return NextResponse.json({ data: generated })
  } catch (err) {
    console.error('[AI JD Generation Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to generate job description'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
