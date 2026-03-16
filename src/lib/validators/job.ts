import { z } from 'zod'

const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contract', 'internship'], { message: 'Please select an employment type' })
const jobStatusEnum = z.enum(['draft', 'published', 'closed', 'archived'], { message: 'Please select a status' })
const experienceLevelEnum = z.enum(['entry', 'mid', 'senior', 'lead', 'director', 'vp', 'c_level'], { message: 'Please select an experience level' })
const remotePolicyEnum = z.enum(['on_site', 'hybrid', 'remote'], { message: 'Please select a remote policy' })
const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent'], { message: 'Please select a priority' })
const jobEducationEnum = z.enum(['any', 'high_school', 'associate', 'bachelor', 'master', 'doctorate'], { message: 'Please select an education level' })

export const createJobSchema = z.object({
  title: z.string({ message: 'Please enter a job title' }).min(2, 'Please enter at least 2 characters for the title'),
  department: z.string({ message: 'Please enter a department' }).min(1, 'Please enter a department'),
  location: z.string({ message: 'Please enter a location' }).min(1, 'Please enter a location'),
  employment_type: employmentTypeEnum,
  description: z.string({ message: 'Please add a job description' }).min(10, 'Please add at least 10 characters for the description'),
  requirements: z.string({ message: 'Please add job requirements' }).min(10, 'Please add at least 10 characters for the requirements'),
  salary_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Please enter the minimum salary' }).positive('Salary must be a positive number')
  ),
  salary_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Please enter the maximum salary' }).positive('Salary must be a positive number')
  ),
  salary_currency: z.string().default('INR'),
  status: jobStatusEnum.default('draft'),
  experience_level: experienceLevelEnum,
  num_openings: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? 1 : Number(val)),
    z.number().int().min(1, 'Please enter at least 1 opening').default(1)
  ),
  application_deadline: z.string().optional().nullable().or(z.literal('')),
  remote_policy: remotePolicyEnum.default('on_site'),
  skills: z.array(z.string(), { message: 'Please add at least one skill' }).min(1, 'Please add at least one skill'),
  benefits: z.string({ message: 'Please add benefits & perks' }).min(1, 'Please add benefits & perks'),
  nice_to_have: z.string({ message: 'Please add nice-to-have qualifications' }).min(1, 'Please add nice-to-have qualifications'),
  education_level: jobEducationEnum,
  experience_min: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Please enter minimum experience' }).min(0, 'Experience cannot be negative')
  ),
  experience_max: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number({ message: 'Please enter maximum experience' }).min(0, 'Experience cannot be negative')
  ),
  priority: priorityEnum.default('medium'),
  assigned_to: z.string({ message: 'Please assign a recruiter' }).uuid('Please assign a recruiter'),
})

export type CreateJobInput = z.infer<typeof createJobSchema>

// Update schema keeps everything optional so individual fields can be patched
export const updateJobSchema = z.object({
  title: z.string().min(2, 'Please enter at least 2 characters for the title').optional(),
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
  assigned_to: z.string().uuid().nullable().optional(),
})

export type UpdateJobInput = z.infer<typeof updateJobSchema>
