import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getPublicJobsByOrgId } from '@/lib/services/jobs'
import Link from 'next/link'

const EXPERIENCE_LABELS: Record<string, string> = {
  entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior Level',
  lead: 'Lead', director: 'Director', vp: 'VP', c_level: 'C-Level',
}
const REMOTE_LABELS: Record<string, string> = {
  on_site: 'On-site', hybrid: 'Hybrid', remote: 'Remote',
}

function formatSalary(min: number | null, max: number | null, currency: string) {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toString()
  if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`
  if (min) return `${currency} ${fmt(min)}+`
  if (max) return `Up to ${currency} ${fmt(max)}`
  return null
}

export default async function SubdomainCareersPage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Company not found</h1>
          <p className="text-gray-500">The careers page you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const { data, error } = await getPublicJobsByOrgId(supabase, orgId)

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Company not found</h1>
          <p className="text-gray-500">The careers page you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  const { organization, jobs } = data

  const { data: branding } = await supabase
    .from('organization_branding')
    .select('*')
    .eq('organization_id', organization.id)
    .maybeSingle()

  const primaryColor = branding?.primary_color || '#4f46e5'
  const accentColor = branding?.accent_color || '#7c3aed'
  const displayName = branding?.brand_name || organization.name
  const logoUrl = branding?.logo_url || organization.logo_url

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }} className="text-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={displayName}
                className="w-14 h-14 rounded-xl object-cover ring-2 ring-white/30"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">
                {displayName?.[0] ?? 'C'}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              <p className="text-white/70 mt-1">Join our team &mdash; explore open positions below</p>
            </div>
          </div>
        </div>
      </header>

      {/* Jobs List */}
      <main className="max-w-5xl mx-auto px-6 py-8 flex-1 w-full">
        {jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No open positions</h2>
            <p className="text-gray-500">Check back later for new opportunities.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-500">{jobs.length} open position{jobs.length !== 1 ? 's' : ''}</p>
            {jobs.map((job) => {
              const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency ?? 'INR')
              const expLabel = job.experience_level ? EXPERIENCE_LABELS[job.experience_level] ?? job.experience_level : null
              const remoteLabel = job.remote_policy ? REMOTE_LABELS[job.remote_policy] ?? job.remote_policy : null
              const deadline = job.application_deadline
                ? new Date(job.application_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : null

              return (
                <Link
                  key={job.id}
                  href={`/${job.id}`}
                  className="group block bg-white border rounded-xl p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 transition-colors">{job.title}</h3>

                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        {job.department && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                            {job.department}
                          </span>
                        )}
                        {job.location && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {job.location}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full capitalize">
                          {job.employment_type.replace('_', ' ')}
                        </span>
                        {remoteLabel && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                            {remoteLabel}
                          </span>
                        )}
                        {expLabel && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full">
                            {expLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                        {salary && <span className="font-medium text-green-700">{salary}</span>}
                        {job.num_openings > 1 && <span>{job.num_openings} openings</span>}
                        {deadline && <span>Deadline: {deadline}</span>}
                        <span>Posted {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>

                      {job.skills && job.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {job.skills.slice(0, 5).map((s: string) => (
                            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                          {job.skills.length > 5 && (
                            <span className="text-xs text-gray-400 px-1 py-0.5">+{job.skills.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-300 transition-colors mt-1 shrink-0 ml-4" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
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
