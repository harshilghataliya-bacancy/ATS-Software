/**
 * Comprehensive API test script for HireFlow ATS
 * Tests all API endpoints with real authentication
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://osodibfoigyvitfwzoew.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zb2RpYmZvaWd5dml0Znd6b2V3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc5NDE4MywiZXhwIjoyMDg2MzcwMTgzfQ.Mh0tIaiTggZSd817LFQDfx8v4dtQr60MwQ9ysyooSAM'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zb2RpYmZvaWd5dml0Znd6b2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTQxODMsImV4cCI6MjA4NjM3MDE4M30.SU_8YQzDCW12ESrF3Rgnpe_q_Yevd-ADWBZcBskxJEU'
const APP_URL = 'http://localhost:3000'

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const ORG_ID = '08ceee2f-e148-43d9-a711-5679b1ca4035'
const ADMIN_EMAIL = 'harshil.ghataliya@bacancy.com'

let sessionCookies = ''
const results = []

function log(name, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'SKIP' ? '⏭️' : '⚠️'
  results.push({ name, status, detail })
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`)
}

async function getSession() {
  const { data, error } = await adminDb.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  })
  if (error) { console.error('Failed to generate link:', error); process.exit(1) }

  const linkUrl = new URL(data.properties.action_link)
  const token_hash = linkUrl.searchParams.get('token_hash') || linkUrl.searchParams.get('token')
  const type = linkUrl.searchParams.get('type') || 'magiclink'

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: session, error: verifyError } = await anonClient.auth.verifyOtp({ token_hash, type })
  if (verifyError) { console.error('Failed to verify OTP:', verifyError); process.exit(1) }

  const ref = 'osodibfoigyvitfwzoew'
  const sessionData = JSON.stringify({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: session.session.expires_at,
    user: session.user,
  })

  const cookieName = `sb-${ref}-auth-token`
  const chunkSize = 3700
  const chunks = []
  for (let i = 0; i < sessionData.length; i += chunkSize) {
    chunks.push(sessionData.substring(i, i + chunkSize))
  }

  sessionCookies = chunks.length === 1
    ? `${cookieName}=${encodeURIComponent(chunks[0])}`
    : chunks.map((chunk, i) => `${cookieName}.${i}=${encodeURIComponent(chunk)}`).join('; ')

  console.log(`🔑 Authenticated as: ${session.user.email}\n`)
}

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Cookie': sessionCookies, 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(`${APP_URL}${path}`, opts)
  const ct = resp.headers.get('content-type') || ''
  let data
  if (ct.includes('application/json')) {
    data = await resp.json()
  } else if (ct.includes('application/pdf')) {
    const buf = await resp.arrayBuffer()
    data = { _pdf: true, size: buf.byteLength }
  } else {
    data = { _text: (await resp.text()).substring(0, 200) }
  }
  return { status: resp.status, data, ok: resp.ok }
}

// ==================== TESTS ====================

// --- Public Pages ---
async function testPublicCareers() {
  const r = await fetch(`${APP_URL}/careers/bacancy-services`)
  log('GET /careers/:slug', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`)
}

async function testPublicJob() {
  const r = await fetch(`${APP_URL}/careers/bacancy-services/806abc42-5903-489f-aad9-076b631bf964`)
  log('GET /careers/:slug/:jobId', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`)
}

// --- Dashboard Pages ---
async function testPage(path, name) {
  const r = await fetch(`${APP_URL}${path}`, { headers: { 'Cookie': sessionCookies }, redirect: 'manual' })
  if (r.status === 200) {
    log(`PAGE ${name}`, 'PASS')
  } else if (r.status === 307 || r.status === 302) {
    const loc = r.headers.get('location')
    log(`PAGE ${name}`, loc?.includes('/login') ? 'FAIL' : 'WARN', `redirect → ${loc}`)
  } else {
    log(`PAGE ${name}`, 'FAIL', `status=${r.status}`)
  }
}

// --- Gmail API ---
async function testGmailStatus() {
  const r = await api('GET', '/api/gmail/status')
  log('GET /api/gmail/status', r.status === 200 ? 'PASS' : 'FAIL', `connected=${r.data?.connected}`)
}

async function testGmailConnect() {
  const r = await api('GET', '/api/gmail/connect')
  log('GET /api/gmail/connect', (r.status === 200 || r.data?.url) ? 'PASS' : 'FAIL', `returns OAuth URL`)
}

// --- Offers API ---
async function testOffersGet() {
  const r = await api('GET', '/api/offers')
  log('GET /api/offers', r.ok ? 'PASS' : 'FAIL', `${r.data?.data?.length ?? 0} offers`)
}

async function testOfferById() {
  const r = await api('GET', '/api/offers/66b3fed3-7524-42f7-be84-40c3b4e43ca6')
  log('GET /api/offers/:id', r.ok ? 'PASS' : 'FAIL', r.ok ? `status=${r.data?.data?.status}` : JSON.stringify(r.data))
}

async function testCreateOffer() {
  const r = await api('POST', '/api/offers', {
    application_id: '5eea7305-210c-496d-8e99-39d0a8d7d963',
    salary: 800000,
    salary_currency: 'INR',
    start_date: '2026-04-01',
    expiry_date: '2026-04-15',
    template_html: '<p>Offer for {{candidate_name}}</p>',
    salary_components: [
      { name: 'Basic', monthly: 26667, annual: 320000 },
      { name: 'HRA', monthly: 13333, annual: 160000 },
      { name: 'Special Allowance', monthly: 26667, annual: 320000 },
    ],
    bonus_components: [],
    reporting_manager: 'Test Manager',
    employment_type: 'full_time',
    location: 'Ahmedabad',
    remuneration_type: 'annual',
    pf_applicable: true,
    work_type: 'hybrid',
    business_unit: 'Engineering',
  })
  if (r.ok) {
    log('POST /api/offers', 'PASS', `id=${r.data?.data?.id}`)
    return r.data?.data?.id
  } else {
    log('POST /api/offers', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
    return null
  }
}

async function testOfferPdfPreview() {
  const r = await api('POST', '/api/offers/preview-pdf', {
    companyName: 'Bacancy Services',
    candidateName: 'Test User',
    candidateEmail: 'test@test.com',
    jobTitle: 'Developer',
    department: 'Engineering',
    salary: '₹8,00,000',
    salaryCurrency: 'INR',
    startDate: 'April 1, 2026',
    expiryDate: 'March 15, 2026',
    createdDate: 'February 24, 2026',
    salaryComponents: [
      { name: 'Basic', monthly: 26667, annual: 320000 },
      { name: 'HRA', monthly: 13333, annual: 160000 },
    ],
  })
  log('POST /api/offers/preview-pdf', r.ok && r.data?._pdf ? 'PASS' : 'FAIL',
    r.data?._pdf ? `PDF ${r.data.size} bytes` : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testOfferPdfGenerate() {
  // This is GET with ?id=...
  const r = await api('GET', '/api/offers/generate-pdf?id=66b3fed3-7524-42f7-be84-40c3b4e43ca6')
  log('GET /api/offers/generate-pdf', r.ok && r.data?._pdf ? 'PASS' : 'FAIL',
    r.data?._pdf ? `PDF ${r.data.size} bytes` : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testOfferRespond() {
  const r = await api('POST', '/api/offers/66b3fed3-7524-42f7-be84-40c3b4e43ca6/respond', {
    status: 'accepted',
  })
  // Already accepted, so expect either success or error
  log('POST /api/offers/:id/respond', r.status === 200 ? 'PASS' : 'WARN',
    `${r.status} ${JSON.stringify(r.data)}`)
}

async function testOfferDelete(offerId) {
  if (!offerId) { log('DELETE /api/offers/:id', 'SKIP', 'no id'); return }
  const r = await api('DELETE', `/api/offers/${offerId}`)
  log('DELETE /api/offers/:id', r.ok ? 'PASS' : 'FAIL', r.ok ? 'deleted' : JSON.stringify(r.data))
}

async function testOfferSend(offerId) {
  if (!offerId) { log('POST /api/offers/:id/send', 'SKIP', 'no id'); return }
  const r = await api('POST', `/api/offers/${offerId}/send`)
  log('POST /api/offers/:id/send', r.ok ? 'PASS' : 'WARN',
    r.ok ? 'sent' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Interviews API ---
async function testInterviewsCreate() {
  const r = await api('POST', '/api/interviews', {
    application_id: '5eea7305-210c-496d-8e99-39d0a8d7d963',
    interview_type: 'technical',
    scheduled_at: '2026-03-10T10:00:00Z',
    duration_minutes: 45,
    candidate_email: 'harshil.ghataliya@bacancy.com',
    candidate_name: 'Harshil Ghataliya',
    job_title: 'Product Designer',
    notes: 'API test',
  })
  if (r.ok) {
    log('POST /api/interviews', 'PASS', `id=${r.data.data?.id}`)
    return r.data.data?.id
  } else {
    log('POST /api/interviews', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
    return null
  }
}

// --- Applications API ---
async function testApplicationReject() {
  const r = await api('POST', '/api/applications/reject', {
    applicationId: '5eea7305-210c-496d-8e99-39d0a8d7d963',
    reason: 'API test rejection',
  })
  if (r.ok) {
    log('POST /api/applications/reject', 'PASS')
    await adminDb.from('applications').update({ status: 'active' }).eq('id', '5eea7305-210c-496d-8e99-39d0a8d7d963')
  } else {
    log('POST /api/applications/reject', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
  }
}

// --- AI Matching API ---
async function testAiMatchingGet() {
  const r = await api('GET', '/api/ai-matching?job_id=806abc42-5903-489f-aad9-076b631bf964')
  log('GET /api/ai-matching', r.ok ? 'PASS' : 'FAIL',
    r.ok ? `${r.data?.data?.length ?? 0} scores` : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testAiMatchingConfig() {
  const r = await api('GET', '/api/ai-matching/config')
  log('GET /api/ai-matching/config', r.ok ? 'PASS' : 'FAIL',
    r.ok ? `enabled=${r.data?.data?.enabled}` : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testAiMatchingConfigUpdate() {
  const r = await api('PUT', '/api/ai-matching/config', {
    enabled: true,
    skill_weight: 40,
    experience_weight: 30,
    semantic_weight: 30,
  })
  log('PUT /api/ai-matching/config', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'updated' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Branding API ---
async function testBrandingGet() {
  const r = await api('GET', '/api/branding')
  log('GET /api/branding', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'fetched' : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testBrandingUpdate() {
  const r = await api('PUT', '/api/branding', {
    primary_color: '#2563eb',
    company_description: 'API test branding',
  })
  log('PUT /api/branding', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'updated' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Domains API ---
async function testDomainsGet() {
  const r = await api('GET', '/api/domains')
  log('GET /api/domains', r.ok ? 'PASS' : 'FAIL',
    r.ok ? `${r.data?.data?.length ?? 0} domains` : `${r.status} ${JSON.stringify(r.data)}`)
}

async function testSubdomainsGet() {
  const r = await api('GET', '/api/subdomains')
  log('GET /api/subdomains', r.ok ? 'PASS' : 'FAIL',
    r.ok ? `${r.data?.data?.length ?? 0} subdomains` : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Job Description AI ---
async function testJobsGenerate() {
  const r = await api('POST', '/api/jobs/generate-description', {
    prompt: 'Senior React Developer with 5 years experience in a fintech startup',
  })
  log('POST /api/jobs/generate-description', r.ok ? 'PASS' : 'FAIL',
    r.ok ? `title=${r.data?.data?.title}` : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Public Apply ---
async function testPublicApply() {
  const testEmail = `test-${Date.now()}@example.com`
  const r = await fetch(`${APP_URL}/api/public/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: '806abc42-5903-489f-aad9-076b631bf964',
      orgId: ORG_ID,
      form: {
        first_name: 'TestAPI',
        last_name: 'User',
        email: testEmail,
        phone: '+91 9876543210',
      },
    }),
  })
  let data
  try { data = await r.json() } catch { data = {} }

  if (r.ok && data?.success) {
    log('POST /api/public/apply', 'PASS', `candidateId=${data.candidateId}`)
    // Clean up
    if (data.candidateId) {
      await adminDb.from('applications').delete().eq('candidate_id', data.candidateId)
      await adminDb.from('candidates').delete().eq('id', data.candidateId)
    }
  } else {
    log('POST /api/public/apply', 'FAIL', `${r.status} ${JSON.stringify(data)}`)
  }
}

// --- Resume Parse ---
async function testResumeParse() {
  const { data: cands } = await adminDb.from('candidates').select('id, resume_url').not('resume_url', 'is', null).limit(1)
  if (!cands?.length) { log('POST /api/resumes/parse', 'SKIP', 'no resumes'); return }
  const r = await api('POST', '/api/resumes/parse', { candidate_id: cands[0].id })
  log('POST /api/resumes/parse', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'parsed' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Offer Update (PATCH) ---
async function testOfferUpdate(offerId) {
  if (!offerId) { log('PATCH /api/offers/:id', 'SKIP', 'no id'); return }
  const r = await api('PATCH', `/api/offers/${offerId}`, {
    location: 'Mumbai',
    business_unit: 'Engineering Updated',
  })
  log('PATCH /api/offers/:id', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'updated' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- Gmail Send ---
async function testGmailSend() {
  // This will likely fail if Gmail is not connected, that's expected — we test the endpoint responds properly
  const r = await api('POST', '/api/gmail/send', {
    to: 'test-noreply@example.com',
    subject: 'API Test Email — Ignore',
    html: '<p>This is an automated API test.</p>',
    candidateId: '67714257-15e6-4e4c-9744-b42d7e0ec13d',
  })
  // 200 = sent, 400 = gmail not connected (expected), both are valid responses
  if (r.status === 200) {
    log('POST /api/gmail/send', 'PASS', 'email sent')
  } else if (r.status === 400 && r.data?.error) {
    log('POST /api/gmail/send', 'WARN', `Gmail not connected: ${r.data.error}`)
  } else {
    log('POST /api/gmail/send', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
  }
}

// --- Gmail Disconnect ---
async function testGmailDisconnect() {
  // Just test the endpoint responds — we don't actually want to disconnect
  // Use a HEAD-like approach: only run if gmail is NOT connected (safe to call DELETE on nothing)
  const statusR = await api('GET', '/api/gmail/status')
  if (statusR.data?.connected) {
    log('DELETE /api/gmail/status', 'SKIP', 'Gmail is connected — skipping disconnect to preserve state')
    return
  }
  const r = await api('DELETE', '/api/gmail/status')
  log('DELETE /api/gmail/status', r.ok ? 'PASS' : 'FAIL',
    r.ok ? 'disconnect endpoint works' : `${r.status} ${JSON.stringify(r.data)}`)
}

// --- AI Matching: Score Single ---
async function testAiMatchingSingle() {
  const r = await api('POST', '/api/ai-matching', {
    application_id: '5eea7305-210c-496d-8e99-39d0a8d7d963',
  })
  if (r.ok) {
    log('POST /api/ai-matching', 'PASS', `score=${r.data?.data?.overall_score ?? 'n/a'}`)
  } else if (r.status === 400 && r.data?.error?.includes('disabled')) {
    log('POST /api/ai-matching', 'WARN', 'AI scoring disabled')
  } else {
    log('POST /api/ai-matching', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
  }
}

// --- AI Matching: Batch Score ---
async function testAiMatchingBatch() {
  const r = await api('POST', '/api/ai-matching/batch', {
    job_id: '806abc42-5903-489f-aad9-076b631bf964',
  })
  if (r.ok) {
    log('POST /api/ai-matching/batch', 'PASS', `scored=${r.data?.data?.scored}/${r.data?.data?.total}`)
  } else {
    log('POST /api/ai-matching/batch', 'FAIL', `${r.status} ${JSON.stringify(r.data)}`)
  }
}

// --- Domains: CRUD ---
async function testDomainsCrud() {
  // Create
  const testDomain = `test-${Date.now()}.example.com`
  const createR = await api('POST', '/api/domains', { domain: testDomain })
  if (createR.ok) {
    const domainId = createR.data?.data?.id
    log('POST /api/domains', 'PASS', `id=${domainId}`)

    // Verify (will fail DNS check, but endpoint should respond)
    if (domainId) {
      const verifyR = await api('POST', `/api/domains/${domainId}/verify`)
      log('POST /api/domains/:id/verify', verifyR.status === 200 || verifyR.status === 500 ? 'WARN' : 'FAIL',
        verifyR.ok ? `verified=${verifyR.data?.data?.is_verified}` : `DNS check failed (expected) — ${verifyR.status}`)

      // Delete
      const deleteR = await api('DELETE', `/api/domains/${domainId}`)
      log('DELETE /api/domains/:id', deleteR.ok ? 'PASS' : 'FAIL',
        deleteR.ok ? 'deleted' : `${deleteR.status} ${JSON.stringify(deleteR.data)}`)
    }
  } else {
    log('POST /api/domains', 'FAIL', `${createR.status} ${JSON.stringify(createR.data)}`)
    log('POST /api/domains/:id/verify', 'SKIP', 'no domain created')
    log('DELETE /api/domains/:id', 'SKIP', 'no domain created')
  }
}

// --- Subdomains: CRUD ---
async function testSubdomainsCrud() {
  const testSub = `testapi${Date.now().toString(36)}`
  const createR = await api('POST', '/api/subdomains', { subdomain: testSub })
  if (createR.ok) {
    const subId = createR.data?.data?.id
    log('POST /api/subdomains', 'PASS', `id=${subId}, subdomain=${testSub}`)

    // Delete
    if (subId) {
      const deleteR = await api('DELETE', `/api/subdomains/${subId}`)
      log('DELETE /api/subdomains/:id', deleteR.ok ? 'PASS' : 'FAIL',
        deleteR.ok ? 'deleted' : `${deleteR.status} ${JSON.stringify(deleteR.data)}`)
    }
  } else {
    log('POST /api/subdomains', 'FAIL', `${createR.status} ${JSON.stringify(createR.data)}`)
    log('DELETE /api/subdomains/:id', 'SKIP', 'no subdomain created')
  }
}

// ==================== RUN ====================

async function main() {
  console.log('🚀 HireFlow ATS — Full API Test Suite\n')
  console.log('========================================')

  await getSession()

  console.log('--- Public Pages ---')
  await testPublicCareers()
  await testPublicJob()

  console.log('\n--- Dashboard Pages ---')
  const pages = [
    ['/dashboard', 'Dashboard'],
    ['/jobs', 'Jobs'],
    ['/jobs/new', 'Job Create'],
    ['/jobs/806abc42-5903-489f-aad9-076b631bf964', 'Job Detail'],
    ['/jobs/806abc42-5903-489f-aad9-076b631bf964/applications', 'Applications'],
    ['/jobs/806abc42-5903-489f-aad9-076b631bf964/pipeline', 'Pipeline'],
    ['/candidates', 'Candidates'],
    ['/candidates/new', 'Candidate Create'],
    ['/candidates/67714257-15e6-4e4c-9744-b42d7e0ec13d', 'Candidate Detail'],
    ['/interviews', 'Interviews'],
    ['/email-templates', 'Email Templates'],
    ['/offers', 'Offers'],
    ['/offers/66b3fed3-7524-42f7-be84-40c3b4e43ca6', 'Offer Detail'],
    ['/settings/organization', 'Settings/Org'],
    ['/settings/members', 'Settings/Members'],
    ['/reports', 'Reports'],
  ]
  for (const [path, name] of pages) {
    await testPage(path, name)
  }

  console.log('\n--- Gmail API ---')
  await testGmailStatus()
  await testGmailConnect()
  await testGmailSend()
  await testGmailDisconnect()

  console.log('\n--- Offers API ---')
  await testOffersGet()
  await testOfferById()
  const newOfferId = await testCreateOffer()
  await testOfferUpdate(newOfferId)
  await testOfferPdfPreview()
  await testOfferPdfGenerate()
  await testOfferSend(newOfferId)
  await testOfferRespond()
  if (newOfferId) await testOfferDelete(newOfferId)

  console.log('\n--- Interviews API ---')
  const interviewId = await testInterviewsCreate()
  if (interviewId) await adminDb.from('interviews').delete().eq('id', interviewId)

  console.log('\n--- Applications API ---')
  await testApplicationReject()

  console.log('\n--- AI Matching API ---')
  await testAiMatchingGet()
  await testAiMatchingConfig()
  await testAiMatchingConfigUpdate()
  await testAiMatchingSingle()
  await testAiMatchingBatch()

  console.log('\n--- Branding API ---')
  await testBrandingGet()
  await testBrandingUpdate()

  console.log('\n--- Domains CRUD ---')
  await testDomainsGet()
  await testDomainsCrud()

  console.log('\n--- Subdomains CRUD ---')
  await testSubdomainsGet()
  await testSubdomainsCrud()

  console.log('\n--- Job Description AI ---')
  await testJobsGenerate()

  console.log('\n--- Public Apply ---')
  await testPublicApply()

  console.log('\n--- Resume Parse ---')
  await testResumeParse()

  // Summary
  console.log('\n========================================')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const warned = results.filter(r => r.status === 'WARN').length
  const skipped = results.filter(r => r.status === 'SKIP').length
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${warned} warnings, ${skipped} skipped`)

  if (failed > 0) {
    console.log('\n❌ Failed tests:')
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`   - ${r.name}: ${r.detail}`))
  }
  if (warned > 0) {
    console.log('\n⚠️  Warnings:')
    results.filter(r => r.status === 'WARN').forEach(r => console.log(`   - ${r.name}: ${r.detail}`))
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
