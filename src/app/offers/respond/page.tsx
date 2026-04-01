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

  /* ---- Invalid link ---- */
  if (!valid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            This offer response link is invalid or has expired. Please check your email for the correct link.
          </p>
        </div>
      </div>
    )
  }

  /* ---- Success state ---- */
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className={`w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center ${isAccept ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            {isAccept ? (
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            {isAccept ? 'Offer Accepted!' : 'Offer Declined'}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {isAccept
              ? 'Congratulations! Your response has been recorded. The hiring team will reach out with the next steps shortly.'
              : 'Your response has been recorded. We appreciate your time and consideration throughout this process.'}
          </p>
        </div>
      </div>
    )
  }

  /* ---- Confirmation state ---- */
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        {/* Icon */}
        <div className={`w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center ${isAccept ? 'bg-emerald-50' : 'bg-red-50'}`}>
          {isAccept ? (
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          {isAccept ? 'Accept This Offer?' : 'Decline This Offer?'}
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          {isAccept
            ? 'By confirming, you accept this offer of employment. This action cannot be undone.'
            : 'By confirming, you decline this offer. This action cannot be undone.'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-3 rounded-lg mb-5 text-left">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => window.close()}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex-1 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isAccept
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? 'Processing...' : 'Confirm'}
          </button>
        </div>

        <p className="mt-6 text-xs text-gray-400 leading-relaxed">
          By responding, you confirm this is your intended action.
        </p>
      </div>
    </div>
  )
}

export default function OfferRespondPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    }>
      <RespondContent />
    </Suspense>
  )
}
