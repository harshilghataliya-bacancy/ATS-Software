import { z } from 'zod'

const offerStatusEnum = z.enum(['draft', 'sent', 'accepted', 'declined', 'expired'])

const baseOfferSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  salary: z.coerce.number().positive('Salary must be a positive number'),
  salary_currency: z.string().default('USD'),
  start_date: z.string().min(1, 'Start date is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  template_html: z.string().min(10, 'Offer letter content is required'),
})

export const createOfferSchema = baseOfferSchema.refine(
  (data) => new Date(data.expiry_date) >= new Date(data.start_date),
  { message: 'Expiry date must be on or after start date', path: ['expiry_date'] }
)

export type CreateOfferInput = z.infer<typeof createOfferSchema>

export const updateOfferSchema = baseOfferSchema.partial().extend({
  status: offerStatusEnum.optional(),
})

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>
