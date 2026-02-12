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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href={`/careers/${slug}`} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            &larr; All positions at {org.name}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">{job.title}</h1>
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            {job.department && <span>{job.department}</span>}
            {job.location && <span>{job.location}</span>}
            <span className="capitalize">{job.employment_type.replace('_', ' ')}</span>
            {salaryRange && <span>{salaryRange}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Job details */}
          <div className="col-span-2 space-y-6">
            {job.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">About This Role</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {job.description}
                </div>
              </div>
            )}
            {job.requirements && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h2>
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {job.requirements}
                </div>
              </div>
            )}
          </div>

          {/* Apply form */}
          <div>
            <ApplyForm jobId={jobId} orgId={org.id} />
          </div>
        </div>
      </main>

      <footer className="border-t bg-white mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          Powered by HireFlow
        </div>
      </footer>
    </div>
  )
}
