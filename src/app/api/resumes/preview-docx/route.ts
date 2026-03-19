import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import mammoth from 'mammoth'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = request.nextUrl.searchParams.get('url')
    if (!url) {
      return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
    }

    // Extract storage path from public URL
    const urlObj = new URL(url)
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/resumes\/(.+)/)
    if (!pathMatch) {
      return NextResponse.json({ error: 'Invalid resume URL' }, { status: 400 })
    }

    const storagePath = decodeURIComponent(pathMatch[1])

    const { data, error } = await supabase.storage.from('resumes').download(storagePath)
    if (error || !data) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }

    const arrayBuffer = await data.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = await mammoth.convertToHtml({ buffer })

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
    font-size: 14px;
  }
  h1 { font-size: 22px; margin: 16px 0 8px; }
  h2 { font-size: 18px; margin: 14px 0 6px; }
  h3 { font-size: 16px; margin: 12px 0 4px; }
  p { margin: 6px 0; }
  ul, ol { padding-left: 24px; margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  td, th { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  a { color: #2563eb; }
  img { max-width: 100%; }
</style>
</head>
<body>${result.value}</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to convert document' }, { status: 500 })
  }
}
