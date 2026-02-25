'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateCandidate } from '@/lib/services/candidates'
import { MAX_FILE_SIZE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ResumeUploadProps {
  candidateId: string
  orgId: string
  currentResumeUrl?: string | null
  onUploadComplete: (url: string) => void
}

export function ResumeUpload({ candidateId, orgId, currentResumeUrl, onUploadComplete }: ResumeUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('File size must be under 10MB')
      return
    }

    setUploading(true)
    setError(null)

    const supabase = createClient()
    const filePath = `${orgId}/${candidateId}/resume.pdf`

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('resumes')
      .getPublicUrl(filePath)

    const { error: updateError } = await updateCandidate(supabase, candidateId, orgId, {
      resume_url: publicUrl,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      onUploadComplete(publicUrl)
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Resume</CardTitle>
          {currentResumeUrl && (
            <a
              href={currentResumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2 rounded mb-3">{error}</div>
        )}

        {currentResumeUrl ? (
          <div className="space-y-3">
            <iframe
              src={`${currentResumeUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              className="w-full rounded-lg border bg-white"
              style={{ height: '500px' }}
              title="Resume Preview"
            />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Replace Resume'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-sm text-gray-400">No resume uploaded</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Resume'}
              </Button>
              <p className="text-xs text-gray-400 mt-1">PDF only, max 10MB</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
