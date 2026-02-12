import { z } from 'zod'

const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contract', 'internship'])
const jobStatusEnum = z.enum(['draft', 'published', 'closed', 'archived'])

export const createJobSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  department: z.string().min(1, 'Department is required'),
  location: z.string().min(1, 'Location is required'),
  employment_type: employmentTypeEnum,
  description: z.string().min(10, 'Description must be at least 10 characters'),
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  salary_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().positive().nullable()
  ),
  salary_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : Number(val)),
    z.number().positive().nullable()
  ),
  salary_currency: z.string().default('USD'),
  status: jobStatusEnum.default('draft'),
})

export type CreateJobInput = z.infer<typeof createJobSchema>

export const updateJobSchema = createJobSchema.partial().extend({
  status: jobStatusEnum.optional(),
})

export type UpdateJobInput = z.infer<typeof updateJobSchema>
