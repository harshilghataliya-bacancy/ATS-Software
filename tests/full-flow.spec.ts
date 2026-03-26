import { test, expect } from '@playwright/test'

// Use existing test credentials (email confirmation required for new signups)
const ADMIN_EMAIL = 'harshil.ghataliya@bacancy.com'
const ADMIN_PASSWORD = 'Bacancy@1234'

const timestamp = Date.now()
const JOB_TITLE = `QA Engineer ${timestamp}`
const JOB_DEPARTMENT = 'Engineering'
const JOB_LOCATION = 'Mumbai, India'

const APPLICANT_FIRST = 'Jane'
const APPLICANT_LAST = 'Doe'
const APPLICANT_EMAIL = `janedoe+${timestamp}@example.com`
const APPLICANT_PHONE = '+91 9876543210'

let orgSlug = ''

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

/** Click a shadcn Select trigger by its placeholder text, then pick an option */
async function pickSelect(page: import('@playwright/test').Page, placeholder: string, optionText: RegExp) {
  const trigger = page.locator(`button[role="combobox"]:has-text("${placeholder}")`)
  await trigger.waitFor({ timeout: 5000 })
  await trigger.click()
  await page.getByRole('option', { name: optionText }).first().click()
  await page.waitForTimeout(200)
}

test.describe.serial('Full Flow: Login → Job → Apply → Verify', () => {
  // ─── Step 1: Login as admin ────────────────────────────────────────
  test('1. Login as admin', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('#password', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/(dashboard|org\/new)/, { timeout: 30_000 })
    expect(page.url()).toMatch(/\/(dashboard|org\/new)/)
  })

  // ─── Step 2: Get org slug ──────────────────────────────────────────
  test('2. Get organization slug', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto('/settings/organization')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Let page hydrate

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

  // ─── Step 3: Create a job ──────────────────────────────────────────
  test('3. Create a job posting', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto('/jobs/new')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Let hydration + data loading complete

    // ── Basic Info ──
    await page.fill('#title', JOB_TITLE)
    await page.fill('#department', JOB_DEPARTMENT)
    await page.fill('#location', JOB_LOCATION)

    // Experience Level: placeholder "Select level"
    await pickSelect(page, 'Select level', /mid/i)

    // Skills
    const skillInput = page.getByPlaceholder('Type a skill and press Enter')
    await skillInput.fill('Playwright')
    await skillInput.press('Enter')
    await page.waitForTimeout(200)
    await skillInput.fill('TypeScript')
    await skillInput.press('Enter')

    // ── Rich Text Editors ──
    const editors = page.locator('.ProseMirror[contenteditable="true"]')
    await editors.first().waitFor({ timeout: 5000 })
    const editorCount = await editors.count()
    if (editorCount >= 1) {
      await editors.nth(0).click()
      await page.keyboard.type('We are looking for a Senior QA Engineer to lead our testing efforts.')
    }
    if (editorCount >= 2) {
      await editors.nth(1).click()
      await page.keyboard.type('5+ years of QA experience. Strong automation skills.')
    }

    // ── Scroll to qualifications and compensation ──
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(500)

    // Education Level: placeholder "Select education"
    await pickSelect(page, 'Select education', /bachelor/i)

    // Experience min/max
    await page.fill('#experience_min', '3')
    await page.fill('#experience_max', '8')

    // Compensation
    await page.fill('#salary_min', '800000')
    await page.fill('#salary_max', '1500000')

    // ── Scroll to bottom and Publish ──
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    // Click Publish
    const publishBtn = page.getByRole('button', { name: /^publish$/i })
    await publishBtn.scrollIntoViewIfNeeded()
    await publishBtn.click()

    // Wait for redirect OR check for errors
    try {
      await page.waitForURL('**/jobs', { timeout: 15_000 })
    } catch {
      // Maybe there's a validation error — take screenshot and check
      const errorText = await page.locator('.text-red-600, .text-red-700, [role="alert"]').allTextContents()
      console.log('Validation errors:', errorText)

      // If still on the page, scroll up and check what's missing
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(1000)

      // Try to screenshot for debugging
      const screenshotPath = 'test-results/job-creation-debug.png'
      await page.screenshot({ path: screenshotPath, fullPage: true })
      console.log('Debug screenshot saved to:', screenshotPath)

      throw new Error(`Job creation failed. Validation errors: ${errorText.join(', ')}`)
    }

    // Verify job appears in the list
    await expect(page.getByText(JOB_TITLE).first()).toBeVisible({ timeout: 10_000 })
  })

  // ─── Step 4: Apply for the job (public careers page) ───────────────
  test('4. Apply for the job as a candidate', async ({ page }) => {
    await page.goto(`/careers/${orgSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Find and click the job link (the whole card is a <Link>)
    await expect(page.getByText(JOB_TITLE).first()).toBeVisible({ timeout: 15_000 })
    // Click the link that wraps the job card
    const jobLink = page.locator(`a[href*="/careers/${orgSlug}/"]`).filter({ hasText: JOB_TITLE }).first()
    await jobLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    expect(page.url()).toMatch(new RegExp(`/careers/${orgSlug}/[a-z0-9-]+`))

    // Upload a dummy resume
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy resume content for QA Engineer testing'),
    })
    await page.waitForTimeout(2000)

    // Personal Information — clear first in case auto-parse filled them
    await page.locator('#first_name').fill('')
    await page.fill('#first_name', APPLICANT_FIRST)
    await page.locator('#last_name').fill('')
    await page.fill('#last_name', APPLICANT_LAST)
    await page.locator('#email').fill('')
    await page.fill('#email', APPLICANT_EMAIL)
    await page.fill('#phone', APPLICANT_PHONE)

    // Gender
    const genderTrigger = page.locator('#gender')
    if (await genderTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genderTrigger.click()
      await page.getByRole('option', { name: /female/i }).first().click()
      await page.waitForTimeout(200)
    }

    // Location
    await page.fill('#location', 'Mumbai, India')

    // Professional Details
    await page.fill('#current_company', 'Acme Corp')
    await page.fill('#current_title', 'QA Lead')
    await page.fill('#experience_years', '5')

    // Notice Period
    const noticeTrigger = page.locator('#notice_period')
    if (await noticeTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await noticeTrigger.click()
      await page.getByRole('option', { name: /30/i }).first().click()
      await page.waitForTimeout(200)
    }

    // Education
    const eduTrigger = page.locator('#education')
    if (await eduTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await eduTrigger.click()
      await page.getByRole('option', { name: /bachelor/i }).first().click()
      await page.waitForTimeout(200)
    }

    // Compensation
    await page.fill('#current_salary', '900000')
    await page.fill('#expected_salary', '1200000')

    // LinkedIn
    await page.fill('#linkedin', 'https://linkedin.com/in/janedoe')

    // Cover letter
    const coverLetter = page.locator('#cover_letter')
    if (await coverLetter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await coverLetter.fill('I am excited to apply for the QA Engineer role.')
    }

    // Scroll to bottom for GDPR checkbox
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    // GDPR consent checkbox
    const gdprCheckbox = page.locator('#gdpr')
    if (await gdprCheckbox.isVisible({ timeout: 3000 })) {
      await gdprCheckbox.click()
    }

    // Submit
    await page.getByRole('button', { name: /submit application/i }).click()

    // Wait for success message
    await expect(
      page.getByText(/application submitted/i).first()
    ).toBeVisible({ timeout: 30_000 })
  })

  // ─── Step 5: Verify application appears in admin ───────────────────
  test('5. Verify application visible in admin', async ({ page }) => {
    await loginAsAdmin(page)

    // Go to candidates page
    await page.goto('/candidates')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Look for the applicant
    await expect(
      page.getByText(APPLICANT_FIRST).first()
    ).toBeVisible({ timeout: 15_000 })
  })
})
