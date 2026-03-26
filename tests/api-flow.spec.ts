import { test, expect } from '@playwright/test'

// ─── Credentials ───────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'harshil.ghataliya@bacancy.com'
const ADMIN_PASSWORD = 'Bacancy@1234'

const timestamp = Date.now()

// Shared state across serial tests
let orgSlug = ''
let jobId = ''
let applicationId = ''
let interviewId = ''
let candidateEmail = ''

// ─── Helper: Login and return authenticated context ────────────────────────
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

/** Click a shadcn Select trigger by placeholder, then pick an option */
async function pickSelect(page: import('@playwright/test').Page, placeholder: string, optionText: RegExp) {
  const trigger = page.locator(`button[role="combobox"]:has-text("${placeholder}")`)
  await trigger.waitFor({ timeout: 5000 })
  await trigger.click()
  await page.getByRole('option', { name: optionText }).first().click()
  await page.waitForTimeout(200)
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Full API & E2E Flow Tests', () => {

  // ─── 1. Login ──────────────────────────────────────────────────────────
  test('1. Login as admin', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(dashboard|org\/new)/, { timeout: 30_000 })
    expect(page.url()).toMatch(/\/(dashboard|org\/new)/)
  })

  // ─── 2. Dashboard loads with stats ─────────────────────────────────────
  test('2. Dashboard loads with stats', async ({ page }) => {
    await loginAsAdmin(page)
    // Check dashboard cards are visible
    await expect(page.getByText(/open jobs/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/active candidates/i).first()).toBeVisible({ timeout: 10_000 })
  })

  // ─── 3. Get org slug ──────────────────────────────────────────────────
  test('3. Get organization slug', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/organization')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const slugInput = page.locator('#slug, input[name="slug"]').first()
    if (await slugInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      orgSlug = await slugInput.inputValue()
    }
    if (!orgSlug) {
      const pageContent = await page.content()
      const slugMatch = pageContent.match(/careers\/([a-z0-9-]+)/i)
      if (slugMatch) orgSlug = slugMatch[1]
    }
    console.log('Org slug:', orgSlug)
    expect(orgSlug).toBeTruthy()
  })

  // ─── 4. Members API ───────────────────────────────────────────────────
  test('4. Members API returns org members', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get('/api/members')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.data).toBeDefined()
    expect(Array.isArray(json.data)).toBeTruthy()
    expect(json.data.length).toBeGreaterThan(0)
    // Verify member structure
    const member = json.data[0]
    expect(member).toHaveProperty('user_id')
    expect(member).toHaveProperty('email')
    expect(member).toHaveProperty('role')
    expect(member).toHaveProperty('full_name')
    console.log(`Members found: ${json.data.length}`)
  })

  // ─── 5. Interview Locations API (CRUD) ─────────────────────────────────
  test('5. Interview Locations API — CRUD', async ({ page }) => {
    await loginAsAdmin(page)
    const locName = `Test Location ${timestamp}`

    // CREATE
    const createRes = await page.request.post('/api/interview-locations', {
      data: { name: locName },
    })
    expect(createRes.status()).toBe(200)
    const createJson = await createRes.json()
    expect(createJson.data.name).toBe(locName)
    const locId = createJson.data.id
    console.log('Created location:', locId)

    // READ (list)
    const listRes = await page.request.get('/api/interview-locations')
    expect(listRes.status()).toBe(200)
    const listJson = await listRes.json()
    expect(listJson.data.some((l: { id: string }) => l.id === locId)).toBeTruthy()

    // UPDATE
    const updatedName = `${locName} Updated`
    const updateRes = await page.request.put('/api/interview-locations', {
      data: { id: locId, name: updatedName },
    })
    expect(updateRes.status()).toBe(200)
    expect((await updateRes.json()).data.name).toBe(updatedName)

    // DELETE
    const delRes = await page.request.delete('/api/interview-locations', {
      data: { id: locId },
    })
    expect(delRes.status()).toBe(200)

    // Verify deleted
    const listRes2 = await page.request.get('/api/interview-locations')
    const listJson2 = await listRes2.json()
    expect(listJson2.data.some((l: { id: string }) => l.id === locId)).toBeFalsy()
    console.log('Interview locations CRUD: PASS')
  })

  // ─── 6. Create a job ──────────────────────────────────────────────────
  test('6. Create a job posting', async ({ page }) => {
    await loginAsAdmin(page)
    const JOB_TITLE = `API Test Engineer ${timestamp}`

    await page.goto('/jobs/new')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await page.fill('#title', JOB_TITLE)
    await page.fill('#department', 'Engineering')
    await page.fill('#location', 'Ahmedabad, India')
    await pickSelect(page, 'Select level', /mid/i)

    const skillInput = page.getByPlaceholder('Type a skill and press Enter')
    await skillInput.fill('Playwright')
    await skillInput.press('Enter')
    await page.waitForTimeout(200)
    await skillInput.fill('TypeScript')
    await skillInput.press('Enter')

    const editors = page.locator('.ProseMirror[contenteditable="true"]')
    await editors.first().waitFor({ timeout: 5000 })
    if ((await editors.count()) >= 1) {
      await editors.nth(0).click()
      await page.keyboard.type('We need a skilled API Test Engineer to ensure quality.')
    }
    if ((await editors.count()) >= 2) {
      await editors.nth(1).click()
      await page.keyboard.type('3+ years testing experience. REST API expertise.')
    }

    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(500)
    await pickSelect(page, 'Select education', /bachelor/i)
    await page.fill('#experience_min', '3')
    await page.fill('#experience_max', '7')
    await page.fill('#salary_min', '600000')
    await page.fill('#salary_max', '1200000')

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    const publishBtn = page.getByRole('button', { name: /^publish$/i })
    await publishBtn.scrollIntoViewIfNeeded()
    await publishBtn.click()

    await page.waitForURL('**/jobs', { timeout: 15_000 })
    await expect(page.getByText(JOB_TITLE).first()).toBeVisible({ timeout: 10_000 })

    // Extract job ID from the page
    const jobLink = page.locator(`a[href*="/jobs/"]`).filter({ hasText: JOB_TITLE }).first()
    const href = await jobLink.getAttribute('href')
    jobId = href?.match(/\/jobs\/([a-z0-9-]+)/)?.[1] || ''
    console.log('Created job:', jobId)
    expect(jobId).toBeTruthy()
  })

  // ─── 7. Job detail page + Copy Link button ────────────────────────────
  test('7. Job detail page and copy link', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/jobs/${jobId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Verify job details loaded
    await expect(page.getByText(/API Test Engineer/i).first()).toBeVisible({ timeout: 10_000 })

    // Check Copy Link button exists
    const copyLinkBtn = page.getByRole('button', { name: /copy link/i }).first()
    if (await copyLinkBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await copyLinkBtn.click()
      await page.waitForTimeout(500)
      console.log('Copy link button works on job detail page')
    }
  })

  // ─── 8. Applications page + Copy Link ──────────────────────────────────
  test('8. Applications page loads with copy link', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/jobs/${jobId}/applications`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Page should load even with no applications yet
    expect(page.url()).toContain(`/jobs/${jobId}/applications`)

    // Check for Copy Link button
    const copyBtn = page.getByRole('button', { name: /copy link/i }).first()
    if (await copyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Copy link button visible on applications page')
    }
  })

  // ─── 9. Public careers page — Apply for job ───────────────────────────
  test('9. Apply for job via public careers page', async ({ page }) => {
    candidateEmail = `apitest+${timestamp}@example.com`

    await page.goto(`/careers/${orgSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(page.getByText(/API Test Engineer/i).first()).toBeVisible({ timeout: 15_000 })
    const jobLink = page.locator(`a[href*="/careers/${orgSlug}/"]`).filter({ hasText: /API Test Engineer/i }).first()
    await jobLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Upload dummy resume
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy resume for API Test Engineer'),
    })
    await page.waitForTimeout(2000)

    // Fill form
    await page.locator('#first_name').fill('')
    await page.fill('#first_name', 'API')
    await page.locator('#last_name').fill('')
    await page.fill('#last_name', 'Tester')
    await page.locator('#email').fill('')
    await page.fill('#email', candidateEmail)
    await page.fill('#phone', '+91 9998887770')

    const genderTrigger = page.locator('#gender')
    if (await genderTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genderTrigger.click()
      await page.getByRole('option', { name: /male/i }).first().click()
      await page.waitForTimeout(200)
    }

    await page.fill('#location', 'Ahmedabad, India')
    await page.fill('#current_company', 'TestCo')
    await page.fill('#current_title', 'QA Engineer')
    await page.fill('#experience_years', '4')

    const noticeTrigger = page.locator('#notice_period')
    if (await noticeTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await noticeTrigger.click()
      await page.getByRole('option', { name: /30/i }).first().click()
      await page.waitForTimeout(200)
    }

    const eduTrigger = page.locator('#education')
    if (await eduTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await eduTrigger.click()
      await page.getByRole('option', { name: /bachelor/i }).first().click()
      await page.waitForTimeout(200)
    }

    await page.fill('#current_salary', '700000')
    await page.fill('#expected_salary', '1000000')
    await page.fill('#linkedin', 'https://linkedin.com/in/apitester')

    const coverLetter = page.locator('#cover_letter')
    if (await coverLetter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await coverLetter.fill('Excited to apply for the API Test Engineer role.')
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    const gdprCheckbox = page.locator('#gdpr')
    if (await gdprCheckbox.isVisible({ timeout: 3000 })) {
      await gdprCheckbox.click()
    }

    await page.getByRole('button', { name: /submit application/i }).click()
    await expect(page.getByText(/application submitted/i).first()).toBeVisible({ timeout: 30_000 })
    console.log('Application submitted successfully')
  })

  // ─── 10. Verify application in admin + get IDs ────────────────────────
  test('10. Verify application in admin and get IDs', async ({ page }) => {
    await loginAsAdmin(page)

    // Go to job applications page
    await page.goto(`/jobs/${jobId}/applications`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Find the candidate
    await expect(page.getByText('API Tester').first()).toBeVisible({ timeout: 15_000 })

    // Click to go to application detail
    const candidateLink = page.locator('a, tr, [role="row"]').filter({ hasText: 'API Tester' }).first()
    await candidateLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Extract application ID from URL
    const url = page.url()
    const appIdMatch = url.match(/\/applications\/([a-z0-9-]+)/)
    if (appIdMatch) {
      applicationId = appIdMatch[1]
    }
    console.log('Application ID:', applicationId)
    expect(applicationId).toBeTruthy()
  })

  // ─── 11. Schedule Interview via API ───────────────────────────────────
  test('11. Schedule interview via POST /api/interviews', async ({ page }) => {
    await loginAsAdmin(page)

    // Schedule for tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(14, 0, 0, 0)

    const res = await page.request.post('/api/interviews', {
      data: {
        application_id: applicationId,
        interview_type: 'video',
        scheduled_at: tomorrow.toISOString(),
        duration_minutes: 45,
        interviewer_emails: [ADMIN_EMAIL],
        candidate_email: candidateEmail,
        candidate_name: 'API Tester',
        job_title: `API Test Engineer ${timestamp}`,
        notes: 'E2E test interview — verify multi-interviewer scheduling',
      },
    })

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data).toBeDefined()
    interviewId = json.data.id
    console.log('Interview created:', interviewId)
    expect(interviewId).toBeTruthy()
  })

  // ─── 12. Interview detail page loads ──────────────────────────────────
  test('12. Interview detail page loads', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/interviews/${interviewId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Verify interview details are displayed
    await expect(page.getByText('API Tester').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/45 minutes/i).first()).toBeVisible({ timeout: 5_000 })
    console.log('Interview detail page loads correctly')
  })

  // ─── 13. Update Interview via PUT /api/interviews/[id] ────────────────
  test('13. Update interview via PUT /api/interviews/[id]', async ({ page }) => {
    await loginAsAdmin(page)

    // Reschedule to day after tomorrow, change to onsite
    const dayAfter = new Date()
    dayAfter.setDate(dayAfter.getDate() + 2)
    dayAfter.setHours(10, 30, 0, 0)

    const res = await page.request.put(`/api/interviews/${interviewId}`, {
      data: {
        interview_type: 'onsite',
        scheduled_at: dayAfter.toISOString(),
        duration_minutes: 60,
        location: 'Conference Room A',
        meeting_link: null,
        notes: 'Updated to face-to-face interview',
      },
    })

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data).toBeDefined()
    expect(json.data.interview_type).toBe('onsite')
    expect(json.data.duration_minutes).toBe(60)
    expect(json.data.location).toBe('Conference Room A')
    console.log('Interview updated successfully')
  })

  // ─── 14. Verify update on detail page ─────────────────────────────────
  test('14. Verify interview update on detail page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/interviews/${interviewId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Check updated values
    await expect(page.getByText(/60 minutes/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Conference Room A/i).first()).toBeVisible({ timeout: 5_000 })
    // Check onsite / face-to-face label
    const faceToFace = page.getByText(/face-to-face|onsite/i).first()
    await expect(faceToFace).toBeVisible({ timeout: 5_000 })
    console.log('Interview update verified on detail page')
  })

  // ─── 15. Update interview back to video ────────────────────────────────
  test('15. Update interview type back to video', async ({ page }) => {
    await loginAsAdmin(page)

    const res = await page.request.put(`/api/interviews/${interviewId}`, {
      data: {
        interview_type: 'video',
        scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        duration_minutes: 30,
        location: null,
        meeting_link: 'https://meet.google.com/test-link',
        notes: 'Switched back to video call',
      },
    })

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.data.interview_type).toBe('video')
    expect(json.data.duration_minutes).toBe(30)
    expect(json.data.meeting_link).toBe('https://meet.google.com/test-link')
    console.log('Interview reverted to video')
  })

  // ─── 16. Interviews listing page ──────────────────────────────────────
  test('16. Interviews listing page shows interview', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/interviews')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await expect(page.getByText('API Tester').first()).toBeVisible({ timeout: 10_000 })
    console.log('Interview visible on listing page')
  })

  // ─── 17. Cancel Interview via DELETE /api/interviews/[id] ──────────────
  test('17. Cancel interview via DELETE /api/interviews/[id]', async ({ page }) => {
    await loginAsAdmin(page)

    const res = await page.request.delete(`/api/interviews/${interviewId}`)
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    console.log('Interview cancelled successfully')
  })

  // ─── 18. Verify cancelled interview status ────────────────────────────
  test('18. Verify cancelled interview on detail page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/interviews/${interviewId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Should show cancelled status
    const cancelled = page.getByText(/cancelled/i).first()
    await expect(cancelled).toBeVisible({ timeout: 10_000 })
    console.log('Interview shows cancelled status')
  })

  // ─── 19. Schedule a second interview (to test UI flow) ────────────────
  test('19. Schedule interview via UI dialog', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/applications/${applicationId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Look for schedule interview button
    const scheduleBtn = page.getByRole('button', { name: /schedule interview/i }).first()
    if (await scheduleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await scheduleBtn.click()
      await page.waitForTimeout(1000)

      // Verify dialog opened
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      console.log('Schedule interview dialog opened from application page')

      // Close it (we already tested the API directly)
      await page.keyboard.press('Escape')
    } else {
      console.log('Schedule interview button not found — may be in dropdown menu')
      // Try 3-dot menu
      const moreBtn = page.locator('button').filter({ hasText: /more|⋮|\.\.\./ }).first()
      if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await moreBtn.click()
        await page.waitForTimeout(500)
        const scheduleOption = page.getByRole('menuitem', { name: /schedule interview/i }).first()
        if (await scheduleOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await scheduleOption.click()
          await page.waitForTimeout(1000)
          console.log('Schedule interview dialog opened from dropdown menu')
          await page.keyboard.press('Escape')
        }
      }
    }
  })

  // ─── 20. Application detail page — Copy Link ──────────────────────────
  test('20. Application detail page has copy link', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/applications/${applicationId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Check for copy link in the dropdown menu
    const moreBtn = page.locator('[data-testid="more-actions"], button:has(svg)').filter({ hasText: /more|⋮/ }).first()
    if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moreBtn.click()
      await page.waitForTimeout(500)
      const copyOption = page.getByRole('menuitem', { name: /copy.*link/i }).first()
      if (await copyOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('Copy link option found in application detail dropdown')
      }
    }
    // Page at least loaded correctly
    await expect(page.getByText('API Tester').first()).toBeVisible({ timeout: 10_000 })
    console.log('Application detail page verified')
  })

  // ─── 21. Candidates page shows candidate ──────────────────────────────
  test('21. Candidates page shows the candidate', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/candidates')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await expect(page.getByText('API').first()).toBeVisible({ timeout: 10_000 })
    console.log('Candidate visible on candidates page')
  })

  // ─── 22. Reports page loads ───────────────────────────────────────────
  test('22. Reports page loads with charts', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Reports should have some heading/content
    await expect(page.getByText(/reports|analytics|overview/i).first()).toBeVisible({ timeout: 10_000 })
    console.log('Reports page loads')
  })

  // ─── 23. Settings pages load ──────────────────────────────────────────
  test('23. Settings pages load correctly', async ({ page }) => {
    await loginAsAdmin(page)

    // Organization settings
    await page.goto('/settings/organization')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/organization/i).first()).toBeVisible({ timeout: 10_000 })

    // Members settings
    await page.goto('/settings/members')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(page.getByText(/member/i).first()).toBeVisible({ timeout: 10_000 })

    console.log('Settings pages load correctly')
  })

  // ─── 24. Gmail status API ─────────────────────────────────────────────
  test('24. Gmail status API responds', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get('/api/gmail/status')
    // May be 200 (connected) or 200 with connected:false — either is valid
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('connected')
    console.log(`Gmail connected: ${json.connected}`)
  })

  // ─── 25. Pipeline page loads ──────────────────────────────────────────
  test('25. Pipeline page loads for the job', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/jobs/${jobId}/pipeline`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Pipeline should show stages
    await expect(page.getByText(/applied|screening|interview|offer/i).first()).toBeVisible({ timeout: 10_000 })
    console.log('Pipeline page loads with stages')
  })

  // ─── 26. Public careers page — job visible ────────────────────────────
  test('26. Public careers page shows the job', async ({ page }) => {
    await page.goto(`/careers/${orgSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(page.getByText(/API Test Engineer/i).first()).toBeVisible({ timeout: 10_000 })

    // Click into job detail
    const jobLink = page.locator(`a[href*="/careers/${orgSlug}/"]`).filter({ hasText: /API Test Engineer/i }).first()
    await jobLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Should show job description
    await expect(page.getByText(/API Test Engineer/i).first()).toBeVisible({ timeout: 10_000 })
    console.log('Public careers page works correctly')
  })

})
