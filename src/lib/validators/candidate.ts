import { z } from 'zod'

const candidateSourceEnum = z.enum(['direct', 'referral', 'linkedin', 'job_board', 'careers_page', 'other'])

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
  source: candidateSourceEnum.default('direct'),
  source_details: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  gdpr_consent: z.literal(true, { message: 'You must consent to data processing' }),
  notes: z.string().optional().nullable(),
})

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>

export const updateCandidateSchema = createCandidateSchema.partial().omit({ gdpr_consent: true })

export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>
