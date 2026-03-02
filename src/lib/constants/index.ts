export const APP_NAME = 'HireFlow'
export const APP_DESCRIPTION = 'Modern Applicant Tracking System'

export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Applied', display_order: 0, stage_type: 'applied' as const },
  { name: 'Screening', display_order: 1, stage_type: 'screening' as const },
  { name: 'Assessment', display_order: 2, stage_type: 'assessment' as const },
  { name: 'Interview', display_order: 3, stage_type: 'interview' as const },
  { name: 'Offer', display_order: 4, stage_type: 'offer' as const },
  { name: 'Hired', display_order: 5, stage_type: 'hired' as const },
]

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
] as const

export const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry Level' },
  { value: 'mid', label: 'Mid Level' },
  { value: 'senior', label: 'Senior Level' },
  { value: 'lead', label: 'Lead' },
  { value: 'director', label: 'Director' },
  { value: 'vp', label: 'VP' },
  { value: 'c_level', label: 'C-Level / Executive' },
] as const

export const REMOTE_POLICIES = [
  { value: 'on_site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
] as const

export const JOB_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const

export const JOB_EDUCATION_LEVELS = [
  { value: 'any', label: 'Any' },
  { value: 'high_school', label: 'High School' },
  { value: 'associate', label: 'Associate Degree' },
  { value: 'bachelor', label: "Bachelor's Degree" },
  { value: 'master', label: "Master's Degree" },
  { value: 'doctorate', label: 'Doctorate / PhD' },
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
  draft: { label: 'Draft', variant: 'secondary' as const, className: '' },
  published: { label: 'Published', variant: 'secondary' as const, className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100/80' },
  closed: { label: 'Closed', variant: 'destructive' as const, className: '' },
  archived: { label: 'Archived', variant: 'outline' as const, className: '' },
}

export const APPLICATION_STATUS_CONFIG = {
  active: { label: 'Active', variant: 'default' as const },
  withdrawn: { label: 'Withdrawn', variant: 'secondary' as const },
  rejected: { label: 'Rejected', variant: 'destructive' as const },
  hired: { label: 'Hired', variant: 'default' as const },
}

export const ASSESSMENT_STATUS_CONFIG = {
  invited: { label: 'Invited', variant: 'secondary' as const, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  started: { label: 'In Progress', variant: 'secondary' as const, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', variant: 'default' as const, className: 'bg-green-100 text-green-700 border-green-200' },
  expired: { label: 'Expired', variant: 'outline' as const, className: 'text-gray-500' },
}

export const OFFER_STATUS_CONFIG = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  sent: { label: 'Sent', variant: 'default' as const },
  accepted: { label: 'Accepted', variant: 'default' as const },
  declined: { label: 'Declined', variant: 'destructive' as const },
  revoked: { label: 'Revoked', variant: 'destructive' as const },
  expired: { label: 'Expired', variant: 'outline' as const },
}

export const ITEMS_PER_PAGE = 20
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_RESUME_TYPES = [
  'application/pdf',
]

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const

// Indian Salary Structure
// -----------------------------------------------------------------------
// Standard industry structure used by most Indian companies (Keka-style).
// All percentages are defaults — recruiters can edit individual amounts.
//
// Earnings (Gross / SUB TOTAL):
//   Basic            = 30% of CTC
//   HRA              = 40% of Basic
//   LTA              = 2% of CTC
//   Uniform          = Rs 2,000/month (flat)
//   Bonus Allowance  = 8.33% of Basic (statutory bonus)
//   Flexi Pay        = 25% of CTC
//   Special Allow    = Gross - all above (balancing figure)
//
// Employer contributions (added on top of Gross to form CTC):
//   Gratuity         = 4.81% of Basic
//   Employer PF      = 12% of Basic (only if PF applicable)
//
// Deductions (from Gross to get Net Pay):
//   Employee PF      = 12% of Basic (only if PF applicable)
//   Professional Tax = Rs 200/month

export const SALARY_STRUCTURE_CONFIG = {
  basicPctOfCtc: 30,               // 30% of CTC
  hraPctOfBasic: 40,               // 40% of Basic
  ltaPctOfCtc: 2,                  // 2% of CTC (Travel Reimbursement)
  uniformMonthly: 2000,            // Flat Rs 2,000/month
  bonusAllowancePctOfBasic: 8.33,  // Statutory Bonus = 8.33% of Basic
  flexiPayPctOfCtc: 25,            // 25% of CTC
  gratuityPctOfBasic: 4.81,        // 4.81% of Basic (Payment of Gratuity Act)
  employerPfPctOfBasic: 12,        // 12% of Basic (3.67% EPF + 8.33% EPS)
  employeePfPctOfBasic: 12,        // 12% of Basic
  professionalTaxAnnual: 2400,     // Rs 200/month (state-dependent)
} as const

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
] as const

export const WORK_TYPE_OPTIONS = [
  { value: 'on_site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
] as const

export const REMUNERATION_TYPES = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
] as const

export const REAPPLY_RESTRICTION_OPTIONS = [
  { value: 0, label: 'No restriction' },
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '1 Year' },
] as const

export const OFFER_TEMPLATE_VARIABLES = [
  '{{candidate_name}}',
  '{{job_title}}',
  '{{department}}',
  '{{salary}}',
  '{{start_date}}',
  '{{expiry_date}}',
  '{{company_name}}',
  '{{location}}',
] as const

export const OFFER_PDF_DEFAULTS = {
  primary_color: '#1e3a5f',
  accent_color: '#2563eb',
  header_subtitle: 'Confidential',
  greeting_text: 'Dear {{candidate_name}},',
  intro_text: 'We are pleased to inform you that you have been selected for the position of {{job_title}} at {{company_name}}. Based on your qualifications, experience, and performance during the interview process, we believe you will be a valuable addition to our team.\n\nWe are delighted to present you with the following terms and conditions of your employment:',
  closing_text: 'Please sign below and return a copy of this letter to indicate your acceptance of the above terms and conditions. We look forward to welcoming you to the {{company_name}} team.',
  validity_text: 'This offer is valid until {{expiry_date}}. If we do not receive your signed acceptance by this date, this offer shall stand withdrawn automatically.',
  acceptance_text: 'Please sign below and return a copy of this letter to indicate your acceptance of the above terms and conditions.',
  signatory_label: 'Authorized Signatory',
  candidate_sig_label: 'Acceptance by Candidate',
  footer_text: 'This is a system-generated offer letter by {{company_name}}. Strictly Confidential.',
} as const

export const OFFER_TEMPLATE_VARIABLE_CATEGORIES = [
  {
    category: 'Candidate',
    variables: [
      { key: '{{candidate_name}}', label: 'Candidate Name' },
      { key: '{{candidate_email}}', label: 'Candidate Email' },
    ],
  },
  {
    category: 'Job',
    variables: [
      { key: '{{job_title}}', label: 'Job Title' },
      { key: '{{department}}', label: 'Department' },
      { key: '{{business_unit}}', label: 'Business Unit' },
      { key: '{{location}}', label: 'Location' },
    ],
  },
  {
    category: 'Offer',
    variables: [
      { key: '{{salary}}', label: 'Salary (formatted)' },
      { key: '{{start_date}}', label: 'Start Date' },
      { key: '{{expiry_date}}', label: 'Expiry Date' },
      { key: '{{employment_type}}', label: 'Employment Type' },
      { key: '{{work_type}}', label: 'Work Type' },
      { key: '{{reporting_manager}}', label: 'Reporting Manager' },
    ],
  },
  {
    category: 'Company',
    variables: [
      { key: '{{company_name}}', label: 'Company Name' },
      { key: '{{signatory_name}}', label: 'Signatory Name' },
      { key: '{{signatory_title}}', label: 'Signatory Title' },
    ],
  },
] as const

// Email body template — brief notification email. Full details go in the attached PDF.
export const DEFAULT_OFFER_TEMPLATE = `<p>Dear {{candidate_name}},</p>

<p>We are delighted to extend an offer of employment for the position of <strong>{{job_title}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company_name}}</strong>.</p>

<p>Please find the detailed offer letter attached as a PDF document. Here are the key highlights:</p>

<ul>
<li><strong>Position:</strong> {{job_title}}</li>
<li><strong>Department:</strong> {{department}}</li>
<li><strong>Location:</strong> {{location}}</li>
<li><strong>Date of Joining:</strong> {{start_date}}</li>
<li><strong>Annual CTC:</strong> {{salary}}</li>
</ul>

<p>This offer is valid until <strong>{{expiry_date}}</strong>. Please review the attached offer letter carefully and confirm your acceptance at your earliest convenience.</p>

<p>We look forward to welcoming you aboard!</p>

<p>Warm regards,<br/>{{company_name}} HR Team</p>`
