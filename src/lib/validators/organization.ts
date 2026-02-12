import { z } from 'zod'

const orgRoleEnum = z.enum(['admin', 'recruiter', 'hiring_manager'])

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  logo_url: z.string().url().optional().nullable(),
  careers_page_config: z.record(z.string(), z.unknown()).optional().nullable(),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

export const inviteMemberSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  role: orgRoleEnum,
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>
