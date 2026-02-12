import { z } from 'zod'

const interviewTypeEnum = z.enum(['phone', 'video', 'onsite', 'technical', 'cultural'])
const interviewStatusEnum = z.enum(['scheduled', 'completed', 'cancelled', 'no_show'])

export const createInterviewSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  scheduled_at: z.string().min(1, 'Schedule date is required'),
  duration_minutes: z.coerce.number().min(15).max(480).default(60),
  location: z.string().optional().nullable(),
  meeting_link: z.string().url('Please enter a valid URL').optional().nullable().or(z.literal('')),
  interview_type: interviewTypeEnum,
  panelist_ids: z.array(z.string().uuid()).min(1, 'At least one panelist is required'),
  notes: z.string().optional().nullable(),
})

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>

export const updateInterviewSchema = createInterviewSchema.partial().extend({
  status: interviewStatusEnum.optional(),
})

export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>
