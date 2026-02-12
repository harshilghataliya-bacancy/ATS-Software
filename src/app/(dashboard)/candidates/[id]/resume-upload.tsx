'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateCandidate } from '@/lib/services/candidates'
import { ALLOWED_RESUME_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
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

    // Validate file type
    if (!ALLOWED_RESUME_TYPES.includes(file.type)) {
      setError('Only PDF and Word documents are allowed')
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('File size must be under 10MB')
      return
    }

    setUploading(true)
    setError(null)

    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const filePath = `${orgId}/${candidateId}/resume.${fileExt}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('resumes')
      .getPublicUrl(filePath)

    // Update candidate record
    const { error: updateError } = await updateCandidate(supabase, candidateId, orgId, {
      resume_url: publicUrl,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      onUploadComplete(publicUrl)
    }

    setUploading(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resume</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-2 rounded mb-3">{error}</div>
        )}

        {currentResumeUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
              <span className="text-sm text-gray-600">resume</span>
              <span className="text-gray-300">|</span>
              <a
                href={currentResumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                View Resume
              </a>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
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
                accept=".pdf,.doc,.docx"
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
              <p className="text-xs text-gray-400 mt-1">PDF or Word, max 10MB</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
