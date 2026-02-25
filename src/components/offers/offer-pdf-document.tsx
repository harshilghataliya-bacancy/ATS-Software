import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

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
  salary: string // formatted string e.g. "INR 12,00,000"
  salaryCurrency: string
  startDate: string
  expiryDate: string
  createdDate: string
  salaryComponents?: SalaryComponent[]
  bonusComponents?: BonusComponent[]
  pfApplicable?: boolean
  referenceNumber?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtNum(n: number): string {
  return n.toLocaleString('en-IN')
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const c = {
  primary: '#1e3a5f',
  accent: '#2563eb',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  border: '#d1d5db',
  white: '#ffffff',
  sectionBg: '#f0f4ff',
  earningsBg: '#f0fdf4',
  deductionBg: '#fef2f2',
  employerBg: '#eff6ff',
  totalBg: '#1e3a5f',
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', lineHeight: 1.5 },

  // Header
  headerBar: { backgroundColor: c.primary, padding: 20, marginHorizontal: -50, marginTop: -50, marginBottom: 20 },
  companyName: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: c.white, letterSpacing: 1 },
  headerSub: { fontSize: 9, color: '#94a3b8', marginTop: 2 },

  // Meta row (date + ref)
  metaRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: 16 },
  metaText: { fontSize: 9, color: c.gray },

  // Title
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: c.primary, textAlign: 'center' as const, marginBottom: 20, textTransform: 'uppercase' as const, letterSpacing: 2 },

  // Candidate block
  candBlock: { marginBottom: 16 },
  candName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  candEmail: { fontSize: 9, color: c.gray },

  // Section heading
  sectionHead: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.primary, marginTop: 18, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.accent, paddingBottom: 4 },

  // Body text
  body: { fontSize: 10, lineHeight: 1.6, marginBottom: 8 },
  bodyBold: { fontSize: 10, fontFamily: 'Helvetica-Bold' },

  // Detail table (key-value pairs)
  detailTable: { marginBottom: 12 },
  detailRow: { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 5 },
  detailLabel: { width: '40%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.gray },
  detailValue: { width: '60%', fontSize: 10 },

  // Salary table
  salaryTable: { marginTop: 8, marginBottom: 12, borderWidth: 0.5, borderColor: c.border },
  salaryHeaderRow: { flexDirection: 'row' as const, backgroundColor: c.primary, paddingVertical: 6, paddingHorizontal: 8 },
  salaryHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.white, textTransform: 'uppercase' as const },
  salarySectionRow: { flexDirection: 'row' as const, paddingVertical: 4, paddingHorizontal: 8 },
  salarySectionLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  salaryRow: { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 4, paddingHorizontal: 8 },
  salaryCell: { fontSize: 9 },
  salaryCellRight: { fontSize: 9, textAlign: 'right' as const },
  salaryTotalRow: { flexDirection: 'row' as const, paddingVertical: 6, paddingHorizontal: 8 },
  salaryTotalCell: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  salaryTotalRight: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const },

  // Terms
  termItem: { flexDirection: 'row' as const, marginBottom: 4 },
  bullet: { width: 14, fontSize: 10 },
  termText: { flex: 1, fontSize: 9, lineHeight: 1.5 },

  // Signature block
  sigBlock: { marginTop: 30 },
  sigRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 10 },
  sigCol: { width: '45%' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 4, marginTop: 40 },
  sigLabel: { fontSize: 9, color: c.gray },
  sigName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  // Footer
  footer: { position: 'absolute' as const, bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 8, flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function OfferPDFDocument(props: OfferPDFProps) {
  const {
    companyName, candidateName, candidateEmail, jobTitle, department,
    businessUnit, employmentType, workType, location, reportingManager,
    salary, salaryCurrency, startDate, expiryDate, createdDate,
    salaryComponents, bonusComponents, pfApplicable, referenceNumber,
  } = props

  const refNo = referenceNumber || `OL-${Date.now().toString(36).toUpperCase()}`

  // Salary breakdown
  const earnings = salaryComponents?.filter((c) => !c.section || c.section === 'earnings') ?? []
  const deductions = salaryComponents?.filter((c) => c.section === 'deduction') ?? []
  const employer = salaryComponents?.filter((c) => c.section === 'employer') ?? []
  const grossAnnual = earnings.reduce((s, c) => s + c.annual, 0)
  const grossMonthly = earnings.reduce((s, c) => s + c.monthly, 0)
  const deductAnnual = deductions.reduce((s, c) => s + c.annual, 0)
  const deductMonthly = deductions.reduce((s, c) => s + c.monthly, 0)
  const netAnnual = grossAnnual - deductAnnual
  const netMonthly = grossMonthly - deductMonthly
  const employerAnnual = employer.reduce((s, c) => s + c.annual, 0)
  const employerMonthly = employer.reduce((s, c) => s + c.monthly, 0)
  const ctcAnnual = grossAnnual + employerAnnual
  const ctcMonthly = grossMonthly + employerMonthly

  const hasSalaryBreakdown = salaryComponents && salaryComponents.length > 0

  const empTypeLabel = employmentType?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Full Time'
  const workTypeLabel = workType?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || ''

  return (
    <Document>
      {/* ================================================================ */}
      {/* PAGE 1 — Cover + Position Details                               */}
      {/* ================================================================ */}
      <Page size="A4" style={s.page}>
        {/* Company Header */}
        <View style={s.headerBar}>
          <Text style={s.companyName}>{companyName}</Text>
          <Text style={s.headerSub}>Confidential</Text>
        </View>

        {/* Date + Ref */}
        <View style={s.metaRow}>
          <Text style={s.metaText}>Date: {createdDate}</Text>
          <Text style={s.metaText}>Ref: {refNo}</Text>
        </View>

        {/* Title */}
        <Text style={s.title}>Offer of Employment</Text>

        {/* Candidate */}
        <View style={s.candBlock}>
          <Text style={s.candName}>{candidateName}</Text>
          <Text style={s.candEmail}>{candidateEmail}</Text>
        </View>

        {/* Greeting */}
        <Text style={s.body}>Dear {candidateName},</Text>
        <Text style={s.body}>
          We are pleased to inform you that you have been selected for the position of{' '}
          <Text style={s.bodyBold}>{jobTitle}</Text> at <Text style={s.bodyBold}>{companyName}</Text>.
          Based on your qualifications, experience, and performance during the interview process,
          we believe you will be a valuable addition to our team.
        </Text>
        <Text style={s.body}>
          We are delighted to present you with the following terms and conditions of your employment:
        </Text>

        {/* Position Details */}
        <Text style={s.sectionHead}>Position Details</Text>
        <View style={s.detailTable}>
          <DetailRow label="Designation" value={jobTitle} />
          <DetailRow label="Department" value={department} />
          {businessUnit ? <DetailRow label="Business Unit" value={businessUnit} /> : null}
          <DetailRow label="Employment Type" value={empTypeLabel} />
          {workTypeLabel ? <DetailRow label="Work Type" value={workTypeLabel} /> : null}
          {location ? <DetailRow label="Place of Posting" value={location} /> : null}
          {reportingManager ? <DetailRow label="Reporting Manager" value={reportingManager} /> : null}
          <DetailRow label="Date of Joining" value={startDate} />
          <DetailRow label="Annual CTC" value={salary} />
        </View>

        {!hasSalaryBreakdown && (
          <Text style={s.body}>
            Your total annual compensation (Cost to Company) will be <Text style={s.bodyBold}>{salary}</Text>.
          </Text>
        )}

        {hasSalaryBreakdown && (
          <Text style={s.body}>
            Your total annual compensation (Cost to Company) will be <Text style={s.bodyBold}>{salary}</Text>.
            The detailed salary breakdown is provided on the following page.
          </Text>
        )}

        <Footer companyName={companyName} page={1} />
      </Page>

      {/* ================================================================ */}
      {/* PAGE 2 — Salary Structure (only if components exist)            */}
      {/* ================================================================ */}
      {hasSalaryBreakdown && (
        <Page size="A4" style={s.page}>
          <View style={s.headerBar}>
            <Text style={s.companyName}>{companyName}</Text>
            <Text style={s.headerSub}>Compensation Details — {candidateName}</Text>
          </View>

          <Text style={s.sectionHead}>Salary Structure ({salaryCurrency})</Text>

          <View style={s.salaryTable}>
            {/* Header */}
            <View style={s.salaryHeaderRow}>
              <View style={{ width: '46%' }}><Text style={s.salaryHeaderCell}>Component</Text></View>
              <View style={{ width: '27%' }}><Text style={{ ...s.salaryHeaderCell, textAlign: 'right' as const }}>Monthly</Text></View>
              <View style={{ width: '27%' }}><Text style={{ ...s.salaryHeaderCell, textAlign: 'right' as const }}>Annual</Text></View>
            </View>

            {/* Earnings */}
            {earnings.length > 0 && (
              <>
                <View style={{ ...s.salarySectionRow, backgroundColor: c.earningsBg }}>
                  <Text style={{ ...s.salarySectionLabel, color: '#166534' }}>A. Earnings</Text>
                </View>
                {earnings.map((comp, i) => (
                  <View key={`e-${i}`} style={s.salaryRow}>
                    <View style={{ width: '46%' }}><Text style={s.salaryCell}>   {comp.name}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.monthly)}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.annual)}</Text></View>
                  </View>
                ))}
                <View style={{ ...s.salaryTotalRow, backgroundColor: '#dcfce7' }}>
                  <View style={{ width: '46%' }}><Text style={s.salaryTotalCell}>Gross Salary</Text></View>
                  <View style={{ width: '27%' }}><Text style={s.salaryTotalRight}>{fmtNum(grossMonthly)}</Text></View>
                  <View style={{ width: '27%' }}><Text style={s.salaryTotalRight}>{fmtNum(grossAnnual)}</Text></View>
                </View>
              </>
            )}

            {/* Deductions */}
            {deductions.length > 0 && (
              <>
                <View style={{ ...s.salarySectionRow, backgroundColor: c.deductionBg }}>
                  <Text style={{ ...s.salarySectionLabel, color: '#991b1b' }}>B. Deductions (from Gross)</Text>
                </View>
                {deductions.map((comp, i) => (
                  <View key={`d-${i}`} style={s.salaryRow}>
                    <View style={{ width: '46%' }}><Text style={s.salaryCell}>   {comp.name}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.monthly)}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.annual)}</Text></View>
                  </View>
                ))}
                <View style={{ ...s.salaryTotalRow, backgroundColor: '#fef9c3' }}>
                  <View style={{ width: '46%' }}><Text style={s.salaryTotalCell}>Net Pay (Take Home)</Text></View>
                  <View style={{ width: '27%' }}><Text style={s.salaryTotalRight}>{fmtNum(netMonthly)}</Text></View>
                  <View style={{ width: '27%' }}><Text style={s.salaryTotalRight}>{fmtNum(netAnnual)}</Text></View>
                </View>
              </>
            )}

            {/* Employer Contributions */}
            {employer.length > 0 && (
              <>
                <View style={{ ...s.salarySectionRow, backgroundColor: c.employerBg }}>
                  <Text style={{ ...s.salarySectionLabel, color: '#1e40af' }}>C. Employer Contributions</Text>
                </View>
                {employer.map((comp, i) => (
                  <View key={`em-${i}`} style={s.salaryRow}>
                    <View style={{ width: '46%' }}><Text style={s.salaryCell}>   {comp.name}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.monthly)}</Text></View>
                    <View style={{ width: '27%' }}><Text style={s.salaryCellRight}>{fmtNum(comp.annual)}</Text></View>
                  </View>
                ))}
              </>
            )}

            {/* Total CTC */}
            <View style={{ ...s.salaryTotalRow, backgroundColor: c.totalBg }}>
              <View style={{ width: '46%' }}><Text style={{ ...s.salaryTotalCell, color: c.white }}>Total CTC (A + C)</Text></View>
              <View style={{ width: '27%' }}><Text style={{ ...s.salaryTotalRight, color: c.white }}>{fmtNum(ctcMonthly)}</Text></View>
              <View style={{ width: '27%' }}><Text style={{ ...s.salaryTotalRight, color: c.white }}>{fmtNum(ctcAnnual)}</Text></View>
            </View>
          </View>

          {/* PF note */}
          {pfApplicable && (
            <Text style={{ fontSize: 8, color: c.gray, marginBottom: 8 }}>
              * PF contributions are calculated at 12% of Basic Salary. Gratuity is calculated at 4.81% of Basic Salary as per the Payment of Gratuity Act, 1972.
            </Text>
          )}

          {/* Bonus */}
          {bonusComponents && bonusComponents.length > 0 && (
            <>
              <Text style={s.sectionHead}>Bonus Components</Text>
              <View style={s.detailTable}>
                {bonusComponents.map((b, i) => (
                  <DetailRow key={i} label={b.name} value={`${salaryCurrency} ${fmtNum(b.amount)} (${b.frequency})`} />
                ))}
              </View>
              <Text style={{ fontSize: 8, color: c.gray }}>
                * Bonus components are over and above the CTC mentioned above and are subject to applicable terms.
              </Text>
            </>
          )}

          <Footer companyName={companyName} page={2} />
        </Page>
      )}

      {/* ================================================================ */}
      {/* PAGE 3 — Terms & Conditions + Acceptance                        */}
      {/* ================================================================ */}
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <Text style={s.companyName}>{companyName}</Text>
          <Text style={s.headerSub}>Terms & Conditions — {candidateName}</Text>
        </View>

        <Text style={s.sectionHead}>Terms & Conditions</Text>

        <TermItem text={`Your employment will commence on ${startDate}. Failure to join on the agreed date may result in withdrawal of this offer.`} />
        <TermItem text="You will be on a probation period of six (6) months from the date of joining. During probation, either party may terminate employment with 15 days written notice." />
        <TermItem text="After confirmation, the notice period for resignation or termination will be 30 days (or as per company policy applicable at that time)." />
        <TermItem text="Your appointment is subject to satisfactory completion of background verification, medical fitness, and submission of all required documents. Any discrepancy may lead to termination of employment." />
        <TermItem text="You will be governed by the company's HR policies, code of conduct, and other applicable rules and regulations as amended from time to time." />
        <TermItem text="You shall maintain strict confidentiality of all proprietary information, trade secrets, and business strategies of the company during and after your employment." />
        <TermItem text="You shall not engage in any other employment, business, or consulting activity during the tenure of your employment without prior written consent." />
        <TermItem text={`Your compensation is confidential and should not be disclosed to any other employee or third party.`} />

        <Text style={s.sectionHead}>Offer Validity</Text>
        <Text style={s.body}>
          This offer is valid until <Text style={s.bodyBold}>{expiryDate}</Text>. If we do not receive your signed acceptance
          by this date, this offer shall stand withdrawn automatically.
        </Text>

        <Text style={s.sectionHead}>Acceptance</Text>
        <Text style={s.body}>
          Please sign below and return a copy of this letter to indicate your acceptance of
          the above terms and conditions. We look forward to welcoming you to the {companyName} team.
        </Text>

        {/* Signature blocks */}
        <View style={s.sigBlock}>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <Text style={{ fontSize: 9, color: c.gray, marginBottom: 2 }}>For {companyName}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Authorized Signatory</Text>
              <Text style={s.sigLabel}>Date: _______________</Text>
            </View>
            <View style={s.sigCol}>
              <Text style={{ fontSize: 9, color: c.gray, marginBottom: 2 }}>Acceptance by Candidate</Text>
              <View style={s.sigLine} />
              <Text style={s.sigName}>{candidateName}</Text>
              <Text style={s.sigLabel}>Date: _______________</Text>
            </View>
          </View>
        </View>

        <Footer companyName={companyName} page={hasSalaryBreakdown ? 3 : 2} />
      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  )
}

function TermItem({ text }: { text: string }) {
  return (
    <View style={s.termItem}>
      <Text style={s.bullet}>{'\u2022'}</Text>
      <Text style={s.termText}>{text}</Text>
    </View>
  )
}

function Footer({ companyName, page }: { companyName: string; page: number }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>This is a system-generated offer letter by {companyName}. Strictly Confidential.</Text>
      <Text style={s.footerText}>Page {page}</Text>
    </View>
  )
}
