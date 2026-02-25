#!/usr/bin/env node

/**
 * HireFlow ATS — Database Seed Script
 *
 * Populates the database with realistic test data simulating a complete
 * hiring workflow from org creation through offer acceptance.
 *
 * Usage:  node supabase/seed.mjs
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load env ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')

// Parse .env.local manually (no dotenv dependency needed)
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (!process.env[key]) process.env[key] = val
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ─────────────────────────────────────────────────────────
function log(msg) { console.log(`  ✓ ${msg}`) }
function fail(label, error) {
  console.error(`\n❌ Failed at: ${label}`)
  console.error(error?.message || error)
  process.exit(1)
}

async function insert(table, data, label) {
  const { data: rows, error } = await supabase.from(table).insert(data).select()
  if (error) fail(label || `insert ${table}`, error)
  return rows
}

async function upsert(table, data, label) {
  const { data: rows, error } = await supabase.from(table).upsert(data).select()
  if (error) fail(label || `upsert ${table}`, error)
  return rows
}

// ── Test user emails ────────────────────────────────────────────────
const TEST_EMAILS = [
  'harshil@hireflow.dev',
  'priya@hireflow.dev',
  'rahul@hireflow.dev',
]

// Tables to truncate in dependency order (leaf → root)
const TRUNCATE_ORDER = [
  'scorecard_ratings',
  'interview_feedback',
  'interview_panelists',
  'interviews',
  'stage_movements',
  'candidate_match_scores',
  'email_logs',
  'offer_letters',
  'applications',
  'pipeline_stages',
  'scorecard_criteria',
  'candidates',
  'jobs',
  'comments',
  'activity_logs',
  'google_oauth_tokens',
  'email_templates',
  'ai_scoring_config',
  'organization_members',
  'organizations',
]

// ════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n🌱 HireFlow ATS — Seeding database...\n')

  // ── 1. Clean existing data ────────────────────────────────────────
  console.log('Step 1: Cleaning existing data...')

  // Truncate all tables (leaf → root)
  for (const table of TRUNCATE_ORDER) {
    const { error } = await supabase.from(table).delete().gte('created_at', '1970-01-01')
    if (error && !error.message.includes('does not exist')) {
      // Not fatal — some tables might not exist in all environments
      console.log(`  ⚠ Could not clean ${table}: ${error.message}`)
    }
  }
  log('Truncated all tables')

  // Delete test auth users
  const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  for (const email of TEST_EMAILS) {
    const existing = existingUsers?.find(u => u.email === email)
    if (existing) {
      await supabase.auth.admin.deleteUser(existing.id)
      log(`Deleted existing user: ${email}`)
    }
  }

  // ── 2. Create 3 auth users ────────────────────────────────────────
  console.log('\nStep 2: Creating auth users...')
  const userDefs = [
    { email: 'harshil@hireflow.dev', name: 'Harshil Ghataliya', role: 'admin' },
    { email: 'priya@hireflow.dev',   name: 'Priya Sharma',      role: 'recruiter' },
    { email: 'rahul@hireflow.dev',   name: 'Rahul Patel',       role: 'hiring_manager' },
  ]

  const users = []
  for (const u of userDefs) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: 'Test@1234',
      email_confirm: true,
      user_metadata: { full_name: u.name },
    })
    if (error) fail(`create user ${u.email}`, error)
    users.push({ ...data.user, _role: u.role, _name: u.name })
    log(`Created ${u.role}: ${u.name} <${u.email}>`)
  }

  const [harshil, priya, rahul] = users

  // ── 3. Create organization ────────────────────────────────────────
  console.log('\nStep 3: Creating organization...')
  const [org] = await insert('organizations', {
    name: 'HireFlow Technologies',
    slug: 'hireflow-tech',
    careers_page_config: {
      headline: 'Join HireFlow Technologies',
      description: 'We build the future of recruitment technology.',
      primary_color: '#4F46E5',
      show_salary: true,
    },
  }, 'create org')
  log(`Organization: ${org.name} (${org.slug})`)

  // ── 4. Create organization members ────────────────────────────────
  console.log('\nStep 4: Adding organization members...')
  const memberData = users.map(u => ({
    organization_id: org.id,
    user_id: u.id,
    role: u._role,
    joined_at: new Date().toISOString(),
  }))
  await insert('organization_members', memberData, 'create members')
  log(`Added ${memberData.length} members (admin, recruiter, hiring_manager)`)

  // ── 5. Create 3 jobs ──────────────────────────────────────────────
  console.log('\nStep 5: Creating jobs...')
  const jobDefs = [
    {
      title: 'Senior React Developer',
      department: 'Engineering',
      location: 'Ahmedabad, India',
      employment_type: 'full_time',
      description: `<h3>About the Role</h3>
<p>We are looking for a Senior React Developer to join our frontend engineering team. You'll be building modern, performant web applications using React, Next.js, and TypeScript.</p>
<h3>What You'll Do</h3>
<ul>
<li>Architect and build complex UI components and features</li>
<li>Mentor junior developers and conduct code reviews</li>
<li>Collaborate with product and design teams</li>
<li>Optimize application performance and bundle size</li>
</ul>`,
      requirements: `<ul>
<li>5+ years of experience with React and modern JavaScript</li>
<li>Strong TypeScript skills</li>
<li>Experience with Next.js, SSR, and ISR</li>
<li>Familiarity with state management (Redux, Zustand, or similar)</li>
<li>Understanding of CI/CD pipelines and testing frameworks</li>
</ul>`,
      salary_min: 1500000,
      salary_max: 2500000,
      salary_currency: 'INR',
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: harshil.id,
      experience_level: 'senior',
      num_openings: 2,
      remote_policy: 'hybrid',
      skills: ['React', 'TypeScript', 'Next.js', 'Node.js', 'Tailwind CSS'],
      benefits: 'Health insurance, flexible hours, WFH twice a week, annual learning budget of ₹50,000',
      education_level: "Bachelor's in Computer Science or equivalent",
      experience_min: 4,
      experience_max: 8,
      priority: 'high',
    },
    {
      title: 'Product Manager',
      department: 'Product',
      location: 'Remote',
      employment_type: 'full_time',
      description: `<h3>About the Role</h3>
<p>We're seeking a Product Manager who can own the product roadmap for our ATS platform. You'll work closely with engineering, design, and customers to define and deliver features that make hiring better.</p>
<h3>What You'll Do</h3>
<ul>
<li>Define product strategy and maintain the roadmap</li>
<li>Gather and prioritize requirements from stakeholders</li>
<li>Write detailed PRDs and user stories</li>
<li>Analyze product metrics and drive data-informed decisions</li>
</ul>`,
      requirements: `<ul>
<li>7+ years of product management experience, preferably in B2B SaaS</li>
<li>Strong analytical skills and experience with product analytics</li>
<li>Excellent written and verbal communication</li>
<li>Experience working with cross-functional agile teams</li>
</ul>`,
      salary_min: 2000000,
      salary_max: 3000000,
      salary_currency: 'INR',
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: harshil.id,
      experience_level: 'senior',
      num_openings: 1,
      remote_policy: 'remote',
      skills: ['Product Strategy', 'Agile', 'User Research', 'Data Analysis', 'Roadmapping'],
      benefits: 'Health insurance, fully remote, stock options, unlimited PTO',
      education_level: "MBA or Bachelor's degree",
      experience_min: 5,
      experience_max: 10,
      priority: 'high',
    },
    {
      title: 'DevOps Engineer',
      department: 'Infrastructure',
      location: 'Bangalore, India',
      employment_type: 'full_time',
      description: `<h3>About the Role</h3>
<p>Join our infrastructure team to design, build, and maintain the cloud infrastructure that powers HireFlow. You'll be responsible for CI/CD, monitoring, scaling, and reliability.</p>
<h3>What You'll Do</h3>
<ul>
<li>Design and manage cloud infrastructure on AWS/GCP</li>
<li>Build and maintain CI/CD pipelines</li>
<li>Implement monitoring, alerting, and incident response processes</li>
<li>Automate infrastructure provisioning with Terraform/Pulumi</li>
</ul>`,
      requirements: `<ul>
<li>6+ years of experience in DevOps or SRE roles</li>
<li>Expert-level knowledge of AWS or GCP</li>
<li>Experience with Kubernetes, Docker, and container orchestration</li>
<li>Strong scripting skills (Bash, Python)</li>
<li>Experience with Terraform or Pulumi for IaC</li>
</ul>`,
      salary_min: 1800000,
      salary_max: 2800000,
      salary_currency: 'INR',
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: rahul.id,
      experience_level: 'mid',
      num_openings: 1,
      remote_policy: 'on_site',
      skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
      benefits: 'Health insurance, relocation assistance, gym membership, annual offsite',
      education_level: "Bachelor's in CS/IT or equivalent",
      experience_min: 3,
      experience_max: 8,
      priority: 'medium',
    },
  ]

  const jobRows = []
  for (const j of jobDefs) {
    const [row] = await insert('jobs', { organization_id: org.id, ...j }, `create job: ${j.title}`)
    jobRows.push(row)
    log(`Job: ${row.title}`)
  }
  const [reactJob, pmJob, devopsJob] = jobRows

  // ── 6. Query pipeline stages (auto-created by trigger) ────────────
  console.log('\nStep 6: Querying pipeline stages...')
  const stages = {}
  for (const job of jobRows) {
    const { data: jobStages, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('job_id', job.id)
      .order('display_order')
    if (error) fail(`query stages for ${job.title}`, error)
    stages[job.id] = {}
    for (const s of jobStages) {
      stages[job.id][s.stage_type] = s
    }
    log(`${job.title}: ${jobStages.length} stages loaded`)
  }

  // ── 7. Create scorecard criteria (3 per job) ─────────────────────
  console.log('\nStep 7: Creating scorecard criteria...')
  const criteriaDefs = [
    // React job
    { job_id: reactJob.id, name: 'Technical Skills',    description: 'React, TypeScript, Next.js proficiency', weight: 8 },
    { job_id: reactJob.id, name: 'Problem Solving',     description: 'Ability to break down complex problems',  weight: 7 },
    { job_id: reactJob.id, name: 'Communication',       description: 'Clear communication and collaboration',   weight: 5 },
    // PM job
    { job_id: pmJob.id,    name: 'Product Thinking',    description: 'Strategic vision and product sense',       weight: 9 },
    { job_id: pmJob.id,    name: 'Stakeholder Mgmt',    description: 'Ability to manage diverse stakeholders',   weight: 7 },
    { job_id: pmJob.id,    name: 'Analytical Skills',   description: 'Data-driven decision making',              weight: 6 },
    // DevOps job
    { job_id: devopsJob.id, name: 'Infrastructure',     description: 'Cloud and container expertise',            weight: 8 },
    { job_id: devopsJob.id, name: 'Automation',          description: 'CI/CD and IaC proficiency',               weight: 7 },
    { job_id: devopsJob.id, name: 'Incident Response',   description: 'Debugging, monitoring, on-call readiness', weight: 6 },
  ]
  const criteriaRows = await insert(
    'scorecard_criteria',
    criteriaDefs.map(c => ({ organization_id: org.id, ...c })),
    'create scorecard criteria',
  )
  log(`Created ${criteriaRows.length} scorecard criteria`)

  // Index criteria by job
  const criteriaByJob = {}
  for (const c of criteriaRows) {
    if (!criteriaByJob[c.job_id]) criteriaByJob[c.job_id] = []
    criteriaByJob[c.job_id].push(c)
  }

  // ── 8. Create email templates ─────────────────────────────────────
  console.log('\nStep 8: Creating email templates...')
  const templateDefs = [
    {
      name: 'Interview Invitation',
      subject: 'Interview Invitation — {{job_title}} at HireFlow Technologies',
      body_html: `<p>Dear {{candidate_name}},</p>
<p>Thank you for your interest in the <strong>{{job_title}}</strong> position at HireFlow Technologies.</p>
<p>We were impressed with your profile and would like to invite you for an interview.</p>
<p><strong>Details:</strong></p>
<ul>
<li>Date & Time: {{interview_date}}</li>
<li>Duration: {{interview_duration}} minutes</li>
<li>Type: {{interview_type}}</li>
<li>Meeting Link: {{meeting_link}}</li>
</ul>
<p>Please confirm your availability by replying to this email.</p>
<p>Best regards,<br/>HireFlow Technologies Hiring Team</p>`,
      template_type: 'interview_invite',
      variables: ['candidate_name', 'job_title', 'interview_date', 'interview_duration', 'interview_type', 'meeting_link'],
    },
    {
      name: 'Application Rejection',
      subject: 'Update on Your Application — {{job_title}}',
      body_html: `<p>Dear {{candidate_name}},</p>
<p>Thank you for taking the time to apply for the <strong>{{job_title}}</strong> position at HireFlow Technologies and for your interest in joining our team.</p>
<p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
<p>We encourage you to apply for future openings that match your skills and experience. We wish you the very best in your career.</p>
<p>Warm regards,<br/>HireFlow Technologies Hiring Team</p>`,
      template_type: 'rejection',
      variables: ['candidate_name', 'job_title'],
    },
    {
      name: 'Offer Notification',
      subject: 'Offer Letter — {{job_title}} at HireFlow Technologies',
      body_html: `<p>Dear {{candidate_name}},</p>
<p>We are thrilled to extend an offer for the position of <strong>{{job_title}}</strong> at HireFlow Technologies!</p>
<p>Please find the detailed offer letter attached as a PDF. Key highlights:</p>
<ul>
<li>Position: {{job_title}}</li>
<li>Annual CTC: {{salary}}</li>
<li>Start Date: {{start_date}}</li>
<li>Location: {{location}}</li>
</ul>
<p>Please review the attached offer letter carefully and let us know your decision by <strong>{{expiry_date}}</strong>.</p>
<p>We are excited about the possibility of you joining our team!</p>
<p>Best regards,<br/>HireFlow Technologies Hiring Team</p>`,
      template_type: 'offer',
      variables: ['candidate_name', 'job_title', 'salary', 'start_date', 'location', 'expiry_date'],
    },
  ]

  const templateRows = await insert(
    'email_templates',
    templateDefs.map(t => ({ organization_id: org.id, created_by: priya.id, ...t })),
    'create email templates',
  )
  log(`Created ${templateRows.length} email templates`)

  // ── 9. Create 6 candidates ────────────────────────────────────────
  console.log('\nStep 9: Creating candidates...')
  const candidateDefs = [
    {
      first_name: 'Amit', last_name: 'Kumar',
      email: 'amit.kumar@example.com', phone: '+91 98765 43210',
      current_company: 'Infosys', current_title: 'Senior Frontend Developer',
      location: 'Ahmedabad, India', source: 'linkedin',
      linkedin_url: 'https://linkedin.com/in/amitkumar',
      experience_years: 5, education: "B.Tech in Computer Science",
      current_salary: 1200000, expected_salary: 2200000,
      notice_period: '30_days', gender: 'male',
      date_of_birth: '1994-03-15',
      tags: ['React', 'TypeScript', 'Next.js', 'Redux', 'Node.js'],
      resume_parsed_data: {
        skills: ['React', 'TypeScript', 'Next.js', 'Redux', 'Node.js', 'GraphQL', 'Jest'],
        experience: [
          { company: 'Infosys', title: 'Senior Frontend Developer', duration: '2021-present' },
          { company: 'TCS', title: 'Frontend Developer', duration: '2019-2021' },
        ],
        education: [{ institution: 'NIT Surat', degree: 'B.Tech Computer Science', year: '2016' }],
        summary: 'Experienced React developer with 5 years building scalable web applications.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
    {
      first_name: 'Sneha', last_name: 'Reddy',
      email: 'sneha.reddy@example.com', phone: '+91 87654 32109',
      current_company: 'Wipro', current_title: 'React Developer',
      location: 'Hyderabad, India', source: 'careers_page',
      linkedin_url: 'https://linkedin.com/in/snehareddy',
      experience_years: 3, education: "B.Tech in Information Technology",
      current_salary: 800000, expected_salary: 1600000,
      notice_period: '60_days', gender: 'female',
      date_of_birth: '1997-07-22',
      tags: ['React', 'JavaScript', 'CSS', 'HTML', 'Tailwind'],
      resume_parsed_data: {
        skills: ['React', 'JavaScript', 'CSS', 'HTML', 'Tailwind', 'Material UI'],
        experience: [
          { company: 'Wipro', title: 'React Developer', duration: '2022-present' },
          { company: 'Freelance', title: 'Web Developer', duration: '2021-2022' },
        ],
        education: [{ institution: 'JNTU Hyderabad', degree: 'B.Tech IT', year: '2019' }],
        summary: 'Frontend developer specializing in React with a strong eye for UI design.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
    {
      first_name: 'Vikram', last_name: 'Singh',
      email: 'vikram.singh@example.com', phone: '+91 76543 21098',
      current_company: 'Razorpay', current_title: 'Senior Product Manager',
      location: 'Bangalore, India', source: 'referral', source_details: 'Referred by CTO',
      linkedin_url: 'https://linkedin.com/in/vikramsingh',
      experience_years: 7, education: "MBA in Business Administration",
      current_salary: 2200000, expected_salary: 2800000,
      notice_period: '90_days', gender: 'male',
      date_of_birth: '1991-11-05',
      tags: ['Product Management', 'Agile', 'B2B SaaS', 'Analytics', 'Strategy'],
      resume_parsed_data: {
        skills: ['Product Strategy', 'Agile', 'Scrum', 'User Research', 'SQL', 'JIRA', 'Amplitude'],
        experience: [
          { company: 'Razorpay', title: 'Senior Product Manager', duration: '2020-present' },
          { company: 'Freshworks', title: 'Product Manager', duration: '2017-2020' },
        ],
        education: [{ institution: 'IIM Ahmedabad', degree: 'MBA', year: '2017' }],
        summary: 'B2B SaaS product leader with 7 years driving growth through data-driven product strategy.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
    {
      first_name: 'Neha', last_name: 'Joshi',
      email: 'neha.joshi@example.com', phone: '+91 65432 10987',
      current_company: 'Zoho', current_title: 'Associate Product Manager',
      location: 'Chennai, India', source: 'job_board',
      linkedin_url: 'https://linkedin.com/in/nehajoshi',
      experience_years: 4, education: "B.Tech in Computer Science",
      current_salary: 1400000, expected_salary: 2200000,
      notice_period: '30_days', gender: 'female',
      date_of_birth: '1996-01-18',
      tags: ['Product Management', 'UX Research', 'SQL', 'Wireframing'],
      resume_parsed_data: {
        skills: ['Product Management', 'UX Research', 'SQL', 'Figma', 'Wireframing'],
        experience: [
          { company: 'Zoho', title: 'Associate Product Manager', duration: '2021-present' },
          { company: 'Zoho', title: 'Business Analyst', duration: '2020-2021' },
        ],
        education: [{ institution: 'Anna University', degree: 'B.Tech CS', year: '2018' }],
        summary: 'Product manager with 4 years of experience in SaaS products and UX research.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
    {
      first_name: 'Arjun', last_name: 'Mehta',
      email: 'arjun.mehta@example.com', phone: '+91 54321 09876',
      current_company: 'Flipkart', current_title: 'DevOps Lead',
      location: 'Bangalore, India', source: 'linkedin',
      linkedin_url: 'https://linkedin.com/in/arjunmehta',
      experience_years: 6, education: "M.Tech in Cloud Computing",
      current_salary: 1900000, expected_salary: 2500000,
      notice_period: '60_days', gender: 'male',
      date_of_birth: '1993-09-30',
      tags: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Python', 'CI/CD'],
      resume_parsed_data: {
        skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'Python', 'Ansible', 'Prometheus'],
        experience: [
          { company: 'Flipkart', title: 'DevOps Lead', duration: '2021-present' },
          { company: 'Amazon', title: 'SRE', duration: '2018-2021' },
        ],
        education: [{ institution: 'IIIT Bangalore', degree: 'M.Tech Cloud Computing', year: '2018' }],
        summary: 'DevOps engineer with 6 years building resilient cloud infrastructure at scale.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
    {
      first_name: 'Kavita', last_name: 'Nair',
      email: 'kavita.nair@example.com', phone: '+91 43210 98765',
      current_company: 'Accenture', current_title: 'Cloud Engineer',
      location: 'Pune, India', source: 'careers_page',
      linkedin_url: 'https://linkedin.com/in/kavitanair',
      experience_years: 2, education: "B.Tech in Information Technology",
      current_salary: 700000, expected_salary: 1200000,
      notice_period: '30_days', gender: 'female',
      date_of_birth: '1999-05-12',
      tags: ['AWS', 'Docker', 'Linux', 'CI/CD', 'Bash'],
      resume_parsed_data: {
        skills: ['AWS', 'Docker', 'Linux', 'GitHub Actions', 'Bash', 'CloudFormation'],
        experience: [
          { company: 'Accenture', title: 'Cloud Engineer', duration: '2022-present' },
        ],
        education: [{ institution: 'VIT Pune', degree: 'B.Tech IT', year: '2021' }],
        summary: 'Cloud engineer with 2 years of experience in AWS infrastructure and automation.',
      },
      gdpr_consent: true, gdpr_consent_at: new Date().toISOString(),
    },
  ]

  const candidateRows = await insert(
    'candidates',
    candidateDefs.map(c => ({ organization_id: org.id, created_by: priya.id, ...c })),
    'create candidates',
  )
  log(`Created ${candidateRows.length} candidates`)

  const [amit, sneha, vikram, neha, arjun, kavita] = candidateRows

  // ── 10. Create 6 applications ─────────────────────────────────────
  console.log('\nStep 10: Creating applications...')
  // Trigger will auto-set current_stage_id to 'applied' stage
  const appDefs = [
    { job_id: reactJob.id,   candidate_id: amit.id   },
    { job_id: reactJob.id,   candidate_id: sneha.id  },
    { job_id: pmJob.id,      candidate_id: vikram.id },
    { job_id: pmJob.id,      candidate_id: neha.id   },
    { job_id: devopsJob.id,  candidate_id: arjun.id  },
    { job_id: devopsJob.id,  candidate_id: kavita.id },
  ]

  const appRows = await insert(
    'applications',
    appDefs.map(a => ({ organization_id: org.id, ...a })),
    'create applications',
  )
  log(`Created ${appRows.length} applications`)

  const [amitApp, snehaApp, vikramApp, nehaApp, arjunApp, kavitaApp] = appRows

  // ── 11. Move candidates to appropriate pipeline stages ────────────
  console.log('\nStep 11: Moving candidates through pipeline stages...')

  const stageMovements = [
    { app: amitApp,   job: reactJob,   targetType: 'offer',      label: 'Amit → Offer' },
    { app: snehaApp,  job: reactJob,   targetType: 'interview',  label: 'Sneha → Interview' },
    { app: vikramApp, job: pmJob,      targetType: 'hired',      label: 'Vikram → Hired' },
    { app: nehaApp,   job: pmJob,      targetType: 'screening',  label: 'Neha → Screening' },
    { app: arjunApp,  job: devopsJob,  targetType: 'interview',  label: 'Arjun → Interview' },
    { app: kavitaApp, job: devopsJob,  targetType: 'screening',  label: 'Kavita → Screening' },
  ]

  for (const mv of stageMovements) {
    const targetStage = stages[mv.job.id][mv.targetType]
    const updateData = { current_stage_id: targetStage.id }
    if (mv.targetType === 'hired') {
      updateData.status = 'hired'
      updateData.hired_at = new Date().toISOString()
    }
    const { error } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', mv.app.id)
    if (error) fail(mv.label, error)
    log(mv.label)
  }

  // ── 12. Create 4 interviews ───────────────────────────────────────
  console.log('\nStep 12: Creating interviews...')

  const now = new Date()
  const past = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString()
  const future = (daysAhead) => new Date(now.getTime() + daysAhead * 86400000).toISOString()

  const interviewDefs = [
    {
      application_id: amitApp.id, job_id: reactJob.id, candidate_id: amit.id,
      interview_type: 'technical', status: 'completed',
      scheduled_at: past(5), duration_minutes: 90,
      location: 'HireFlow Office, Ahmedabad',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      notes: 'System design + React coding round',
      created_by: priya.id,
    },
    {
      application_id: snehaApp.id, job_id: reactJob.id, candidate_id: sneha.id,
      interview_type: 'phone', status: 'scheduled',
      scheduled_at: future(3), duration_minutes: 45,
      meeting_link: 'https://meet.google.com/klm-nopq-rst',
      notes: 'Initial phone screening',
      created_by: priya.id,
    },
    {
      application_id: vikramApp.id, job_id: pmJob.id, candidate_id: vikram.id,
      interview_type: 'video', status: 'completed',
      scheduled_at: past(10), duration_minutes: 60,
      meeting_link: 'https://meet.google.com/uvw-xyza-bcd',
      notes: 'Product case study discussion',
      created_by: priya.id,
    },
    {
      application_id: arjunApp.id, job_id: devopsJob.id, candidate_id: arjun.id,
      interview_type: 'technical', status: 'completed',
      scheduled_at: past(3), duration_minutes: 90,
      meeting_link: 'https://meet.google.com/efg-hijk-lmn',
      notes: 'Infrastructure design + troubleshooting scenario',
      created_by: rahul.id,
    },
  ]

  const interviewRows = await insert(
    'interviews',
    interviewDefs.map(i => ({ organization_id: org.id, ...i })),
    'create interviews',
  )
  log(`Created ${interviewRows.length} interviews`)

  const [amitInterview, snehaInterview, vikramInterview, arjunInterview] = interviewRows

  // ── 13. Add interview panelists ───────────────────────────────────
  console.log('\nStep 13: Adding interview panelists...')
  const panelistDefs = [
    { interview_id: amitInterview.id,   user_id: rahul.id,   role: 'lead',        status: 'accepted' },
    { interview_id: amitInterview.id,   user_id: harshil.id, role: 'observer',    status: 'accepted' },
    { interview_id: snehaInterview.id,  user_id: priya.id,   role: 'interviewer', status: 'accepted' },
    { interview_id: vikramInterview.id, user_id: harshil.id, role: 'lead',        status: 'accepted' },
    { interview_id: vikramInterview.id, user_id: priya.id,   role: 'observer',    status: 'accepted' },
    { interview_id: arjunInterview.id,  user_id: rahul.id,   role: 'lead',        status: 'accepted' },
  ]
  await insert(
    'interview_panelists',
    panelistDefs.map(p => ({ organization_id: org.id, ...p })),
    'create panelists',
  )
  log(`Added ${panelistDefs.length} panelists`)

  // ── 14. Create feedback for completed interviews ──────────────────
  console.log('\nStep 14: Creating interview feedback...')
  const feedbackDefs = [
    {
      interview_id: amitInterview.id, application_id: amitApp.id,
      user_id: rahul.id, overall_rating: 4, recommendation: 'strong_yes',
      strengths: 'Excellent React knowledge, clean code architecture, good system design thinking.',
      weaknesses: 'Could improve on communication of trade-offs during design discussions.',
      notes: 'Strong hire. Deep understanding of React internals and performance optimization.',
      submitted_at: past(4),
    },
    {
      interview_id: vikramInterview.id, application_id: vikramApp.id,
      user_id: harshil.id, overall_rating: 5, recommendation: 'strong_yes',
      strengths: 'Outstanding product sense, data-driven approach, clear roadmap thinking.',
      weaknesses: 'None significant. Minor: could be more concise in written communication.',
      notes: 'Exceptional candidate. Perfect fit for our product culture. Recommend immediate offer.',
      submitted_at: past(9),
    },
    {
      interview_id: arjunInterview.id, application_id: arjunApp.id,
      user_id: rahul.id, overall_rating: 4, recommendation: 'yes',
      strengths: 'Deep AWS expertise, strong Kubernetes skills, great incident response stories.',
      weaknesses: 'Limited experience with Terraform (more Ansible background).',
      notes: 'Good candidate. Can ramp up on Terraform quickly. Solid infrastructure fundamentals.',
      submitted_at: past(2),
    },
  ]

  const feedbackRows = await insert(
    'interview_feedback',
    feedbackDefs.map(f => ({ organization_id: org.id, ...f })),
    'create feedback',
  )
  log(`Created ${feedbackRows.length} feedback entries`)

  // ── 15. Create scorecard ratings for feedback ─────────────────────
  console.log('\nStep 15: Creating scorecard ratings...')
  const ratingDefs = []

  // Amit feedback (React job) — criteria: Technical Skills, Problem Solving, Communication
  const reactCriteria = criteriaByJob[reactJob.id]
  ratingDefs.push(
    { feedback_id: feedbackRows[0].id, criteria_id: reactCriteria[0].id, rating: 5, notes: 'Expert-level React and TS' },
    { feedback_id: feedbackRows[0].id, criteria_id: reactCriteria[1].id, rating: 4, notes: 'Solid problem decomposition' },
    { feedback_id: feedbackRows[0].id, criteria_id: reactCriteria[2].id, rating: 3, notes: 'Adequate, room to improve' },
  )

  // Vikram feedback (PM job) — criteria: Product Thinking, Stakeholder Mgmt, Analytical Skills
  const pmCriteria = criteriaByJob[pmJob.id]
  ratingDefs.push(
    { feedback_id: feedbackRows[1].id, criteria_id: pmCriteria[0].id, rating: 5, notes: 'Exceptional product vision' },
    { feedback_id: feedbackRows[1].id, criteria_id: pmCriteria[1].id, rating: 5, notes: 'Handled multi-stakeholder scenarios brilliantly' },
    { feedback_id: feedbackRows[1].id, criteria_id: pmCriteria[2].id, rating: 4, notes: 'Strong SQL and analytics skills' },
  )

  // Arjun feedback (DevOps job) — criteria: Infrastructure, Automation, Incident Response
  const devopsCriteria = criteriaByJob[devopsJob.id]
  ratingDefs.push(
    { feedback_id: feedbackRows[2].id, criteria_id: devopsCriteria[0].id, rating: 5, notes: 'Deep AWS and K8s expertise' },
    { feedback_id: feedbackRows[2].id, criteria_id: devopsCriteria[1].id, rating: 3, notes: 'Ansible-focused, Terraform exposure limited' },
    { feedback_id: feedbackRows[2].id, criteria_id: devopsCriteria[2].id, rating: 4, notes: 'Great real-world incident stories' },
  )

  await insert(
    'scorecard_ratings',
    ratingDefs.map(r => ({ organization_id: org.id, ...r })),
    'create scorecard ratings',
  )
  log(`Created ${ratingDefs.length} scorecard ratings`)

  // ── 16. Create 2 offer letters ────────────────────────────────────
  console.log('\nStep 16: Creating offer letters...')

  // Helper: compute salary components from CTC (Keka-style)
  function computeSalaryComponents(annualCtc) {
    const basic = Math.round(annualCtc * 0.30)
    const hra = Math.round(basic * 0.40)
    const lta = Math.round(annualCtc * 0.02)
    const uniform = 2000 * 12
    const bonusAllowance = Math.round(basic * 0.0833)
    const flexiPay = Math.round(annualCtc * 0.25)
    const gratuity = Math.round(basic * 0.0481)
    const specialAllowance = annualCtc - basic - hra - lta - uniform - bonusAllowance - flexiPay - gratuity
    return [
      { name: 'Basic Salary',       annual: basic,           monthly: Math.round(basic / 12) },
      { name: 'HRA',                annual: hra,             monthly: Math.round(hra / 12) },
      { name: 'LTA',                annual: lta,             monthly: Math.round(lta / 12) },
      { name: 'Uniform Allowance',  annual: uniform,         monthly: 2000 },
      { name: 'Bonus Allowance',    annual: bonusAllowance,  monthly: Math.round(bonusAllowance / 12) },
      { name: 'Flexi Pay',          annual: flexiPay,        monthly: Math.round(flexiPay / 12) },
      { name: 'Special Allowance',  annual: specialAllowance, monthly: Math.round(specialAllowance / 12) },
      { name: 'Gratuity',           annual: gratuity,        monthly: Math.round(gratuity / 12) },
    ]
  }

  const offerDefs = [
    {
      application_id: amitApp.id, candidate_id: amit.id, job_id: reactJob.id,
      salary: 2200000, salary_currency: 'INR',
      salary_components: computeSalaryComponents(2200000),
      bonus_components: [{ name: 'Joining Bonus', amount: 100000, type: 'one_time' }],
      pf_applicable: true,
      start_date: '2026-04-01', expiry_date: '2026-04-15',
      status: 'sent', sent_at: past(2),
      employment_type: 'full_time', work_type: 'hybrid',
      location: 'Ahmedabad, India',
      reporting_manager: 'Harshil Ghataliya',
      business_unit: 'Engineering',
      remuneration_type: 'annual',
      created_by: harshil.id,
    },
    {
      application_id: vikramApp.id, candidate_id: vikram.id, job_id: pmJob.id,
      salary: 2500000, salary_currency: 'INR',
      salary_components: computeSalaryComponents(2500000),
      bonus_components: [
        { name: 'Joining Bonus', amount: 150000, type: 'one_time' },
        { name: 'Annual Performance Bonus', amount: 250000, type: 'recurring' },
      ],
      pf_applicable: true,
      start_date: '2026-03-15', expiry_date: '2026-03-30',
      status: 'accepted', sent_at: past(12), responded_at: past(8),
      response_notes: 'Happy to accept! Looking forward to joining.',
      employment_type: 'full_time', work_type: 'remote',
      location: 'Remote (India)',
      reporting_manager: 'Harshil Ghataliya',
      business_unit: 'Product',
      remuneration_type: 'annual',
      created_by: harshil.id,
    },
  ]

  const offerRows = await insert(
    'offer_letters',
    offerDefs.map(o => ({ organization_id: org.id, ...o })),
    'create offer letters',
  )
  log(`Created ${offerRows.length} offer letters (1 sent, 1 accepted)`)

  // ── 17. Create AI scoring config ──────────────────────────────────
  console.log('\nStep 17: Creating AI scoring config...')
  const { error: aiConfigError } = await supabase.from('ai_scoring_config').upsert({
    organization_id: org.id,
    enabled: true,
    skill_weight: 40,
    experience_weight: 30,
    semantic_weight: 30,
    auto_score: true,
  })
  if (aiConfigError) {
    console.log(`  ⚠ Skipped AI config (permission denied — run: GRANT ALL ON ai_scoring_config TO service_role;)`)
  } else {
    log('AI scoring config: enabled, weights 40/30/30')
  }

  // ── 18. Create activity logs ──────────────────────────────────────
  console.log('\nStep 18: Creating activity logs...')
  const activityDefs = [
    {
      user_id: harshil.id, entity_type: 'job', entity_id: reactJob.id,
      action: 'created', metadata: { job_title: 'Senior React Developer' },
      created_at: past(20),
    },
    {
      user_id: harshil.id, entity_type: 'job', entity_id: pmJob.id,
      action: 'created', metadata: { job_title: 'Product Manager' },
      created_at: past(20),
    },
    {
      user_id: priya.id, entity_type: 'application', entity_id: amitApp.id,
      action: 'stage_changed', metadata: { candidate_name: 'Amit Kumar', from: 'Applied', to: 'Offer' },
      created_at: past(6),
    },
    {
      user_id: harshil.id, entity_type: 'offer_letter', entity_id: offerRows[0].id,
      action: 'sent', metadata: { candidate_name: 'Amit Kumar', job_title: 'Senior React Developer' },
      created_at: past(2),
    },
    {
      user_id: harshil.id, entity_type: 'offer_letter', entity_id: offerRows[1].id,
      action: 'accepted', metadata: { candidate_name: 'Vikram Singh', job_title: 'Product Manager' },
      created_at: past(8),
    },
    {
      user_id: priya.id, entity_type: 'interview', entity_id: snehaInterview.id,
      action: 'scheduled', metadata: { candidate_name: 'Sneha Reddy', type: 'Phone Screen' },
      created_at: past(1),
    },
  ]

  await insert(
    'activity_logs',
    activityDefs.map(a => ({ organization_id: org.id, ...a })),
    'create activity logs',
  )
  log(`Created ${activityDefs.length} activity log entries`)

  // ═══════════════════════════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60))
  console.log('  🎉 Seeding complete!')
  console.log('═'.repeat(60))
  console.log('\n  📊 Data Summary:')
  console.log('  ────────────────────────────────────────')
  console.log(`  Organization:  ${org.name} (/${org.slug})`)
  console.log(`  Jobs:          ${jobRows.length}`)
  console.log(`  Candidates:    ${candidateRows.length}`)
  console.log(`  Applications:  ${appRows.length}`)
  console.log(`  Interviews:    ${interviewRows.length} (1 upcoming)`)
  console.log(`  Feedback:      ${feedbackRows.length}`)
  console.log(`  Offers:        ${offerRows.length} (1 sent, 1 accepted)`)
  console.log(`  Templates:     ${templateRows.length}`)
  console.log()
  console.log('  🔐 Login Credentials:')
  console.log('  ────────────────────────────────────────')
  console.log('  All passwords: Test@1234')
  console.log()
  for (const u of users) {
    console.log(`  ${u._role.padEnd(16)} ${u._name.padEnd(22)} ${u.email}`)
  }
  console.log()
  console.log('  🌐 Open: http://localhost:3000')
  console.log('═'.repeat(60) + '\n')
}

main().catch(err => {
  console.error('\n💥 Unexpected error:', err)
  process.exit(1)
})
