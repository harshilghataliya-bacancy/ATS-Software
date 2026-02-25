import { z } from 'zod'

const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contract', 'internship'], { message: 'Please select employment type' })
const jobStatusEnum = z.enum(['draft', 'published', 'closed', 'archived'], { message: 'Please select a status' })
const experienceLevelEnum = z.enum(['entry', 'mid', 'senior', 'lead', 'director', 'vp', 'c_level'], { message: 'Please select experience level' })
const remotePolicyEnum = z.enum(['on_site', 'hybrid', 'remote'], { message: 'Please select remote policy' })
const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent'], { message: 'Please select priority' })
const jobEducationEnum = z.enum(['any', 'high_school', 'associate', 'bachelor', 'master', 'doctorate'], { message: 'Please select education level' })

export const createJobSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  department: z.string().min(1, 'Department is required'),
  location: z.string().min(1, 'Location is required'),
  employment_type: employmentTypeEnum,
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  salary_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Min salary is required' }).positive('Must be positive')
  ),
  salary_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Max salary is required' }).positive('Must be positive')
  ),
  salary_currency: z.string().default('USD'),
  status: jobStatusEnum.default('draft'),
  experience_level: experienceLevelEnum,
  num_openings: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? 1 : Number(val)),
    z.number().int().min(1, 'Must be at least 1').default(1)
  ),
  application_deadline: z.string().min(1, 'Application deadline is required'),
  remote_policy: remotePolicyEnum.default('on_site'),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  benefits: z.string().min(1, 'Benefits is required'),
  nice_to_have: z.string().min(1, 'Nice to have is required'),
  education_level: jobEducationEnum,
  experience_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Min experience is required' }).min(0)
  ),
  experience_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Max experience is required' }).min(0)
  ),
  priority: priorityEnum.default('medium'),
})

export type CreateJobInput = z.infer<typeof createJobSchema>

// Update schema keeps everything optional so individual fields can be patched
export const updateJobSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').optional(),
  department: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  employment_type: employmentTypeEnum.optional(),
  description: z.string().min(10).optional(),
  requirements: z.string().min(10).optional(),
  salary_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().positive().nullable()
  ),
  salary_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().positive().nullable()
  ),
  salary_currency: z.string().optional(),
  status: jobStatusEnum.optional(),
  experience_level: experienceLevelEnum.optional().nullable(),
  num_openings: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? 1 : Number(val)),
    z.number().int().min(1).default(1)
  ),
  application_deadline: z.string().optional().nullable().or(z.literal('')),
  remote_policy: remotePolicyEnum.optional(),
  skills: z.array(z.string()).optional().nullable(),
  benefits: z.string().optional().nullable().or(z.literal('')),
  nice_to_have: z.string().optional().nullable().or(z.literal('')),
  education_level: jobEducationEnum.optional().nullable(),
  experience_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().min(0).nullable()
  ),
  experience_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().min(0).nullable()
  ),
  priority: priorityEnum.optional(),
})

export type UpdateJobInput = z.infer<typeof updateJobSchema>
