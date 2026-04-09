import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOAuth2Client, getValidAccessToken } from '@/lib/services/gmail'
import { parseResumeFromBytes } from '@/lib/services/resume-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncStats {
  processed: number
  created: number
  skipped: number
  errors: number
}

interface AttachmentInfo {
  attachmentId: string
  filename: string
  mimeType: string
}

// ---------------------------------------------------------------------------
// Main entry: process all orgs
// ---------------------------------------------------------------------------

export async function processInboxSync(): Promise<SyncStats> {
  const supabase = createAdminClient()
  const totals: SyncStats = { processed: 0, created: 0, skipped: 0, errors: 0 }

  const { data: configs } = await supabase
    .from('inbox_sync_config')
    .select('*, organizations(id, name)')
    .eq('enabled', true)

  if (!configs || configs.length === 0) {
    console.log('[InboxSync] No orgs have inbox sync enabled')
    return totals
  }

  for (const config of configs) {
    try {
      console.log(`[InboxSync] Processing org: ${config.organization_id}`)
      const stats = await processOrgInboxSync(supabase, config)
      totals.processed += stats.processed
      totals.created += stats.created
      totals.skipped += stats.skipped
      totals.errors += stats.errors
    } catch (err) {
      console.error(`[InboxSync] Org ${config.organization_id} failed:`, err)
      totals.errors++
    }
  }

  return totals
}

// ---------------------------------------------------------------------------
// Per-org processing
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOrgInboxSync(supabase: any, config: any): Promise<SyncStats> {
  const stats: SyncStats = { processed: 0, created: 0, skipped: 0, errors: 0 }
  const orgId = config.organization_id

  // Find an admin with Gmail connected
  const { data: adminMembers } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .is('deleted_at', null)

  if (!adminMembers || adminMembers.length === 0) {
    console.log(`[InboxSync] No admins found for org ${orgId}`)
    return stats
  }

  // Try to get a valid token from any admin
  let accessToken: string | null = null
  for (const admin of adminMembers) {
    const tokenResult = await getValidAccessToken(supabase, admin.user_id, orgId)
    if (tokenResult.accessToken) {
      accessToken = tokenResult.accessToken
      break
    }
  }

  if (!accessToken) {
    console.log(`[InboxSync] No valid Gmail token for org ${orgId}`)
    return stats
  }

  // Set up Gmail API client
  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: client })

  // Fetch recent messages with attachments
  const query = 'has:attachment (filename:pdf OR filename:doc OR filename:docx)'
  const afterDate = config.last_synced_at
    ? Math.floor(new Date(config.last_synced_at).getTime() / 1000)
    : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) // last 24 hours on first run

  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `${query} after:${afterDate}`,
      maxResults: 50,
    })

    const messages = listRes.data.messages || []
    console.log(`[InboxSync] Found ${messages.length} messages for org ${orgId}`)

    for (const msg of messages) {
      if (!msg.id) continue

      try {
        const result = await processMessage(supabase, gmail, orgId, msg.id, config)
        if (result === 'created') { stats.created++; stats.processed++ }
        else if (result === 'updated') { stats.processed++ }
        else if (result === 'skipped') { stats.skipped++ }
      } catch (err) {
        console.error(`[InboxSync] Message ${msg.id} failed:`, err)
        stats.errors++
      }
    }

    // Update last synced timestamp
    await supabase
      .from('inbox_sync_config')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', config.id)
  } catch (err) {
    console.error(`[InboxSync] Gmail API error for org ${orgId}:`, err)
    stats.errors++
  }

  return stats
}

// ---------------------------------------------------------------------------
// Process a single message
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processMessage(
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gmail: any,
  orgId: string,
  messageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
): Promise<'created' | 'updated' | 'skipped'> {
  // Check if already processed
  const { data: existing } = await supabase
    .from('inbox_sync_log')
    .select('id')
    .eq('organization_id', orgId)
    .eq('gmail_message_id', messageId)
    .maybeSingle()

  if (existing) return 'skipped'

  // Fetch full message
  const msgRes = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const payload = msgRes.data.payload
  const headers = payload?.headers || []
  const { email: senderEmail, name: senderName } = extractSenderInfo(headers)

  if (!senderEmail) {
    await logSync(supabase, orgId, messageId, msgRes.data.threadId, '', '', getHeader(headers, 'Subject'), null, 'failed', 'Could not parse sender email', 0)
    return 'skipped'
  }

  // Find resume attachments
  const attachments = findResumeAttachments(payload)

  if (attachments.length === 0) {
    await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), null, 'skipped_no_attachment', null, 0)
    return 'skipped'
  }

  // Download the first resume attachment
  const att = attachments[0]
  const attRes = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: att.attachmentId,
  })

  const base64Data = attRes.data.data
  if (!base64Data) {
    await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), null, 'failed', 'Empty attachment data', attachments.length)
    return 'skipped'
  }

  // Decode base64url to bytes
  const resumeBytes = new Uint8Array(Buffer.from(base64Data, 'base64url'))

  // Check size (max 10MB)
  if (resumeBytes.length > 10 * 1024 * 1024) {
    await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), null, 'failed', 'Resume too large (>10MB)', attachments.length)
    return 'skipped'
  }

  // Check if candidate already exists by email
  const { data: existingCandidate } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, email')
    .eq('organization_id', orgId)
    .eq('email', senderEmail)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingCandidate) {
    // Check for active applications
    const { data: activeApps } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', existingCandidate.id)
      .not('status', 'in', '("rejected","withdrawn","hired")')
      .limit(1)

    if (activeApps && activeApps.length > 0) {
      await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), existingCandidate.id, 'skipped_active_application', null, attachments.length)
      return 'skipped'
    }

    // Update existing candidate's resume
    const fileExt = att.filename.split('.').pop() || 'pdf'
    const storagePath = `${orgId}/${existingCandidate.id}/resume.${fileExt}`
    await supabase.storage.from('resumes').upload(storagePath, resumeBytes, {
      contentType: att.mimeType,
      upsert: true,
    })
    const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(storagePath)

    await supabase
      .from('candidates')
      .update({
        resume_url: urlData.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCandidate.id)

    // Re-parse resume
    if (config.auto_parse_resume) {
      parseResumeAndUpdate(supabase, existingCandidate.id, resumeBytes, att.filename).catch(() => {})
    }

    await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), existingCandidate.id, 'processed', 'Updated existing candidate resume', attachments.length)
    return 'updated'
  }

  // --- New candidate ---

  // Quick-parse resume for name/details
  const parsedName = { first: senderName.split(' ')[0] || 'Unknown', last: senderName.split(' ').slice(1).join(' ') || '' }
  let parsedData = null as Record<string, unknown> | null

  if (config.auto_parse_resume) {
    const { data: parsed } = await parseResumeFromBytes(resumeBytes, att.filename)
    if (parsed) {
      parsedData = parsed as unknown as Record<string, unknown>
      if (parsed.first_name) parsedName.first = parsed.first_name
      if (parsed.last_name) parsedName.last = parsed.last_name
    }
  }

  // Create candidate
  const { data: newCandidate, error: insertError } = await supabase
    .from('candidates')
    .insert({
      organization_id: orgId,
      first_name: parsedName.first,
      last_name: parsedName.last,
      email: senderEmail,
      phone: parsedData?.phone || null,
      current_title: parsedData?.current_title || null,
      current_company: parsedData?.current_company || null,
      location: parsedData?.location || null,
      experience_years: parsedData?.experience_years ?? null,
      source: 'direct',
      source_details: 'Auto-imported from email inbox',
      tags: config.source_tag ? [config.source_tag] : ['email-inbox'],
      created_by: null,
    })
    .select('id')
    .single()

  if (insertError || !newCandidate) {
    // Possible race condition / duplicate
    await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), null, 'failed', insertError?.message || 'Insert failed', attachments.length)
    return 'skipped'
  }

  // Upload resume to storage
  const fileExt = att.filename.split('.').pop() || 'pdf'
  const storagePath = `${orgId}/${newCandidate.id}/resume.${fileExt}`
  await supabase.storage.from('resumes').upload(storagePath, resumeBytes, {
    contentType: att.mimeType,
    upsert: true,
  })
  const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(storagePath)

  // Update candidate with resume URL and parsed data
  const updateFields: Record<string, unknown> = { resume_url: urlData.publicUrl }
  if (parsedData) {
    updateFields.resume_parsed_data = parsedData
  }
  await supabase.from('candidates').update(updateFields).eq('id', newCandidate.id)

  await logSync(supabase, orgId, messageId, msgRes.data.threadId, senderEmail, senderName, getHeader(headers, 'Subject'), newCandidate.id, 'processed', null, attachments.length)
  return 'created'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSenderInfo(headers: any[]): { email: string; name: string } {
  const from = getHeader(headers, 'From') || ''
  // Parse "Name <email>" or just "email"
  const match = from.match(/^(?:"?(.+?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/)
  if (match) {
    return { email: match[2].toLowerCase(), name: match[1]?.trim() || match[2].split('@')[0] }
  }
  return { email: '', name: '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHeader(headers: any[], name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findResumeAttachments(payload: any): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = []
  walkParts(payload, attachments)
  return attachments
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkParts(part: any, attachments: AttachmentInfo[]) {
  if (!part) return

  if (part.filename && part.body?.attachmentId) {
    const fn = part.filename.toLowerCase()
    if (fn.endsWith('.pdf') || fn.endsWith('.doc') || fn.endsWith('.docx')) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/pdf',
      })
    }
  }

  if (part.parts) {
    for (const child of part.parts) {
      walkParts(child, attachments)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logSync(
  supabase: any,
  orgId: string,
  messageId: string,
  threadId: string | null,
  fromEmail: string,
  fromName: string,
  subject: string | null,
  candidateId: string | null,
  status: string,
  errorMessage: string | null,
  attachmentsFound: number
) {
  await supabase.from('inbox_sync_log').insert({
    organization_id: orgId,
    gmail_message_id: messageId,
    gmail_thread_id: threadId || null,
    from_email: fromEmail,
    from_name: fromName || null,
    subject: subject || null,
    received_at: new Date().toISOString(),
    candidate_id: candidateId,
    status,
    error_message: errorMessage,
    attachments_found: attachmentsFound,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseResumeAndUpdate(supabase: any, candidateId: string, bytes: Uint8Array, fileName: string) {
  const { data: parsed } = await parseResumeFromBytes(bytes, fileName)
  if (parsed) {
    const updates: Record<string, unknown> = { resume_parsed_data: parsed }
    if (parsed.current_title) updates.current_title = parsed.current_title
    if (parsed.current_company) updates.current_company = parsed.current_company
    if (parsed.location) updates.location = parsed.location
    if (parsed.experience_years) updates.experience_years = parsed.experience_years
    await supabase.from('candidates').update(updates).eq('id', candidateId)
  }
}
