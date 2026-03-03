'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function RespondContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const action = searchParams.get('action')

  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAccept = action === 'accept'
  const isDecline = action === 'decline'
  const valid = token && (isAccept || isDecline)

  async function handleSubmit() {
    if (!valid) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/offers/public-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setDone(true)
      }
    } catch {
      setError('Failed to submit response. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
        {!valid ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
            <p className="text-gray-500 text-sm">This offer response link is invalid or incomplete.</p>
          </>
        ) : done ? (
          <>
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isAccept ? 'bg-green-100' : 'bg-orange-100'}`}>
              {isAccept ? (
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {isAccept ? 'Offer Accepted!' : 'Offer Declined'}
            </h1>
            <p className="text-gray-500 text-sm">
              {isAccept
                ? 'Congratulations! Your response has been recorded. The hiring team will be in touch with next steps.'
                : 'Your response has been recorded. Thank you for your time and consideration.'}
            </p>
          </>
        ) : (
          <>
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isAccept ? 'bg-green-100' : 'bg-red-100'}`}>
              {isAccept ? (
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {isAccept ? 'Accept This Offer?' : 'Decline This Offer?'}
            </h1>
            <p className="text-gray-500 text-sm mb-6">
              {isAccept
                ? 'By clicking confirm, you are accepting this offer of employment. This action cannot be undone.'
                : 'By clicking confirm, you are declining this offer. This action cannot be undone.'}
            </p>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-4">{error}</div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.history.back()}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className={`px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  isAccept
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {loading ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function OfferRespondPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    }>
      <RespondContent />
    </Suspense>
  )
}
