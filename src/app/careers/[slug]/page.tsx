import { createClient } from '@/lib/supabase/server'
import { getPublicJobs } from '@/lib/services/jobs'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CareersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data, error } = await getPublicJobs(supabase, slug)

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            {organization.logo_url && (
              <img
                src={organization.logo_url}
                alt={organization.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{organization.name}</h1>
              <p className="text-gray-500 mt-1">Open Positions</p>
            </div>
          </div>
        </div>
      </header>

      {/* Jobs List */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {jobs.length === 0 ? (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No open positions</h2>
            <p className="text-gray-500">Check back later for new opportunities.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-6">{jobs.length} open position{jobs.length !== 1 ? 's' : ''}</p>
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/careers/${slug}/${job.id}`}
                className="block bg-white border rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  {job.department && <span>{job.department}</span>}
                  {job.location && <span>{job.location}</span>}
                  <span className="capitalize">{job.employment_type.replace('_', ' ')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          Powered by HireFlow
        </div>
      </footer>
    </div>
  )
}
