'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2, CheckCircle2, XCircle, AlertCircle, FileArchive } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BulkResult {
  filename: string
  status: 'created' | 'updated' | 'skipped' | 'failed'
  candidateId?: string
  candidateName?: string
  error?: string
}

interface BulkSummary {
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  results: BulkResult[]
}

type DialogState = 'idle' | 'processing' | 'done' | 'error'

interface BulkResumeUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  jobTitle: string
  onComplete?: () => void
}

export function BulkResumeUploadDialog({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onComplete,
}: BulkResumeUploadDialogProps) {
  const [state, setState] = useState<DialogState>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<BulkSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetState() {
    setState('idle')
    setFile(null)
    setSummary(null)
    setErrorMsg('')
  }

  function handleOpenChange(open: boolean) {
    if (!open && state === 'processing') return // Don't close while processing
    if (!open) resetState()
    onOpenChange(open)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setErrorMsg('')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped && (dropped.name.endsWith('.zip') || dropped.type === 'application/zip')) {
      setFile(dropped)
      setErrorMsg('')
    }
  }

  async function handleUpload() {
    if (!file) return

    setState('processing')
    setErrorMsg('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('jobId', jobId)

      const res = await fetch('/api/bulk-upload', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        setState('error')
        setErrorMsg(json.error || 'Upload failed')
        return
      }

      setSummary(json.data)
      setState('done')
      onComplete?.()
    } catch {
      setState('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  const statusBadge = (status: BulkResult['status']) => {
    switch (status) {
      case 'created':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Created</Badge>
      case 'updated':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Updated</Badge>
      case 'skipped':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Skipped</Badge>
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Resume Upload</DialogTitle>
          <DialogDescription>
            Upload a ZIP file containing PDF resumes for &quot;{jobTitle}&quot;
          </DialogDescription>
        </DialogHeader>

        {/* Idle State */}
        {state === 'idle' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileArchive className="h-8 w-8 text-blue-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                  <p className="text-sm font-medium text-gray-700">
                    Drop a ZIP file here or click to browse
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ZIP must contain PDF resumes (max 50 files, 10MB each)
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {errorMsg && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file}>
                <Upload className="h-4 w-4 mr-2" />
                Upload &amp; Process
              </Button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {state === 'processing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-4" />
            <p className="font-medium text-gray-900">Processing resumes...</p>
            <p className="text-sm text-gray-500 mt-1">
              Extracting and parsing PDFs with AI. This may take a few minutes.
            </p>
          </div>
        )}

        {/* Done State */}
        {state === 'done' && summary && (
          <div className="space-y-4 overflow-hidden flex flex-col">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3">
              {summary.created > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{summary.created} created</span>
                </div>
              )}
              {summary.updated > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{summary.updated} updated</span>
                </div>
              )}
              {summary.skipped > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="font-medium">{summary.skipped} skipped</span>
                </div>
              )}
              {summary.failed > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="font-medium">{summary.failed} failed</span>
                </div>
              )}
            </div>

            {/* Results table */}
            <div className="border rounded-lg overflow-auto max-h-[40vh]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Filename</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Candidate</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.results.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[180px]">{r.filename}</td>
                      <td className="px-3 py-2">{statusBadge(r.status)}</td>
                      <td className="px-3 py-2 text-gray-700">{r.candidateName || '-'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetState}>
                Upload Another
              </Button>
              <Button onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="py-8 text-center space-y-4">
            <XCircle className="h-10 w-10 mx-auto text-red-500" />
            <div>
              <p className="font-medium text-gray-900">Upload Failed</p>
              <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setState('idle')}>
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
