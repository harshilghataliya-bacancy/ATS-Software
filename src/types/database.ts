// =============================================================================
// Database Types - Matching Supabase Schema
// =============================================================================

// Enums
export type OrgRole = 'admin' | 'recruiter' | 'hiring_manager'
export type JobStatus = 'draft' | 'published' | 'closed' | 'archived'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type StageType = 'applied' | 'screening' | 'interview' | 'assessment' | 'offer' | 'hired' | 'rejected'
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
  published_at: string | null
  closed_at: string | null
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
  created_by: string
  created_at: string
  updated_at: string
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
