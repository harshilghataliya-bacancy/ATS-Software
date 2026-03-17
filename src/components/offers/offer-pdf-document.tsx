import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import { OFFER_PDF_DEFAULTS } from '@/lib/constants'

// Register a cursive "pen" font for recruiter signature
Font.register({
  family: 'GreatVibes',
  src: 'https://fonts.gstatic.com/s/greatvibes/v18/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf',
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SalaryComponent {
  name: string
  monthly: number
  annual: number
  section?: string // 'earnings' | 'deduction' | 'employer'
}

interface BonusComponent {
  name: string
  amount: number
  frequency: string
}

export interface OfferPDFProps {
  companyName: string
  candidateName: string
  candidateEmail: string
  jobTitle: string
  department: string
  businessUnit?: string
  employmentType?: string
  workType?: string
  location?: string
  reportingManager?: string
  salary: string
  salaryCurrency: string
  startDate: string
  expiryDate: string
  createdDate: string
  salaryComponents?: SalaryComponent[]
  bonusComponents?: BonusComponent[]
  pfApplicable?: boolean
  referenceNumber?: string
  // Template fields
  templateLogoUrl?: string
  templateCompanyName?: string
  templateTerms?: string
  primaryColor?: string
  accentColor?: string
  greetingText?: string
  introText?: string
  closingText?: string
  validityText?: string
  acceptanceText?: string
  signatoryName?: string
  signatoryTitle?: string
  signatoryLabel?: string
  candidateSigLabel?: string
  showSalaryBreakdown?: boolean
  showBonusSection?: boolean
  showTermsSection?: boolean
  showAcceptanceSection?: boolean
  showSignatureBlock?: boolean
  footerText?: string
  // Contact info for header (optional)
  companyPhone?: string
  companyEmail?: string
  companyWebsite?: string
  companyAddress?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sub(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

// Strip any unresolved {{placeholder}} patterns
function stripPlaceholders(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '').trim()
}

// Renders text with **bold** markers as inline bold spans
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FormattedPara({ text, style }: { text: string; style: any }) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return <Text style={style}>{text}</Text>
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{part}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  )
}

// Small colored dot — replaces emoji icons
function Dot({ color }: { color: string }) {
  return (
    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, marginRight: 5, marginTop: 2 }} />
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  // Page: horizontal padding for content. Top/bottom handled by header/footer in flow.
  page: {
    paddingHorizontal: 48,
    paddingBottom: 10,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1f2937',
    lineHeight: 1.55,
    backgroundColor: '#ffffff',
  },

  // ── Header — full-bleed (negative horizontal margin to cancel page padding) ──
  headerOuter: { marginHorizontal: -48 },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 30,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerLogo: { width: 130, height: 52, objectFit: 'contain' as const },
  headerCompanyText: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  headerContactBlock: { flexDirection: 'column' as const, alignItems: 'flex-start' as const },
  headerContactRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 3 },
  headerContactText: { fontSize: 8.5, color: '#374151' },
  headerDivider: { height: 3 },

  // 2-line gap after header divider before body content
  headerGap: { height: 20 },

  // ── Letter body ────────────────────────────────────────────────────────
  docTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center' as const,
    textDecoration: 'underline',
    marginBottom: 22,
    letterSpacing: 0.5,
  },
  dateText: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 22 },
  greetText: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 14 },
  body: { fontSize: 10, lineHeight: 1.65, marginBottom: 10, textAlign: 'justify' as const },

  // ── Signature block ────────────────────────────────────────────────────
  sigFor: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 28 },
  sigPenName: { fontFamily: 'GreatVibes', fontSize: 22, color: '#1a1a2e', marginTop: 14, marginBottom: 4 },
  sigLineRule: { borderBottomWidth: 0.75, borderBottomColor: '#374151', width: 170, marginBottom: 5 },
  sigName: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sigRole: { fontSize: 9, color: '#6b7280' },

  // ── Acceptance page ────────────────────────────────────────────────────
  acceptTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textDecoration: 'underline',
    marginBottom: 20,
  },
  acceptBody: { fontSize: 10, lineHeight: 1.65, marginBottom: 10, textAlign: 'justify' as const },
  acceptSigLine: { borderBottomWidth: 0.75, borderBottomColor: '#374151', width: 260, marginTop: 36, marginBottom: 4 },

  // ── Annexure I — salary table ──────────────────────────────────────────
  annexTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginBottom: 14 },
  tbl: { borderWidth: 0.75, borderColor: '#9ca3af', width: '100%' },
  tblSectionRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.75,
    borderBottomColor: '#9ca3af',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tblDataRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tblSubtotalRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.75,
    borderBottomColor: '#9ca3af',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tblTotalRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.75,
    borderBottomColor: '#9ca3af',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tblLastRow: {
    flexDirection: 'row' as const,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cName: { flex: 1, fontSize: 9, color: '#374151' },
  cRight: { width: 100, fontSize: 9, textAlign: 'right' as const, color: '#374151' },
  cNameBold: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  cRightBold: { width: 100, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const, color: '#1f2937' },

  // ── Dual signature block (last page) ──────────────────────────────────
  dualSigRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 40 },
  dualSigCol: { width: '45%' },
  dualSigLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 8 },
  dualSigPenName: { fontFamily: 'GreatVibes', fontSize: 20, color: '#1a1a2e', marginBottom: 4 },
  dualSigLine: { borderBottomWidth: 0.75, borderBottomColor: '#9ca3af', marginBottom: 6 },
  dualSigCompany: { fontSize: 10, color: '#374151', marginBottom: 2 },
  dualSigName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  dualSigTitle: { fontSize: 9, color: '#6b7280' },

  // ── Annexure II — terms ────────────────────────────────────────────────
  termsHead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },
  termsBody: { fontSize: 9.5, lineHeight: 1.6, marginBottom: 8, textAlign: 'justify' as const },
  noteItem: { flexDirection: 'row' as const, marginBottom: 3 },
  noteBullet: { width: 18, fontSize: 9.5 },
  noteText: { flex: 1, fontSize: 9.5, lineHeight: 1.5 },
})

// ---------------------------------------------------------------------------
// Header & Footer — plain normal-flow Views, no position:absolute, no fixed.
// Each PageWrapper section is its own <Page>, so every page naturally gets
// its own header/footer instance at the top and bottom of the flow.
// ---------------------------------------------------------------------------
function HeaderBar({
  logoUrl, companyName, phone, email, website, dividerColor,
}: {
  logoUrl?: string; companyName: string; phone?: string; email?: string; website?: string; dividerColor: string
}) {
  return (
    <View style={s.headerOuter}>
      <View style={s.header}>
        {/* Left: logo OR company name text */}
        {logoUrl
          ? <Image src={logoUrl} style={s.headerLogo} />
          : <Text style={s.headerCompanyText}>{companyName}</Text>
        }
        {/* Right: company name (when logo shown) + contact details */}
        <View style={s.headerContactBlock}>
          {logoUrl
            ? <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginBottom: 4 }}>{companyName}</Text>
            : null
          }
          {phone ? <View style={s.headerContactRow}><Dot color={dividerColor} /><Text style={s.headerContactText}>{phone}</Text></View> : null}
          {email ? <View style={s.headerContactRow}><Dot color={dividerColor} /><Text style={s.headerContactText}>{email}</Text></View> : null}
          {website ? <View style={s.headerContactRow}><Dot color={dividerColor} /><Text style={s.headerContactText}>{website}</Text></View> : null}
        </View>
      </View>
      <View style={[s.headerDivider, { backgroundColor: dividerColor }]} />
      <View style={s.headerGap} />
    </View>
  )
}

function FooterBar({
  address, footerText, dividerColor,
}: {
  address?: string; footerText?: string; dividerColor: string
}) {
  if (!address && !footerText) return null
  return (
    <View style={{ marginHorizontal: -48, marginTop: 'auto' }}>
      <View style={{ height: 2, backgroundColor: dividerColor }} />
      <View style={{ paddingHorizontal: 30, paddingVertical: 8, alignItems: 'center' as const }}>
        {address ? <Text style={{ fontSize: 7.5, color: '#6b7280', textAlign: 'center' as const }}>{address}</Text> : null}
        {footerText ? <Text style={{ fontSize: 7.5, color: '#9ca3af', textAlign: 'center' as const, marginTop: address ? 2 : 0 }}>{footerText}</Text> : null}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function OfferPDFDocument(props: OfferPDFProps) {
  const {
    candidateName, candidateEmail, jobTitle, department,
    businessUnit, employmentType, workType, location, reportingManager,
    salary, salaryCurrency, startDate, expiryDate, createdDate,
    salaryComponents, bonusComponents, pfApplicable, referenceNumber,
    templateLogoUrl, templateCompanyName, templateTerms,
    companyPhone, companyEmail, companyWebsite, companyAddress,
  } = props

  const primaryColor        = props.primaryColor   || OFFER_PDF_DEFAULTS.primary_color
  const rawAccentColor      = props.accentColor    || OFFER_PDF_DEFAULTS.accent_color
  const dividerColor        = rawAccentColor
  const signatoryLabel      = props.signatoryLabel || OFFER_PDF_DEFAULTS.signatory_label
  const showSalaryBreakdown  = props.showSalaryBreakdown  ?? true
  const showBonusSection     = props.showBonusSection     ?? true
  const showTermsSection     = props.showTermsSection     ?? true
  const showAcceptanceSection = props.showAcceptanceSection ?? true
  const showSignatureBlock   = props.showSignatureBlock   ?? true

  const companyName = templateCompanyName || props.companyName

  // Variable substitution map
  const vars: Record<string, string> = {
    candidate_name:    candidateName,
    candidate_email:   candidateEmail,
    job_title:         jobTitle,
    department,
    business_unit:     businessUnit     || '',
    location:          location         || '',
    salary,
    start_date:        startDate,
    expiry_date:       expiryDate,
    created_date:      createdDate,
    employment_type:   employmentType   || '',
    work_type:         workType         || '',
    reporting_manager: reportingManager || '',
    company_name:      companyName,
    signatory_name:    props.signatoryName?.includes('{{') ? '' : (props.signatoryName || ''),
    signatory_title:   props.signatoryTitle?.includes('{{') ? '' : (props.signatoryTitle || ''),
  }

  // Resolved texts
  const greetingText   = sub(props.greetingText   || OFFER_PDF_DEFAULTS.greeting_text,   vars)
  const introText      = sub(props.introText      || OFFER_PDF_DEFAULTS.intro_text,      vars)
  const closingText    = sub(props.closingText    || OFFER_PDF_DEFAULTS.closing_text,    vars)
  const validityText   = sub(props.validityText   || OFFER_PDF_DEFAULTS.validity_text,   vars)
  // acceptanceText available via props.acceptanceText if needed
  // Signatory — clean resolved name (no unsubstituted placeholders)
  const resolvedSignatoryName  = stripPlaceholders(vars.signatory_name)
  const resolvedSignatoryTitle = stripPlaceholders(vars.signatory_title)

  // Salary breakdown
  const earnings   = salaryComponents?.filter((c) => !c.section || c.section === 'earnings') ?? []
  const deductions = salaryComponents?.filter((c) => c.section === 'deduction')              ?? []
  const employer   = salaryComponents?.filter((c) => c.section === 'employer')               ?? []

  const earningsMonthly = earnings.reduce((acc, c) => acc + c.monthly, 0)
  const earningsAnnual  = earnings.reduce((acc, c) => acc + c.annual,  0)
  const employerMonthly = employer.reduce((acc, c) => acc + c.monthly, 0)
  const employerAnnual  = employer.reduce((acc, c) => acc + c.annual,  0)
  const deductMonthly   = deductions.reduce((acc, c) => acc + c.monthly, 0)
  const deductAnnual    = deductions.reduce((acc, c) => acc + c.annual,  0)
  const ctcMonthly      = earningsMonthly + employerMonthly
  const ctcAnnual       = earningsAnnual  + employerAnnual
  const takeHomeMonthly = ctcMonthly - deductMonthly
  const takeHomeAnnual  = ctcAnnual  - deductAnnual

  const hasSalaryBreakdown = showSalaryBreakdown && salaryComponents && salaryComponents.length > 0
  const termsContent = templateTerms || OFFER_PDF_DEFAULTS.terms_and_conditions
  const hasTerms = showTermsSection && !!termsContent

  // Determine which section is last so the acceptance + dual signature block goes there
  const lastSection = hasTerms ? 'terms' : hasSalaryBreakdown ? 'salary' : 'body'

  // Footer text — substitute variables like {{company_name}}
  const footerText = props.footerText ? sub(props.footerText, vars) : undefined

  // Shared header/footer props
  const headerProps = {
    logoUrl:      templateLogoUrl,
    companyName,
    phone:        companyPhone,
    email:        companyEmail,
    website:      companyWebsite,
    dividerColor,
  }
  const footerProps = {
    address: companyAddress ? sub(companyAddress, vars) : undefined,
    footerText,
    dividerColor,
  }
  // unused — kept for type safety
  void primaryColor
  void referenceNumber

  // ── Page wrapper: each section lives in its own <Page> ──────────────────
  // This eliminates empty pages caused by <View break> interacting with
  // natural page overflow. Fixed header/footer repeat on every overflow page
  // within each <Page> element.

  const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <Page size="A4" style={s.page}>
      <HeaderBar {...headerProps} />
      {children}
      <FooterBar {...footerProps} />
    </Page>
  )

  // Acceptance + dual signature block — placed on the last page
  const acceptanceAndSigBlock = (
    <View>
      {/* Acceptance confirmation lines */}
      {showAcceptanceSection && (
        <View style={{ marginTop: 24 }}>
          <Text style={[s.acceptBody, { fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginBottom: 10 }]}>
            ACCEPTANCE CONFIRMATION
          </Text>
          <FormattedPara
            text={`I, **${candidateName}**, have read all the documents and understood all the Rules & Regulations of the company and hereby accept this employment offer.`}
            style={s.acceptBody}
          />
          <FormattedPara
            text={`Joining Date: **${startDate}**`}
            style={[s.acceptBody, { marginBottom: 0 }]}
          />
        </View>
      )}
      {/* Dual signature block — labels row */}
      <View style={[s.dualSigRow, { marginBottom: 0 }]}>
        <View style={s.dualSigCol}>
          <Text style={s.dualSigLabel}>For {companyName}</Text>
        </View>
        <View style={s.dualSigCol}>
          <Text style={s.dualSigLabel}>Acceptance by Candidate</Text>
        </View>
      </View>
      {/* Signatures row — aligned side by side */}
      <View style={[s.dualSigRow, { marginTop: 0 }]}>
        <View style={s.dualSigCol}>
          {resolvedSignatoryName ? <Text style={s.dualSigPenName}>{resolvedSignatoryName}</Text> : null}
          <View style={s.dualSigLine} />
          {resolvedSignatoryName ? <Text style={s.dualSigName}>{resolvedSignatoryName}</Text> : null}
          {resolvedSignatoryTitle ? <Text style={s.dualSigTitle}>{resolvedSignatoryTitle}</Text> : null}
        </View>
        <View style={s.dualSigCol}>
          {/* Space for candidate to sign */}
          <View style={{ height: 30 }} />
          <View style={s.dualSigLine} />
          <Text style={s.dualSigName}>{candidateName}</Text>
          <Text style={s.dualSigTitle}>Date: _______________</Text>
        </View>
      </View>
    </View>
  )

  return (
    <Document>

      {/* ================================================================ */}
      {/* PAGE 1+ — Offer Letter body                                      */}
      {/* ================================================================ */}
      <PageWrapper>
        {/* Title */}
        <Text style={s.docTitle}>Offer Letter</Text>

        {/* Date */}
        <Text style={s.dateText}>Date: {createdDate}</Text>

        {/* Greeting */}
        <FormattedPara text={greetingText} style={s.greetText} />

        {/* Body paragraphs */}
        {introText.split('\n').map((para, i) => {
          const trimmed = para.trim()
          if (!trimmed) return null
          return <FormattedPara key={`p-${i}`} text={trimmed} style={s.body} />
        })}

        {/* Reporting Manager — explicit mention */}
        {reportingManager ? (
          <FormattedPara text={`Your Reporting Manager will be **${reportingManager}**.`} style={[s.body, { marginTop: 4 }]} />
        ) : null}

        {/* Closing */}
        {closingText ? (
          <FormattedPara text={closingText} style={[s.body, { marginTop: 4 }]} />
        ) : null}

        {/* Validity */}
        {validityText ? (
          <FormattedPara text={validityText} style={s.body} />
        ) : null}

        {/* HR Signature — right aligned on page 1 */}
        {showSignatureBlock && (
          <View style={{ alignItems: 'flex-end', marginTop: 28 }}>
            <View style={{ width: 200 }}>
              <Text style={s.sigFor}>For, {companyName}</Text>
              {resolvedSignatoryName ? <Text style={s.sigPenName}>{resolvedSignatoryName}</Text> : null}
              <View style={s.sigLineRule} />
              {resolvedSignatoryName ? <Text style={s.sigName}>{resolvedSignatoryName}</Text> : null}
              {resolvedSignatoryTitle ? <Text style={s.sigRole}>{resolvedSignatoryTitle}</Text> : null}
              <Text style={s.sigRole}>{signatoryLabel}</Text>
            </View>
          </View>
        )}

        {lastSection === 'body' && acceptanceAndSigBlock}
      </PageWrapper>

      {/* ================================================================ */}
      {/* PAGE — ANNEXURE I: Salary Breakdown                              */}
      {/* ================================================================ */}
      {hasSalaryBreakdown && (
        <PageWrapper>
          <Text style={s.annexTitle}>ANNEXURE I</Text>

          <View style={s.tbl}>
            {/* EARNINGS section */}
            {earnings.length > 0 && (
              <>
                <View style={s.tblSectionRow}>
                  <Text style={s.cNameBold}>EARNINGS</Text>
                  <Text style={s.cRightBold}>MONTHLY</Text>
                  <Text style={s.cRightBold}>YEARLY</Text>
                </View>
                {earnings.map((comp, i) => (
                  <View key={`e-${i}`} style={s.tblDataRow}>
                    <Text style={s.cName}>{comp.name}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.monthly)}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.annual)}</Text>
                  </View>
                ))}
                <View style={s.tblSubtotalRow}>
                  <Text style={s.cNameBold}>SUB-TOTAL (A)</Text>
                  <Text style={s.cRightBold}>{fmtNum(earningsMonthly)}</Text>
                  <Text style={s.cRightBold}>{fmtNum(earningsAnnual)}</Text>
                </View>
              </>
            )}

            {/* BENEFITS AND CONTRIBUTIONS (PART - B) */}
            {employer.length > 0 && (
              <>
                <View style={s.tblSectionRow}>
                  <Text style={s.cNameBold}>BENEFITS AND CONTRIBUTIONS{'\n'}(PART - B)</Text>
                  <Text style={s.cRightBold}>{''}</Text>
                  <Text style={s.cRightBold}>{''}</Text>
                </View>
                {employer.map((comp, i) => (
                  <View key={`em-${i}`} style={s.tblDataRow}>
                    <Text style={s.cName}>{comp.name}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.monthly)}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.annual)}</Text>
                  </View>
                ))}
                <View style={s.tblSubtotalRow}>
                  <Text style={s.cNameBold}>SUB-TOTAL (B)</Text>
                  <Text style={s.cRightBold}>{fmtNum(employerMonthly)}</Text>
                  <Text style={s.cRightBold}>{fmtNum(employerAnnual)}</Text>
                </View>
              </>
            )}

            {/* TOTAL (A + B) */}
            <View style={s.tblTotalRow}>
              <Text style={s.cNameBold}>TOTAL (A + B)</Text>
              <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(ctcMonthly)}</Text>
              <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(ctcAnnual)}</Text>
            </View>

            {/* DEDUCTIONS */}
            {deductions.length > 0 && (
              <>
                <View style={s.tblSectionRow}>
                  <Text style={s.cNameBold}>DEDUCTIONS</Text>
                  <Text style={s.cRightBold}>MONTHLY</Text>
                  <Text style={s.cRightBold}>YEARLY</Text>
                </View>
                {deductions.map((comp, i) => (
                  <View key={`d-${i}`} style={s.tblDataRow}>
                    <Text style={s.cName}>{comp.name}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.monthly)}</Text>
                    <Text style={s.cRight}>{fmtNum(comp.annual)}</Text>
                  </View>
                ))}
                <View style={s.tblSubtotalRow}>
                  <Text style={s.cNameBold}>TOTAL DEDUCTIONS (C)</Text>
                  <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(deductMonthly)}</Text>
                  <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(deductAnnual)}</Text>
                </View>
                <View style={s.tblLastRow}>
                  <Text style={s.cNameBold}>TOTAL (A-C)</Text>
                  <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(takeHomeMonthly)}</Text>
                  <Text style={s.cRightBold}>{salaryCurrency} {fmtNum(takeHomeAnnual)}</Text>
                </View>
              </>
            )}
          </View>

          {/* Bonus components */}
          {showBonusSection && bonusComponents && bonusComponents.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[s.annexTitle, { fontSize: 10, marginBottom: 8, textDecoration: 'underline' }]}>
                Bonus Components
              </Text>
              {bonusComponents.map((b, i) => (
                <Text key={i} style={s.body}>
                  {b.name}: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{salaryCurrency} {fmtNum(b.amount)}</Text> ({b.frequency})
                </Text>
              ))}
            </View>
          )}

          {pfApplicable && (
            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 10 }}>
              * PF deducted at 12% of Basic. Gratuity at 4.81% of Basic per Payment of Gratuity Act, 1972.
            </Text>
          )}
          {lastSection === 'salary' && acceptanceAndSigBlock}
        </PageWrapper>
      )}

      {/* ================================================================ */}
      {/* PAGE — ANNEXURE II: Terms & Notes                                */}
      {/* ================================================================ */}
      {hasTerms && (
        <PageWrapper>
          <Text style={s.annexTitle}>ANNEXURE II</Text>

          {termsContent.split('\n').map((line, i) => {
            const trimmed = sub(line.trim(), vars)
            if (!trimmed) return <View key={i} style={{ height: 5 }} />

            // Numbered list items (e.g. "1. foo")
            const numbered = trimmed.match(/^(\d+)\.\s+(.+)/)
            if (numbered) {
              return (
                <View key={i} style={s.noteItem}>
                  <Text style={s.noteBullet}>{numbered[1]}.</Text>
                  <FormattedPara text={numbered[2]} style={s.noteText} />
                </View>
              )
            }

            // Section headings (short line ending with ":")
            if (trimmed.endsWith(':') && trimmed.length < 60) {
              return <Text key={i} style={s.termsHead}>{trimmed}</Text>
            }

            return <FormattedPara key={i} text={trimmed} style={s.termsBody} />
          })}
          {lastSection === 'terms' && acceptanceAndSigBlock}
        </PageWrapper>
      )}

    </Document>
  )
}
