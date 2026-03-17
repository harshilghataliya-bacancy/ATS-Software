// =============================================================================
// Database Types - Matching Supabase Schema
// =============================================================================

// Enums
export type OrgRole = 'admin' | 'recruiter' | 'hiring_manager' | 'interviewer'
export type JobStatus = 'draft' | 'published' | 'closed' | 'archived'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type StageType = 'applied' | 'screening' | 'assessment' | 'interview' | 'offer' | 'hired' | 'rejected'
export type ApplicationStatus = 'active' | 'withdrawn' | 'rejected' | 'hired'
export type InterviewType = 'phone' | 'video' | 'onsite' | 'technical' | 'cultural'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type PanelistRole = 'interviewer' | 'lead' | 'observer'
export type PanelistStatus = 'pending' | 'accepted' | 'declined'
export type Recommendation = 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no'
export type EmailTemplateType = 'rejection' | 'offer' | 'interview_invite' | 'follow_up' | 'custom'
export type EmailStatus = 'sent' | 'failed' | 'bounced'
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export type CandidateSource = 'direct' | 'referral' | 'linkedin' | 'job_board' | 'careers_page' | 'other'
export type OAuthProvider = 'google_calendar' | 'gmail'
export type CommentEntityType = 'application' | 'candidate' | 'interview'

// Table Row Types
export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  careers_page_config: Record<string, unknown> | null
  offer_reapply_restriction_months: number
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  invited_email: string | null
  invited_at: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Job {
  id: string
  organization_id: string
  title: string
  department: string
  location: string
  employment_type: EmploymentType
  description: string
  requirements: string
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  status: JobStatus
  experience_level: string | null
  num_openings: number
  application_deadline: string | null
  remote_policy: string
  skills: string[]
  benefits: string | null
  nice_to_have: string | null
  education_level: string | null
  experience_min: number | null
  experience_max: number | null
  priority: string
  published_at: string | null
  closed_at: string | null
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PipelineStage {
  id: string
  job_id: string
  organization_id: string
  name: string
  display_order: number
  is_default: boolean
  stage_type: StageType
  created_at: string
  updated_at: string
}

export interface Candidate {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  portfolio_url: string | null
  current_company: string | null
  current_title: string | null
  location: string | null
  source: CandidateSource
  source_details: string | null
  current_salary: number | null
  expected_salary: number | null
  education: string | null
  experience_years: number | null
  notice_period: string | null
  cover_letter: string | null
  date_of_birth: string | null
  gender: string | null
  resume_url: string | null
  resume_parsed_data: ResumeParsedData | null
  gdpr_consent: boolean
  gdpr_consent_at: string | null
  notes: string | null
  tags: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Application {
  id: string
  organization_id: string
  job_id: string
  candidate_id: string
  current_stage_id: string | null
  status: ApplicationStatus
  applied_at: string
  rejected_at: string | null
  hired_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface StageMovement {
  id: string
  application_id: string
  organization_id: string
  from_stage_id: string | null
  to_stage_id: string
  moved_by: string
  moved_at: string
  notes: string | null
}

export interface Interview {
  id: string
  organization_id: string
  application_id: string
  job_id: string
  candidate_id: string
  title: string | null
  scheduled_at: string
  duration_minutes: number
  location: string | null
  meeting_link: string | null
  interview_type: InterviewType
  status: InterviewStatus
  google_calendar_event_id: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface InterviewPanelist {
  id: string
  interview_id: string
  organization_id: string
  user_id: string
  role: PanelistRole
  status: PanelistStatus
  created_at: string
}

export interface InterviewFeedback {
  id: string
  interview_id: string
  organization_id: string
  user_id: string
  application_id: string
  overall_rating: number
  recommendation: Recommendation
  strengths: string | null
  weaknesses: string | null
  notes: string | null
  submitted_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ScorecardCriteria {
  id: string
  organization_id: string
  job_id: string
  name: string
  description: string | null
  weight: number
  created_at: string
}

export interface ScorecardRating {
  id: string
  feedback_id: string
  criteria_id: string
  organization_id: string
  rating: number
  notes: string | null
}

export interface EmailTemplate {
  id: string
  organization_id: string
  name: string
  subject: string
  body_html: string
  variables: Record<string, unknown> | null
  template_type: EmailTemplateType
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface EmailLog {
  id: string
  organization_id: string
  application_id: string | null
  candidate_id: string | null
  template_id: string | null
  from_email: string
  to_email: string
  subject: string
  body_html: string
  status: EmailStatus
  sent_at: string | null
  error_message: string | null
  created_at: string
}

export interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section?: string
}

// Salary Structure types (admin-configurable)
export type SalaryComponentCalcType = 'percentage_of_ctc' | 'percentage_of_basic' | 'fixed'
export type SalaryComponentSection = 'earnings' | 'deduction' | 'employer'

export interface SalaryStructureComponent {
  name: string
  type: SalaryComponentCalcType
  value: number
  section: SalaryComponentSection
  is_balancing?: boolean
}

export interface SalaryStructure {
  id: string
  organization_id: string
  name: string
  description: string | null
  is_default: boolean
  components: SalaryStructureComponent[]
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface BonusComponent {
  name: string
  amount: number
  frequency: string
}

export interface OfferLetter {
  id: string
  organization_id: string
  application_id: string
  candidate_id: string
  job_id: string
  template_html: string
  generated_pdf_url: string | null
  salary: number
  salary_currency: string
  start_date: string
  expiry_date: string
  status: OfferStatus
  sent_at: string | null
  responded_at: string | null
  response_notes: string | null
  salary_components: SalaryComponent[] | null
  bonus_components: BonusComponent[] | null
  reporting_manager: string | null
  employment_type: string | null
  location: string | null
  remuneration_type: string | null
  pf_applicable: boolean
  work_type: string | null
  business_unit: string | null
  offer_template_id: string | null
  salary_structure_id: string | null
  response_token: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface OfferTemplate {
  id: string
  organization_id: string
  name: string
  is_active: boolean
  logo_url: string | null
  company_name: string | null
  terms_and_conditions: string | null
  // Branding
  primary_color: string | null
  accent_color: string | null
  // PDF Content Sections
  greeting_text: string | null
  intro_text: string | null
  closing_text: string | null
  validity_text: string | null
  acceptance_text: string | null
  // Signature
  signatory_name: string | null
  signatory_title: string | null
  signatory_label: string | null
  candidate_sig_label: string | null
  // Section toggles
  show_salary_breakdown: boolean
  show_bonus_section: boolean
  show_terms_section: boolean
  show_acceptance_section: boolean
  show_signature_block: boolean
  // Footer
  footer_text: string | null
  // Email customization
  email_subject: string | null
  email_body: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ActivityLog {
  id: string
  organization_id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface GoogleOAuthToken {
  id: string
  user_id: string
  organization_id: string
  access_token: string
  refresh_token: string | null
  token_expiry: string | null
  scopes: string[] | null
  provider: OAuthProvider
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  organization_id: string
  entity_type: CommentEntityType
  entity_id: string
  user_id: string
  content: string
  is_private: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Resume Parsed Data
export interface ResumeParsedData {
  skills: string[]
  experience: {
    company: string
    title: string
    start_date: string
    end_date: string | null
    description: string
  }[]
  education: {
    institution: string
    degree: string
    field: string
    graduation_year: number
  }[]
  summary: string
}

// White-Label Types
export type DomainStatus = 'pending' | 'verified' | 'failed'
export type SubdomainStatus = 'active' | 'inactive'

export interface OrganizationDomain {
  id: string
  organization_id: string
  domain: string
  status: DomainStatus
  verification_token: string
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationSubdomain {
  id: string
  organization_id: string
  subdomain: string
  status: SubdomainStatus
  created_at: string
  updated_at: string
}

export interface OrganizationBranding {
  organization_id: string
  brand_name: string | null
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  created_at: string
  updated_at: string
}

// WhatsApp Integration Types
export type WhatsAppMessageDirection = 'outbound' | 'inbound'
export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export interface WhatsAppConfig {
  id: string
  organization_id: string
  account_sid: string
  auth_token: string
  whatsapp_number: string
  is_sandbox: boolean
  created_at: string
  updated_at: string
}

export interface WhatsAppMessage {
  id: string
  organization_id: string
  candidate_id: string
  application_id: string | null
  from_number: string
  to_number: string
  message_body: string
  direction: WhatsAppMessageDirection
  twilio_message_sid: string | null
  status: WhatsAppMessageStatus
  sent_by: string | null
  error_message: string | null
  created_at: string
}

// Candidate Bank Types
export interface CandidateBank {
  id: string
  organization_id: string
  name: string
  description: string | null
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CandidateBankMember {
  id: string
  bank_id: string
  candidate_id: string
  organization_id: string
  added_by: string | null
  added_at: string
}

// Join Types
export interface JobWithStages extends Job {
  pipeline_stages: PipelineStage[]
}

export interface ApplicationWithDetails extends Application {
  candidates: Candidate
  jobs: Job
  pipeline_stages: PipelineStage
}

export interface InterviewWithDetails extends Interview {
  interview_panelists: (InterviewPanelist & { user?: { email: string; raw_user_meta_data: Record<string, unknown> } })[]
  candidates: Candidate
  jobs: Job
}

export interface CandidateWithApplications extends Candidate {
  applications: (Application & { jobs: Job })[]
}

// Assessment Integration Types
export type AssessmentInvitationStatus = 'invited' | 'started' | 'completed' | 'expired'

export interface AssessmentInvitation {
  id: string
  organization_id: string
  application_id: string
  candidate_id: string
  job_id: string
  assessment_link: string | null
  instructions: string | null
  expiry_date: string | null
  sent_at: string | null
  status: AssessmentInvitationStatus
  score: number | null
  invited_at: string
  completed_at: string | null
  invited_by: string | null
  created_at: string
  updated_at: string
}
