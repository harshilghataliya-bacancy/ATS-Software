import { z } from 'zod'

const recommendationEnum = z.enum(['strong_yes', 'yes', 'neutral', 'no', 'strong_no'])

export const submitFeedbackSchema = z.object({
  interview_id: z.string().uuid('Invalid interview ID'),
  overall_rating: z.coerce.number().min(1).max(5),
  recommendation: recommendationEnum,
  strengths: z.string().optional().nullable(),
  weaknesses: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
