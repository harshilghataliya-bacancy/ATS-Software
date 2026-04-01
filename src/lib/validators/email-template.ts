import { z } from 'zod'

const emailTemplateTypeEnum = z.enum([
  'rejection', 'offer', 'interview_invite', 'follow_up', 'custom',
  'interview_scheduled', 'interview_scheduled_interviewer',
  'interview_updated', 'interview_cancelled',
  'assessment_invitation', 'interviewer_invite', 'offer_letter',
])

export const createEmailTemplateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  subject: z.string().min(2, 'Subject must be at least 2 characters'),
  body_html: z.string().min(10, 'Body must be at least 10 characters'),
  template_type: emailTemplateTypeEnum,
  variables: z.record(z.string(), z.unknown()).optional(),
})

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>

export const updateEmailTemplateSchema = createEmailTemplateSchema.partial()

export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>
