import { z } from 'zod'

const candidateSourceEnum = z.enum(['direct', 'referral', 'linkedin', 'job_board', 'careers_page', 'other'])

const educationLevels = z.enum([
  'high_school',
  'associate',
  'bachelor',
  'master',
  'doctorate',
  'diploma',
  'certification',
  'other',
])

export const EDUCATION_LABELS: Record<string, string> = {
  high_school: 'High School',
  associate: 'Associate Degree',
  bachelor: "Bachelor's Degree",
  master: "Master's Degree",
  doctorate: 'Doctorate / PhD',
  diploma: 'Diploma',
  certification: 'Professional Certification',
  other: 'Other',
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export const NOTICE_PERIOD_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: '15_days', label: '15 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '60_days', label: '60 Days' },
  { value: '90_days', label: '90 Days' },
  { value: 'more_than_90', label: 'More than 90 Days' },
]

export const createCandidateSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  phone: z.string().min(1, 'Phone number is required'),
  linkedin_url: z.string().url('Please enter a valid URL').optional().nullable().or(z.literal('')),
  portfolio_url: z.string().url('Please enter a valid URL').optional().nullable().or(z.literal('')),
  current_company: z.string().optional().nullable(),
  current_title: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  current_salary: z.number().positive('Salary must be positive').optional().nullable(),
  expected_salary: z.number().positive('Salary must be positive').optional().nullable(),
  education: educationLevels.optional().nullable(),
  experience_years: z.number().min(0).optional().nullable(),
  notice_period: z.string().optional().nullable(),
  cover_letter: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  source: candidateSourceEnum.default('direct'),
  source_details: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  gdpr_consent: z.literal(true, { message: 'You must consent to data processing' }),
  notes: z.string().optional().nullable(),
})

// Schema for public apply form - makes more fields required
export const publicApplySchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  phone: z.string().min(1, 'Phone number is required'),
  linkedin_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  portfolio_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  current_company: z.string().min(1, 'Current company is required'),
  current_title: z.string().min(1, 'Current job title is required'),
  location: z.string().min(1, 'Location is required'),
  current_salary: z.number({ message: 'Current salary is required' }).positive('Salary must be positive'),
  expected_salary: z.number({ message: 'Expected salary is required' }).positive('Salary must be positive'),
  education: educationLevels,
  experience_years: z.number({ message: 'Experience is required' }).min(0, 'Experience cannot be negative'),
  notice_period: z.string().min(1, 'Notice period is required'),
  gender: z.string().min(1, 'Gender is required'),
  date_of_birth: z.string().optional().or(z.literal('')),
  cover_letter: z.string().optional().or(z.literal('')),
})

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>
export type PublicApplyInput = z.infer<typeof publicApplySchema>

export const updateCandidateSchema = createCandidateSchema.partial().omit({ gdpr_consent: true })

export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>
