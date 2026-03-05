import { z } from 'zod'

const offerStatusEnum = z.enum(['draft', 'sent', 'accepted', 'declined', 'expired'])

const salaryComponentSchema = z.object({
  name: z.string(),
  monthly: z.number(),
  annual: z.number(),
  section: z.string().optional(),
})

const bonusComponentSchema = z.object({
  name: z.string(),
  amount: z.number(),
  frequency: z.string(),
})

const baseOfferSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  salary: z.coerce.number().positive('Salary must be a positive number'),
  salary_currency: z.string().default('USD'),
  start_date: z.string().min(1, 'Start date is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  template_html: z.string().min(10, 'Offer letter content is required'),
  salary_components: z.array(salaryComponentSchema).optional(),
  bonus_components: z.array(bonusComponentSchema).optional(),
  reporting_manager: z.string().optional(),
  employment_type: z.string().optional(),
  location: z.string().optional(),
  remuneration_type: z.string().optional(),
  pf_applicable: z.boolean().optional(),
  work_type: z.string().optional(),
  business_unit: z.string().optional(),
  offer_template_id: z.string().uuid().optional().nullable(),
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
