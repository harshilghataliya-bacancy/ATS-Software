import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { substitutePlaceholders } from '@/lib/docx-parser'

// Sample data used for placeholder substitution in previews.
// Supports both flat ({{candidate_name}}) and dot-path ({{BasicInfo.FirstName}}).
const SAMPLE_DATA: Record<string, unknown> = {
  candidate_name: 'Priya Sharma',
  candidate_email: 'priya.sharma@example.com',
  job_title: 'Senior Software Engineer',
  department: 'Engineering',
  business_unit: 'Product',
  location: 'Bengaluru, India',
  salary: '₹ 18,00,000',
  start_date: '15 May 2026',
  expiry_date: '25 April 2026',
  employment_type: 'Full-time',
  work_type: 'Hybrid',
  reporting_manager: 'Rahul Verma',
  company_name: 'Acme Corporation Pvt. Ltd.',
  signatory_name: 'Priya Nair',
  signatory_title: 'Head of Human Resources',
  // Nested dot-path groups (for templates like {{BasicInfo.FirstName}})
  BasicInfo: {
    FirstName: 'Priya',
    LastName: 'Sharma',
    FullName: 'Priya Sharma',
    Email: 'priya.sharma@example.com',
    Phone: '+91 98765 43210',
    DateOfBirth: '12 March 1998',
    Address: '42, MG Road, Bengaluru 560001',
    // Offer specifics (used by BSPL-style templates)
    ShortDate: '10 April 2026',
    LongDate: '10 April 2026',
    JobTitle: 'Senior Software Engineer',
    Designation: 'Senior Software Engineer',
    Department: 'Engineering',
    Location: 'Ahmedabad',
    EmploymentType: 'Full-time',
    StartDate: '15 May 2026',
    DateJoining: '15 May 2026',
    DateJoiningExpected: '15 May 2026',
    AnnualSalary: '18,00,000',
    MonthlySalary: '1,50,000',
    FullSalaryStructure:
      '(A detailed salary structure table with Basic, HRA, LTA, Flexi Pay, Special Allowance, Bonus, Gratuity and deductions will be inserted here when generating the actual offer.)',
  },
  CustomAttributes: {
    ReportingManager: 'Rahul Verma',
    Designation: '(Engineering Manager)',
    RetentionBonus: '₹ 1,00,000',
    BusinessUnit: 'Product Engineering',
    WorkType: 'Work from Office',
    NoticePeriod: '60 days',
  },
  Signature: {
    // Rendered as a small HTML block so the signature shows on multiple lines
    // like a real signoff (signature above, name + title below). The cursive
    // font-family is loaded from Google Fonts in buildPreviewHtml.
    OrgSignature1:
      '<span style="display:inline-block;line-height:1.2;"><span style="font-family:\'Caveat\',\'Dancing Script\',cursive;font-size:22pt;color:#111827;">Priya Nair</span><br/><strong style="font-size:11pt;">Priya Nair</strong><br/><span style="color:#6b7280;font-size:10pt;">Head of Human Resources</span></span>',
    OrgSignature2:
      '<span style="display:inline-block;line-height:1.2;"><span style="font-family:\'Caveat\',\'Dancing Script\',cursive;font-size:22pt;color:#111827;">Rahul Verma</span><br/><strong style="font-size:11pt;">Rahul Verma</strong><br/><span style="color:#6b7280;font-size:10pt;">Engineering Manager</span></span>',
  },
  JobInfo: {
    Title: 'Senior Software Engineer',
    Department: 'Engineering',
    Location: 'Bengaluru, India',
    EmploymentType: 'Full-time',
    StartDate: '15 May 2026',
    ReportingManager: 'Rahul Verma',
  },
  CompensationInfo: {
    AnnualCTC: '₹ 18,00,000',
    MonthlyGross: '₹ 1,50,000',
    Currency: 'INR',
  },
  CompanyInfo: {
    Name: 'Acme Corporation Pvt. Ltd.',
    Address: 'Level 8, Prestige Tower, MG Road, Bengaluru 560001',
    Phone: '+91 80 4000 1234',
    Email: 'hr@acme.com',
    Website: 'www.acme.com',
  },
}

interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
  header: number
  footer: number
}

function buildPreviewHtml(opts: {
  name: string
  header: string | null
  body: string
  footer: string | null
  pageBackgroundUrl: string | null
  pageMargins: PageMargins | null
  embedded?: boolean
}): string {
  const { name, header, body, footer, pageBackgroundUrl, pageMargins, embedded } = opts

  const headerHtml = header ? substitutePlaceholders(header, SAMPLE_DATA) : ''
  const bodyHtml = substitutePlaceholders(body || '', SAMPLE_DATA)
  const footerHtml = footer ? substitutePlaceholders(footer, SAMPLE_DATA) : ''

  // When the preview is rendered in a letterhead background, the header/footer
  // are baked into the image so we don't need to show the inline header/footer.
  const hasPageBackground = Boolean(pageBackgroundUrl)

  // Use actual Word margins if available, otherwise sensible defaults
  const m = pageMargins || { top: 25, bottom: 25, left: 20, right: 20, header: 12, footer: 12 }

  // Tile the letterhead once per A4 page height so multi-page content still
  // displays the letterhead on each page.
  // Page background is applied per .page-section (not on .page) so each
  // page gets its own centered copy of the letterhead/watermark image.
  const pageBgStyle = ''

  // A4 page styling — matches the on-screen Word preview and prints cleanly.
  // Margins come from the actual Word file's section properties.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  @page {
    size: A4;
    margin: 0;
  }
  :root {
    --page-width: 210mm;
    --page-height: 297mm;
    --margin-top: ${m.top}mm;
    --margin-bottom: ${m.bottom}mm;
    --margin-left: ${m.left}mm;
    --margin-right: ${m.right}mm;
    --header-dist: ${m.header}mm;
    --footer-dist: ${m.footer}mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #e5e7eb;
    font-family: "Arial", "Helvetica Neue", Helvetica, sans-serif;
    font-size: 10pt;
    color: #1f2937;
    line-height: 1.15;
    overflow-x: hidden;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .toolbar h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }
  .toolbar .spacer { flex: 1; }
  .toolbar button {
    background: #111827;
    color: white;
    border: 0;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .toolbar button:hover { background: #1f2937; }
  .page-wrap {
    padding: 20px;
    display: flex;
    justify-content: center;
    min-height: 100vh;
  }
  .page {
    width: var(--page-width);
    background: white;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
    padding: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    ${pageBgStyle}
  }
  /* Each .page-section is one visual A4 page after client-side pagination.
     Uses absolute positioning to match Word's layout model where the body
     area is fixed between top-margin and bottom-margin, and header/footer
     can overlap into the margin areas without pushing content down. */
  .page-section {
    position: relative;
    border-bottom: 2px dashed #94a3b8;
    margin-bottom: 16px;
    /* Height set dynamically by JS to maintain A4 aspect ratio */
  }
  .page-section.has-page-bg {
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center center;
  }
  .page-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  .page-marker {
    position: absolute;
    right: 4mm;
    top: var(--margin-top);
    background: rgba(17,24,39,0.75);
    color: white;
    font-size: 8pt;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 9999px;
    z-index: 4;
    pointer-events: none;
  }
  .page-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 0;
    z-index: 1;
  }
  .page-header img {
    display: block;
    width: 100% !important;
    height: auto !important;
    max-width: none !important;
  }
  .page-body {
    position: absolute;
    top: var(--margin-top);
    bottom: var(--margin-bottom);
    left: var(--margin-left);
    right: var(--margin-right);
    overflow: hidden;
  }
  .page-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0;
    z-index: 1;
    font-size: 9pt;
    color: #6b7280;
  }
  .page-footer img {
    display: block;
    width: 100% !important;
    height: auto !important;
    max-width: none !important;
  }
  .page p { margin: 0 0 8pt; }
  /* Force consistent font size — override inline styles injected by docx parser */
  .page-body p, .page-body span, .page-body strong, .page-body em, .page-body u {
    font-size: 10pt !important;
  }
  .page-body h1, .page-body h2, .page-body h3, .page-body h4 {
    font-size: 13pt !important;
  }
  .page-header, .page-header span, .page-header p,
  .page-footer, .page-footer span, .page-footer p {
    font-size: 9pt !important;
  }
  .page h1, .page h2, .page h3, .page h4 {
    margin: 14pt 0 6pt;
    color: #111827;
  }
  .page ul, .page ol { margin: 0 0 8pt 20pt; }
  .page table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  .page td, .page th {
    border: 0.5pt solid #d1d5db;
    padding: 6pt 8pt;
    vertical-align: top;
    font-size: 10pt;
  }
  .page th {
    background-color: #f3f4f6;
    font-weight: 600;
    text-align: left;
  }
  .page tr:nth-child(even) td {
    background-color: #f9fafb;
  }
  .page img { max-width: 100%; height: auto; }
  /* Preserve inline styles from Word conversion */
  .page span[style] { display: inline; }
  /* Paragraphs tagged by the parser as explicit <w:br w:type="page"/>
     markers are invisible in Word — collapse them to zero height so they
     don't leave a blank line at the top of each new page. */
  .page p.hireflow-page-break {
    margin: 0;
    padding: 0;
    height: 0;
    line-height: 0;
    font-size: 0;
    overflow: hidden;
  }
  @media print {
    body { background: white; }
    .toolbar { display: none; }
    .page-wrap { padding: 0; }
    .page {
      box-shadow: none;
      width: 100%;
      min-height: auto;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  ${embedded ? '' : `<div class="toolbar">
    <h1>${escapeHtml(name)} — Preview</h1>
    <span class="spacer"></span>
    <button type="button" onclick="window.print()">Save as PDF / Print</button>
  </div>`}
  <div class="page-wrap">
    <div class="page${hasPageBackground ? ' has-bg' : ''}" ${hasPageBackground ? `data-page-bg="${pageBackgroundUrl}"` : ''}>
      <!-- A single seed section; the client script below will paginate this
           into one section per A4 page, cloning the header and footer onto
           every page so the layout matches how Word prints the document. -->
      <div class="page-section">
        <div class="page-header${headerHtml ? ' has-content' : ''}" data-role="header">${headerHtml}</div>
        <div class="page-body" data-role="body">${bodyHtml}</div>
        <div class="page-footer${footerHtml ? ' has-content' : ''}" data-role="footer">${footerHtml}</div>
      </div>
    </div>
  </div>
  <script>
    // Word-style pagination: measure header + footer, compute available body
    // area per A4 page, split body children across pages, clone header/footer
    // onto each page. overflow:hidden on .page-section prevents any overlap.
    (function () {
      function mmToPx(mm) {
        var probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.height = mm + 'mm';
        document.body.appendChild(probe);
        var px = probe.offsetHeight;
        document.body.removeChild(probe);
        return px;
      }
      function childOuterHeight(el) {
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return r.height + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0');
      }
      function paginate() {
        var page = document.querySelector('.page');
        if (!page || page.dataset.paginated === '1') return;

        var seed = page.querySelector('.page-section');
        if (!seed) return;
        var seedHeader = seed.querySelector('[data-role="header"]');
        var seedBody = seed.querySelector('[data-role="body"]');
        var seedFooter = seed.querySelector('[data-role="footer"]');
        if (!seedBody) return;

        var headerHtml = seedHeader ? seedHeader.innerHTML : '';
        var footerHtml = seedFooter ? seedFooter.innerHTML : '';
        var headerClass = seedHeader ? seedHeader.className : 'page-header';
        var footerClass = seedFooter ? seedFooter.className : 'page-footer';

        // Calculate page height from actual rendered width to maintain A4 ratio
        var pageW = page.offsetWidth;
        var pageHeightPx = pageW > 0 ? Math.round(pageW * (297 / 210)) : mmToPx(297);
        if (!pageHeightPx) return;

        // Set seed section height so body measurement is correct
        seed.style.height = pageHeightPx + 'px';
        seed.style.minHeight = pageHeightPx + 'px';

        // With absolute positioning, body height = page - top margin - bottom margin.
        // Measure the body element directly to get the actual available content height.
        var contentPerPage = seedBody.offsetHeight;
        if (contentPerPage < 100) contentPerPage = pageHeightPx - 200;

        // Snapshot body children and measure
        var children = Array.from(seedBody.children);
        var measured = children.map(function (c) {
          return {
            el: c,
            h: childOuterHeight(c),
            forceBreak: c.classList && c.classList.contains('hireflow-page-break'),
          };
        });

        // Group into pages using a hybrid approach:
        // - Explicit page breaks always force a new page
        // - Within each segment (between breaks), height-based splitting
        //   prevents content from overflowing
        var pages = [[]];
        var cumH = 0;
        measured.forEach(function (m) {
          if (m.forceBreak) {
            // Explicit break: start a new page
            if (pages[pages.length - 1].length > 0) pages.push([]);
            cumH = 0;
            pages[pages.length - 1].push(m.el);
            cumH += m.h;
            return;
          }
          if (m.h > contentPerPage) {
            // Oversized element: give it its own page
            if (pages[pages.length - 1].length > 0) pages.push([]);
            pages[pages.length - 1].push(m.el);
            pages.push([]);
            cumH = 0;
            return;
          }
          // Height-based splitting: start new page if adding this would overflow
          if (cumH + m.h > contentPerPage && pages[pages.length - 1].length > 0) {
            pages.push([]);
            cumH = 0;
          }
          pages[pages.length - 1].push(m.el);
          cumH += m.h;
        });
        if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();

        var totalPages = pages.length;

        // Rebuild the .page with one .page-section per page
        var pageBgUrl = page.dataset.pageBg || '';
        page.innerHTML = '';
        pages.forEach(function (group, i) {
          var section = document.createElement('div');
          section.className = 'page-section';
          section.style.height = pageHeightPx + 'px';
          section.style.minHeight = pageHeightPx + 'px';
          if (pageBgUrl) {
            section.classList.add('has-page-bg');
            section.style.backgroundImage = "url('" + pageBgUrl + "')";
          }

          var h = document.createElement('div');
          h.className = headerClass;
          h.innerHTML = headerHtml;
          section.appendChild(h);

          var body = document.createElement('div');
          body.className = 'page-body';
          group.forEach(function (el) { body.appendChild(el); });
          section.appendChild(body);

          var f = document.createElement('div');
          f.className = footerClass;
          f.innerHTML = footerHtml;
          section.appendChild(f);

          var marker = document.createElement('div');
          marker.className = 'page-marker';
          marker.textContent = 'Page ' + (i + 1) + ' of ' + totalPages;
          section.appendChild(marker);

          page.appendChild(section);
        });

        page.dataset.paginated = '1';
      }
      // Set each page-section height to maintain A4 aspect ratio (297/210)
      // based on the actual rendered width of the page element.
      function setA4Heights() {
        var page = document.querySelector('.page');
        if (!page) return;
        var pageW = page.offsetWidth;
        if (pageW <= 0) return;
        var a4Height = Math.round(pageW * (297 / 210));
        var sections = page.querySelectorAll('.page-section');
        for (var i = 0; i < sections.length; i++) {
          sections[i].style.height = a4Height + 'px';
          sections[i].style.minHeight = a4Height + 'px';
        }
      }

      function run() {
        paginate();
        setA4Heights();
      }
      if (document.readyState === 'complete') {
        run();
      } else {
        window.addEventListener('load', run);
      }
      window.addEventListener('resize', setA4Heights);
    })();
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name : 'Preview'
  const docxBody = typeof body.docx_content_html === 'string' ? body.docx_content_html : ''
  const header = typeof body.docx_header_html === 'string' ? body.docx_header_html : null
  const footer = typeof body.docx_footer_html === 'string' ? body.docx_footer_html : null
  const pageBackgroundUrl =
    typeof body.docx_page_background_url === 'string' ? body.docx_page_background_url : null
  const pageMargins = body.docx_page_margins && typeof body.docx_page_margins === 'object'
    ? body.docx_page_margins as PageMargins
    : null
  const embedded = body.embedded === true

  const html = buildPreviewHtml({
    name,
    header,
    body: docxBody,
    footer,
    pageBackgroundUrl,
    pageMargins,
    embedded,
  })

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
