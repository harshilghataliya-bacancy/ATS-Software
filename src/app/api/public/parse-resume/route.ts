import { NextResponse } from 'next/server'
import { parseResumeFromBytes } from '@/lib/services/resume-parser'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const pdfBytes = new Uint8Array(arrayBuffer)

    const { data, error } = await parseResumeFromBytes(pdfBytes)

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to parse resume' },
        { status: 422 }
      )
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
