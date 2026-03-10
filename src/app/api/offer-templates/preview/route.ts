import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPDFDocument } from '@/components/offers/offer-pdf-document'
import React from 'react'
import { SALARY_STRUCTURE_CONFIG } from '@/lib/constants'
import { resolveLogoForPdf } from '@/lib/utils/logo-converter'

// Sample data for template preview — realistic Indian offer letter
const SAMPLE = {
  candidateName: 'Rahul Mehta',
  candidateEmail: 'rahul.mehta@email.com',
  jobTitle: 'Senior Software Engineer',
  department: 'Engineering',
  businessUnit: 'Product Development',
  employmentType: 'full_time',
  workType: 'hybrid',
  location: 'Bengaluru, Karnataka',
  reportingManager: 'Amit Verma',
  salaryCurrency: 'INR',
  startDate: 'April 1, 2026',
  expiryDate: 'March 15, 2026',
  createdDate: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
  ctc: 1800000, // 18 LPA
}

function buildSampleSalaryComponents(ctc: number) {
  const cfg = SALARY_STRUCTURE_CONFIG
  const basic = Math.round(ctc * cfg.basicPctOfCtc / 100)
  const hra = Math.round(basic * cfg.hraPctOfBasic / 100)
  const lta = Math.round(ctc * cfg.ltaPctOfCtc / 100)
  const uniform = cfg.uniformMonthly * 12
  const bonusAllowance = Math.round(basic * cfg.bonusAllowancePctOfBasic / 100)
  const flexiPay = Math.round(ctc * cfg.flexiPayPctOfCtc / 100)
  const gratuity = Math.round(basic * cfg.gratuityPctOfBasic / 100)
  const employeePf = Math.round(basic * cfg.employeePfPctOfBasic / 100)
  const employerPf = Math.round(basic * cfg.employerPfPctOfBasic / 100)
  const profTax = cfg.professionalTaxAnnual
  const specialAllowance = ctc - basic - hra - lta - uniform - bonusAllowance - flexiPay - gratuity - employerPf

  return [
    { name: 'Basic Salary', monthly: Math.round(basic / 12), annual: basic, section: 'earnings' },
    { name: 'House Rent Allowance (HRA)', monthly: Math.round(hra / 12), annual: hra, section: 'earnings' },
    { name: 'Leave Travel Allowance (LTA)', monthly: Math.round(lta / 12), annual: lta, section: 'earnings' },
    { name: 'Uniform Allowance', monthly: cfg.uniformMonthly, annual: uniform, section: 'earnings' },
    { name: 'Bonus Allowance', monthly: Math.round(bonusAllowance / 12), annual: bonusAllowance, section: 'earnings' },
    { name: 'Flexi Pay', monthly: Math.round(flexiPay / 12), annual: flexiPay, section: 'earnings' },
    { name: 'Special Allowance', monthly: Math.round(specialAllowance / 12), annual: specialAllowance, section: 'earnings' },
    { name: 'Employee PF (12% of Basic)', monthly: Math.round(employeePf / 12), annual: employeePf, section: 'deduction' },
    { name: 'Professional Tax', monthly: 200, annual: profTax, section: 'deduction' },
    { name: 'Gratuity (4.81% of Basic)', monthly: Math.round(gratuity / 12), annual: gratuity, section: 'employer' },
    { name: 'Employer PF (12% of Basic)', monthly: Math.round(employerPf / 12), annual: employerPf, section: 'employer' },
  ]
}

// Generate a PDF preview using template form data + sample candidate/job info
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const salary = `Rs. ${new Intl.NumberFormat('en-IN').format(SAMPLE.ctc)}`
    const salaryComponents = buildSampleSalaryComponents(SAMPLE.ctc)
    const bonusComponents = [
      { name: 'Performance Bonus', amount: 150000, frequency: 'Annual' },
      { name: 'Joining Bonus', amount: 50000, frequency: 'One-time' },
    ]

    // Resolve logo URL (converts SVG to PNG if needed)
    const resolvedLogo = body.logo_url ? await resolveLogoForPdf(body.logo_url) : undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(OfferPDFDocument, {
      companyName: body.company_name || 'Company',
      candidateName: SAMPLE.candidateName,
      candidateEmail: SAMPLE.candidateEmail,
      jobTitle: SAMPLE.jobTitle,
      department: SAMPLE.department,
      businessUnit: SAMPLE.businessUnit,
      employmentType: SAMPLE.employmentType,
      workType: SAMPLE.workType,
      location: SAMPLE.location,
      reportingManager: SAMPLE.reportingManager,
      salary,
      salaryCurrency: SAMPLE.salaryCurrency,
      startDate: SAMPLE.startDate,
      expiryDate: SAMPLE.expiryDate,
      createdDate: SAMPLE.createdDate,
      salaryComponents: body.show_salary_breakdown !== false ? salaryComponents : undefined,
      bonusComponents: body.show_bonus_section !== false ? bonusComponents : undefined,
      pfApplicable: true,
      templateLogoUrl: resolvedLogo,
      templateCompanyName: body.company_name || undefined,
      templateTerms: body.terms_and_conditions || undefined,
      primaryColor: body.primary_color || undefined,
      accentColor: body.accent_color || undefined,
      greetingText: body.greeting_text || undefined,
      introText: body.intro_text || undefined,
      closingText: body.closing_text || undefined,
      validityText: body.validity_text || undefined,
      acceptanceText: body.acceptance_text || undefined,
      signatoryName: body.signatory_name || undefined,
      signatoryTitle: body.signatory_title || undefined,
      signatoryLabel: body.signatory_label || undefined,
      candidateSigLabel: body.candidate_sig_label || undefined,
      showSalaryBreakdown: body.show_salary_breakdown ?? true,
      showBonusSection: body.show_bonus_section ?? true,
      showTermsSection: body.show_terms_section ?? true,
      showAcceptanceSection: body.show_acceptance_section ?? true,
      showSignatureBlock: body.show_signature_block ?? true,
      footerText: body.footer_text || undefined,
      companyPhone:   body.company_phone   || undefined,
      companyEmail:   body.company_email   || undefined,
      companyWebsite: body.company_website || undefined,
      companyAddress: body.company_address || undefined,
    }) as any

    const buffer = await renderToBuffer(pdfElement)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="template-preview.pdf"',
      },
    })
  } catch (err) {
    console.error('[Template Preview Error]', err)
    const message = err instanceof Error ? err.message : 'Failed to generate preview'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
