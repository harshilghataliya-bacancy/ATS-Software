/**
 * Default email templates for all system emails.
 * These are used as fallback when no DB template exists for an org,
 * and are auto-seeded into the DB on first use.
 *
 * Template body_html uses {{variable}} placeholders.
 * The wrapper (header/footer chrome) is applied at send time — NOT stored here.
 */

export interface DefaultEmailTemplate {
  name: string
  subject: string
  body_html: string
  variables: string[]
}

export const SYSTEM_EMAIL_TYPES = [
  'application_received',
  'interview_scheduled',
  'interview_scheduled_interviewer',
  'interview_updated',
  'interview_cancelled',
  'offer_letter',
  'rejection',
  'assessment_invitation',
  'interviewer_invite',
  'offer_revoked',
] as const

export type SystemEmailType = (typeof SYSTEM_EMAIL_TYPES)[number]

export const SYSTEM_EMAIL_TYPE_LABELS: Record<SystemEmailType, string> = {
  application_received: 'Application Received',
  interview_scheduled: 'Interview Scheduled (Candidate)',
  interview_scheduled_interviewer: 'Interview Scheduled (Interviewer)',
  interview_updated: 'Interview Updated',
  interview_cancelled: 'Interview Cancelled',
  offer_letter: 'Offer Letter',
  rejection: 'Application Rejection',
  assessment_invitation: 'Assessment Invitation',
  interviewer_invite: 'Interviewer Platform Invite',
  offer_revoked: 'Offer Revoked',
}

// ---------------------------------------------------------------------------
// Default Templates
// ---------------------------------------------------------------------------

export const DEFAULT_EMAIL_TEMPLATES: Record<SystemEmailType, DefaultEmailTemplate> = {

  // ── Application Received (to Candidate) ───────────────────────────────
  application_received: {
    name: 'Application Received',
    subject: 'Application Received — {{job_title}} at {{company_name}}',
    body_html: `<p>Dear {{candidate_name}},</p>
<p>Thank you for applying for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>. We have successfully received your application.</p>
<p>Our hiring team will carefully review your profile and qualifications. If your background aligns with our requirements, we will reach out to you with the next steps in the process.</p>
<p>In the meantime, please feel free to reach out if you have any questions.</p>
<p>We appreciate your interest in joining <strong>{{company_name}}</strong> and wish you the best!</p>
<p>Warm regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: ['candidate_name', 'job_title', 'company_name', 'department'],
  },

  // ── Interview Scheduled (to Candidate) ──────────────────────────────────
  interview_scheduled: {
    name: 'Interview Scheduled (Candidate)',
    subject: 'Interview Scheduled: {{job_title}} at {{company_name}}',
    body_html: `<p>Dear {{candidate_name}},</p>
<p>We are pleased to inform you that an interview has been scheduled for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.</p>
{{detail_table}}
{{notes_section}}
<p>Please ensure you are available at the scheduled time. If you have any questions or need to reschedule, please contact us at the earliest.</p>
<p>Best regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: [
      'candidate_name', 'job_title', 'company_name', 'interview_date', 'interview_time',
      'duration_minutes', 'interview_type', 'location', 'meeting_link', 'scheduler_name',
      'notes', 'detail_table', 'notes_section',
    ],
  },

  // ── Interview Scheduled (to Interviewer / Panel) ────────────────────────
  interview_scheduled_interviewer: {
    name: 'Interview Scheduled (Interviewer)',
    subject: 'Interview Assignment: {{candidate_name}} - {{job_title}}',
    body_html: `<p>Hi,</p>
<p>You have been scheduled to interview <strong>{{candidate_name}}</strong> for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.</p>
{{detail_table}}
{{notes_section}}
<div style="text-align:center;margin:28px 0;">
  <a href="{{view_interview_link}}" style="display:inline-block;padding:12px 32px;background-color:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">View Interview & Candidate Details</a>
</div>
<p>Scheduled by: {{scheduler_name}}</p>
<p>Best regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: [
      'candidate_name', 'candidate_email', 'job_title', 'company_name', 'interview_date',
      'interview_time', 'duration_minutes', 'interview_type', 'location', 'meeting_link',
      'panel_members', 'scheduler_name', 'notes', 'detail_table', 'notes_section',
      'view_interview_link',
    ],
  },

  // ── Interview Updated ───────────────────────────────────────────────────
  interview_updated: {
    name: 'Interview Updated',
    subject: '[Updated] Interview: {{candidate_name}} - {{job_title}}',
    body_html: `<p>Hi,</p>
<p>The interview for <strong>{{candidate_name}}</strong> — <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong> has been updated.</p>
<h3 style="font-size:15px;margin:20px 0 8px;">Updated Details</h3>
{{detail_table}}
{{notes_section}}
<p style="font-size:13px;color:#6b7280;">Updated by: {{scheduler_name}}</p>
<p>Best regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: [
      'candidate_name', 'job_title', 'company_name', 'interview_date', 'interview_time',
      'duration_minutes', 'interview_type', 'location', 'meeting_link', 'scheduler_name',
      'notes', 'detail_table', 'notes_section',
    ],
  },

  // ── Interview Cancelled ─────────────────────────────────────────────────
  interview_cancelled: {
    name: 'Interview Cancelled',
    subject: '[Cancelled] Interview: {{candidate_name}} - {{job_title}}',
    body_html: `<p>Hi,</p>
<p>The following interview has been <strong style="color:#dc2626;">cancelled</strong>:</p>
{{detail_table}}
{{reason_section}}
<p style="font-size:13px;color:#6b7280;">Cancelled by: {{scheduler_name}}</p>
<p>If you have any questions, please reach out to the recruiting team.</p>
<p>Best regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: [
      'candidate_name', 'job_title', 'company_name', 'interview_date', 'interview_time',
      'duration_minutes', 'scheduler_name', 'cancel_reason', 'detail_table', 'reason_section',
    ],
  },

  // ── Offer Letter ────────────────────────────────────────────────────────
  offer_letter: {
    name: 'Offer Letter',
    subject: 'Offer Letter - {{job_title}} at {{company_name}}',
    body_html: `<p>Dear {{candidate_name}},</p>
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
<p>Warm regards,<br/>{{company_name}} HR Team</p>`,
    variables: [
      'candidate_name', 'job_title', 'department', 'salary', 'start_date',
      'expiry_date', 'company_name', 'location',
    ],
  },

  // ── Rejection ───────────────────────────────────────────────────────────
  rejection: {
    name: 'Application Rejection',
    subject: 'Update on Your Application for {{job_title}}',
    body_html: `<p>Dear {{candidate_name}},</p>
<p>Thank you for your interest in the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong> and for taking the time to go through our interview process.</p>
<p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
<p>We truly appreciate the time and effort you invested in your application. We encourage you to apply for future openings that align with your skills and experience.</p>
<p>We wish you all the best in your career journey.</p>
<p>Warm regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: ['candidate_name', 'job_title', 'company_name', 'department'],
  },

  // ── Assessment Invitation ───────────────────────────────────────────────
  assessment_invitation: {
    name: 'Assessment Invitation',
    subject: 'Assessment Invitation – {{assessment_name}} | {{job_title}} at {{company_name}}',
    body_html: `<p>Dear {{candidate_name}},</p>
<p>Thank you for applying for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>. As part of our hiring process, we'd like you to complete an online assessment: <strong>{{assessment_name}}</strong>.</p>
{{instructions_section}}
{{expiry_section}}
<div style="text-align:center;margin:28px 0;">
  <a href="{{assessment_link}}" style="display:inline-block;padding:12px 32px;background-color:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Start Assessment</a>
</div>
<p style="font-size:13px;color:#6b7280;">Or copy this link: <a href="{{assessment_link}}" style="color:#2563eb;">{{assessment_link}}</a></p>
<p>Best regards,<br/>{{company_name}} Talent Team</p>`,
    variables: [
      'candidate_name', 'job_title', 'company_name', 'assessment_name',
      'assessment_link', 'instructions', 'expiry_date', 'instructions_section', 'expiry_section',
    ],
  },

  // ── Interviewer Platform Invite ─────────────────────────────────────────
  interviewer_invite: {
    name: 'Interviewer Platform Invite',
    subject: "You're invited to join {{company_name}} on HireFlow",
    body_html: `<p>Hi,</p>
<p>You have been invited to join <strong>{{company_name}}</strong> on HireFlow as an <strong>Interviewer</strong>.</p>
{{invite_content}}
<p>Best regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: ['company_name', 'invite_link', 'email', 'temp_password', 'app_url', 'invite_content'],
  },

  // ── Offer Revoked (to Candidate) ────────────────────────────────────────
  offer_revoked: {
    name: 'Offer Revoked',
    subject: 'Update Regarding Your Offer — {{job_title}} at {{company_name}}',
    body_html: `<p>Dear {{candidate_name}},</p>
<p>We regret to inform you that the offer for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong> has been withdrawn.</p>
<p>We sincerely apologize for any inconvenience this may cause. We truly appreciate your interest and the time you invested throughout the hiring process.</p>
<p>We encourage you to stay connected and apply for future opportunities that align with your skills and experience.</p>
<p>If you have any questions, please do not hesitate to reach out to our recruiting team.</p>
<p>Warm regards,<br/>{{company_name}} Hiring Team</p>`,
    variables: ['candidate_name', 'job_title', 'company_name'],
  },
}
