import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ApplyForm } from './apply-form'

interface Props {
  params: Promise<{ slug: string; jobId: string }>
}

export default async function JobDetailPage({ params }: Props) {
  const { slug, jobId } = await params
  const supabase = await createClient()

  // Resolve org by slug
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url')
    .eq('slug', slug)
    .single()

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Company not found.</p>
      </div>
    )
  }

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
      ? `${job.salary_currency ?? 'USD'} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}`
      : job.salary_min
        ? `From ${job.salary_currency ?? 'USD'} ${job.salary_min.toLocaleString()}`
        : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href={`/careers/${slug}`} className="inline-flex items-center gap-1 text-sm text-indigo-100 hover:text-white transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            All positions at {org.name}
          </Link>
          <h1 className="text-3xl font-bold mt-2">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {job.department && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                {job.department}
              </span>
            )}
            {job.location && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                {job.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full capitalize">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {job.employment_type.replace('_', ' ')}
            </span>
            {salaryRange && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-white/15 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {salaryRange}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full">
        <div className="grid grid-cols-3 gap-8">
          {/* Job details */}
          <div className="col-span-2 space-y-6">
            {job.description && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">About This Role</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {job.description}
                </div>
              </div>
            )}
            {job.requirements && (
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {job.requirements}
                </div>
              </div>
            )}
          </div>

          {/* Apply form */}
          <div className="sticky top-6 self-start">
            <ApplyForm jobId={jobId} orgId={org.id} />
          </div>
        </div>
      </main>

      <footer className="border-t bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          Powered by HireFlow
        </div>
      </footer>
    </div>
  )
}
