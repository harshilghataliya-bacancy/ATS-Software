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
  { value: 'video', label: 'Online Video' },
  { value: 'onsite', label: 'Offline Face to Face' },
] as const

export const RECOMMENDATION_OPTIONS = [
  { value: 'select', label: 'Select', color: 'text-green-700 bg-green-50' },
  { value: 'reject', label: 'Reject', color: 'text-red-600 bg-red-50' },
  { value: 'hold', label: 'Hold', color: 'text-yellow-600 bg-yellow-50' },
] as const

export const RATING_LABELS = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'] as const

export const SCORECARD_RATING_TYPES = [
  { value: 'rating', label: '1–5 Scale', description: 'Numeric rating from 1 (Poor) to 5 (Excellent)' },
  { value: 'yes_no', label: 'Yes / No', description: 'Simple yes or no evaluation' },
  { value: 'text', label: 'Text Feedback', description: 'Free-form written feedback' },
] as const

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
  revised: { label: 'Revised', variant: 'secondary' as const },
  expired: { label: 'Expired', variant: 'outline' as const },
}

export const ITEMS_PER_PAGE = 20
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',                                                          // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',      // .docx
]

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const

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

export const REMINDER_INTERVAL_OPTIONS = [
  { value: 720, label: '12 hours before' },
  { value: 240, label: '4 hours before' },
  { value: 60, label: '1 hour before' },
  { value: 30, label: '30 minutes before' },
  { value: 15, label: '15 minutes before' },
] as const

export const REAPPLY_RESTRICTION_OPTIONS = [
  { value: 0, label: 'No restriction' },
  { value: 3, label: '3 Months' },
  { value: 6, label: '6 Months' },
  { value: 12, label: '1 Year' },
] as const

export const LOCATION_SUGGESTIONS = [
  'Ahmedabad',
  'Bangalore',
  'Chennai',
  'Delhi',
  'Hyderabad',
  'Kolkata',
  'Mumbai',
  'Pune',
  'Noida',
  'Gurugram',
  'Jaipur',
  'Lucknow',
  'Chandigarh',
  'Indore',
  'Nagpur',
  'Coimbatore',
  'Kochi',
  'Thiruvananthapuram',
  'Visakhapatnam',
  'Bhopal',
  'Surat',
  'Vadodara',
  'Remote',
  'New York',
  'San Francisco',
  'London',
  'Berlin',
  'Singapore',
  'Dubai',
  'Toronto',
  'Sydney',
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
  accent_color: '#E07848',
  greeting_text: 'Dear {{candidate_name}},',
  intro_text: `Congratulations! We are pleased to confirm that you have been selected to work for **{{company_name}}**.

The position we are offering is that of **{{job_title}}** at a salary of **{{salary}}** CTC per annum. Your salary, incentives, allowances and/or any kind of payment will be subject to prevailing applicable laws and deductions there under if any. If in future as per the law of government, PF deduction will be compulsory then you will be entitled to PF contribution from the offered remuneration.

You will report to **{{reporting_manager}}**

We are pleased to confirm your employment with our organization. This role follows a five-day workweek with flexible timing. Given the global nature of our operations, you are expected to demonstrate a high degree of flexibility and adaptability, including the willingness to work in any shift as required by client needs. A minimum of 8.5 working hours per day is mandatory, regardless of the shift assigned. Detailed terms and conditions of your employment will be provided in the forthcoming Appointment Letter, serving as the guiding document for your tenure with us. We appreciate your understanding and cooperation in adhering to these requirements.

You are requested to report on or before **{{start_date}}**. In case you fail to report on this date unless otherwise agreed in writing the offer shall stand automatically withdrawn.

If on verification, at the time of appointment or at a later date it is found that you have furnished wrong information, in such cases your services to the company will be liable to terminate. Please report to HR personnel on your start date for documentation and orientation. Please sign the copy of this letter and return it to indicate your acceptance of this offer.`,
  closing_text: 'We are confident that you will be able to make a significant contribution to the success of **{{company_name}}** and we look forward to working with you.',
  validity_text: '',
  acceptance_text: `I, **{{candidate_name}}** have read all the documents and understood all the Rules & Regulations of the company and hereby accept this employment offer.

Probation Period Offer:

I accept that for the first 6 months I shall be employed on a probation Employment and my yearly salary will be **{{salary}}**

Joining Date: **{{start_date}}**`,
  signatory_label: 'HR Team',
  candidate_sig_label: 'Acceptance by Candidate',
  footer_text: '',
  terms_and_conditions: `Flexi Pay:

"At the company, the 'Flexi Pay' component is structured to support the organization's financial stability. While it appears in the earnings section, it will be fully paid out as a regular monthly earning component. However, in the event of a financial crisis within the organization, this component may be temporarily withheld for a few months to help maintain sustainability. Once the situation normalizes, regular payments will resume. These adjustments are applied uniformly across the company to ensure fairness and consistency. This policy is designed to protect both the company's financial health and the long-term interests of its employees."

In line with our company's strategies and commitment to growth and safety, we do not anticipate any such scenarios arising in the future.

Gratuity:

When you reach the completion of five years from your date of joining {{company_name}}, you become eligible to receive a gratuity payment upon departure.

Note:

1. Retention Bonus is Payable Yearly
2. TDS will be deducted as per the Income Tax Act 1961.
3. Professional Tax deducted will be as per the current job location.
4. As per payment of Gratuity Act, 1972 and as per company policy on gratuity, the maximum gratuity payable is Rs. 20 Lacs.`,
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
      { key: '{{salary_currency}}', label: 'Salary Currency' },
      { key: '{{remuneration_type}}', label: 'Remuneration Type (Annual/Monthly)' },
      { key: '{{start_date}}', label: 'Start Date' },
      { key: '{{expiry_date}}', label: 'Expiry Date' },
      { key: '{{employment_type}}', label: 'Employment Type' },
      { key: '{{work_type}}', label: 'Work Type' },
      { key: '{{reporting_manager}}', label: 'Reporting Manager' },
    ],
  },
  {
    category: 'Compensation',
    variables: [
      { key: '{{salary_structure}}', label: 'Salary Structure (Table)' },
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
