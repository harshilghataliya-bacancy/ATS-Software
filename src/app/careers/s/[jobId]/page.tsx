import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ApplyForm } from '../../[slug]/[jobId]/apply-form'

interface Props {
  params: Promise<{ jobId: string }>
}

const EXPERIENCE_LABELS: Record<string, string> = {
  entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior Level',
  lead: 'Lead', director: 'Director', vp: 'VP', c_level: 'C-Level',
}
const REMOTE_LABELS: Record<string, string> = {
  on_site: 'On-site', hybrid: 'Hybrid', remote: 'Remote',
}
const EDUCATION_LABELS: Record<string, string> = {
  any: 'Any', high_school: 'High School', associate: 'Associate Degree',
  bachelor: "Bachelor's Degree", master: "Master's Degree", doctorate: 'Doctorate / PhD',
}

export default async function SubdomainJobDetailPage({ params }: Props) {
  const { jobId } = await params
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Company not found.</p>
      </div>
    )
  }

  const supabase = await createClient()

  // Fetch org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url')
    .eq('id', orgId)
    .single()

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Company not found.</p>
      </div>
    )
  }

  // Fetch branding
  const { data: branding } = await supabase
    .from('organization_branding')
    .select('*')
    .eq('organization_id', org.id)
    .maybeSingle()

  const primaryColor = branding?.primary_color || '#4f46e5'
  const accentColor = branding?.accent_color || '#7c3aed'
  const displayName = branding?.brand_name || org.name

  // Fetch job
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('organization_id', org.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .single()

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Job not found or no longer available.</p>
      </div>
    )
  }

  const salaryRange =
    job.salary_min && job.salary_max
      ? `${job.salary_currency ?? 'INR'} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}`
      : job.salary_min
        ? `From ${job.salary_currency ?? 'INR'} ${job.salary_min.toLocaleString()}`
        : job.salary_max
          ? `Up to ${job.salary_currency ?? 'INR'} ${job.salary_max.toLocaleString()}`
          : null

  const expLabel = job.experience_level ? EXPERIENCE_LABELS[job.experience_level] ?? job.experience_level : null
  const remoteLabel = job.remote_policy ? REMOTE_LABELS[job.remote_policy] ?? job.remote_policy : null
  const eduLabel = job.education_level ? EDUCATION_LABELS[job.education_level] ?? job.education_level : null
  const deadline = job.application_deadline
    ? new Date(job.application_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }} className="text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            All positions at {displayName}
          </Link>
          <h1 className="text-3xl font-bold mt-2">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {job.department && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                {job.department}
              </span>
            )}
            {job.location && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                {job.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full capitalize">
              {job.employment_type.replace('_', ' ')}
            </span>
            {remoteLabel && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                {remoteLabel}
              </span>
            )}
            {expLabel && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                {expLabel}
              </span>
            )}
            {salaryRange && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                {salaryRange}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Job details */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Overview</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {job.department && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Department</p>
                    <p className="text-gray-800 font-medium">{job.department}</p>
                  </div>
                )}
                {job.location && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Location</p>
                    <p className="text-gray-800 font-medium">{job.location}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-xs mb-0.5">Employment Type</p>
                  <p className="text-gray-800 font-medium capitalize">{job.employment_type.replace('_', ' ')}</p>
                </div>
                {remoteLabel && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Work Mode</p>
                    <p className="text-gray-800 font-medium">{remoteLabel}</p>
                  </div>
                )}
                {expLabel && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Experience Level</p>
                    <p className="text-gray-800 font-medium">
                      {expLabel}
                      {(job.experience_min !== null || job.experience_max !== null) && (
                        <span className="text-gray-500 font-normal"> ({job.experience_min ?? 0}{job.experience_max ? `-${job.experience_max}` : '+'} years)</span>
                      )}
                    </p>
                  </div>
                )}
                {eduLabel && eduLabel !== 'Any' && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Education</p>
                    <p className="text-gray-800 font-medium">{eduLabel}</p>
                  </div>
                )}
                {salaryRange && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Compensation</p>
                    <p className="text-green-700 font-medium">{salaryRange}</p>
                  </div>
                )}
                {job.num_openings > 1 && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Openings</p>
                    <p className="text-gray-800 font-medium">{job.num_openings} positions</p>
                  </div>
                )}
                {deadline && (
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Apply Before</p>
                    <p className="text-gray-800 font-medium">{deadline}</p>
                  </div>
                )}
              </div>

              {job.skills && job.skills.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-gray-400 text-xs mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.skills.map((s: string) => (
                      <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {job.description && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">About This Role</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{job.description}</div>
              </div>
            )}

            {job.requirements && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{job.requirements}</div>
              </div>
            )}

            {job.nice_to_have && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Nice to Have</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{job.nice_to_have}</div>
              </div>
            )}

            {job.benefits && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Benefits & Perks</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{job.benefits}</div>
              </div>
            )}
          </div>

          {/* Apply form */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6">
              <ApplyForm jobId={jobId} orgId={org.id} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {displayName}. All Rights Reserved.
          </p>
          <p className="text-xs text-gray-300 italic">
            Powered by HireFlow
          </p>
        </div>
      </footer>
    </div>
  )
}
