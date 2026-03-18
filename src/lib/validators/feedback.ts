import { z } from 'zod'

const recommendationEnum = z.enum(['select', 'reject', 'hold'])

export const submitFeedbackSchema = z.object({
  interview_id: z.string().uuid('Invalid interview ID'),
  overall_rating: z.coerce.number().min(1).max(5),
  recommendation: recommendationEnum,
  strengths: z.string().min(1, { message: 'Strengths is required' }),
  weaknesses: z.string().min(1, { message: 'Weaknesses is required' }),
  notes: z.string().min(1, { message: 'Notes is required' }),
  criteria_ratings: z
    .array(
      z.object({
        criteria_id: z.string().uuid(),
        rating: z.coerce.number().min(1).max(5),
        notes: z.string().optional().nullable(),
      })
    )
    .optional(),
})

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>
