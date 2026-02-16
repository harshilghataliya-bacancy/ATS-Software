import { z } from 'zod'

export const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'email', 'smtp', 'imap',
  'ftp', 'ssh', 'ns1', 'ns2', 'dns', 'cdn', 'static', 'assets',
  'blog', 'docs', 'help', 'support', 'status', 'staging', 'dev',
  'test', 'demo', 'dashboard', 'login', 'signup', 'auth', 'oauth',
  'careers', 'jobs', 'hire', 'hireflow',
] as const

export const addDomainSchema = z.object({
  domain: z
    .string()
    .min(4, 'Domain must be at least 4 characters')
    .max(253, 'Domain too long')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      'Invalid domain format. Use lowercase letters, numbers, hyphens, and dots only'
    )
    .transform((d) => d.toLowerCase()),
})

export type AddDomainInput = z.infer<typeof addDomainSchema>

export const addSubdomainSchema = z.object({
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(63, 'Subdomain too long')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Subdomain must be lowercase letters, numbers, and hyphens only'
    )
    .refine(
      (val) => !RESERVED_SUBDOMAINS.includes(val as typeof RESERVED_SUBDOMAINS[number]),
      'This subdomain is reserved'
    )
    .transform((s) => s.toLowerCase()),
})

export type AddSubdomainInput = z.infer<typeof addSubdomainSchema>

export const updateBrandingSchema = z.object({
  brand_name: z.string().max(100).optional().nullable(),
  logo_url: z.string().transform((v) => v.trim() || null).pipe(z.string().refine((url) => /^https?:\/\/.+/.test(url), 'Must be a valid HTTP(S) URL').nullable()).optional(),
  favicon_url: z.string().transform((v) => v.trim() || null).pipe(z.string().refine((url) => /^https?:\/\/.+/.test(url), 'Must be a valid HTTP(S) URL').nullable()).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g., #4f46e5)')
    .optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g., #06b6d4)')
    .optional(),
})

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>
