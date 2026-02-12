export const APP_NAME = 'HireFlow'
export const APP_DESCRIPTION = 'Modern Applicant Tracking System'

export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Applied', display_order: 0, stage_type: 'applied' as const },
  { name: 'Screening', display_order: 1, stage_type: 'screening' as const },
  { name: 'Interview', display_order: 2, stage_type: 'interview' as const },
  { name: 'Assessment', display_order: 3, stage_type: 'assessment' as const },
  { name: 'Offer', display_order: 4, stage_type: 'offer' as const },
  { name: 'Hired', display_order: 5, stage_type: 'hired' as const },
]

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
] as const

export const CANDIDATE_SOURCES = [
  { value: 'direct', label: 'Direct Application' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'job_board', label: 'Job Board' },
  { value: 'careers_page', label: 'Careers Page' },
  { value: 'other', label: 'Other' },
] as const

export const INTERVIEW_TYPES = [
  { value: 'phone', label: 'Phone Screen' },
  { value: 'video', label: 'Video Call' },
  { value: 'onsite', label: 'On-site' },
  { value: 'technical', label: 'Technical' },
  { value: 'cultural', label: 'Cultural Fit' },
] as const

export const RECOMMENDATION_OPTIONS = [
  { value: 'strong_yes', label: 'Strong Yes', color: 'text-green-700 bg-green-50' },
  { value: 'yes', label: 'Yes', color: 'text-green-600 bg-green-50' },
  { value: 'neutral', label: 'Neutral', color: 'text-yellow-600 bg-yellow-50' },
  { value: 'no', label: 'No', color: 'text-red-500 bg-red-50' },
  { value: 'strong_no', label: 'Strong No', color: 'text-red-700 bg-red-50' },
] as const

export const RATING_LABELS = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'] as const

export const JOB_STATUS_CONFIG = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  published: { label: 'Published', variant: 'default' as const },
  closed: { label: 'Closed', variant: 'destructive' as const },
  archived: { label: 'Archived', variant: 'outline' as const },
}

export const APPLICATION_STATUS_CONFIG = {
  active: { label: 'Active', variant: 'default' as const },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' as const },
  rejected: { label: 'Rejected', variant: 'destructive' as const },
  hired: { label: 'Hired', variant: 'default' as const },
}

export const OFFER_STATUS_CONFIG = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  sent: { label: 'Sent', variant: 'default' as const },
  accepted: { label: 'Accepted', variant: 'default' as const },
  declined: { label: 'Declined', variant: 'destructive' as const },
  expired: { label: 'Expired', variant: 'outline' as const },
}

export const ITEMS_PER_PAGE = 20
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const

export const OFFER_TEMPLATE_VARIABLES = [
  '{{candidate_name}}',
  '{{job_title}}',
  '{{department}}',
  '{{salary}}',
  '{{start_date}}',
  '{{expiry_date}}',
  '{{company_name}}',
] as const

export const DEFAULT_OFFER_TEMPLATE = `<h2>Offer of Employment</h2>

<p>Dear {{candidate_name}},</p>

<p>We are pleased to extend an offer of employment for the position of <strong>{{job_title}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company_name}}</strong>.</p>

<h3>Compensation</h3>
<p>Your annual salary will be <strong>{{salary}}</strong>.</p>

<h3>Start Date</h3>
<p>Your anticipated start date is <strong>{{start_date}}</strong>.</p>

<h3>Offer Expiry</h3>
<p>This offer is valid until <strong>{{expiry_date}}</strong>. Please confirm your acceptance before this date.</p>

<p>We are excited about the possibility of you joining our team and look forward to your positive response.</p>

<p>Best regards,<br/>The {{company_name}} Team</p>`
