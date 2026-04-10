import { substitutePlaceholders } from '@/lib/docx-parser'

// Sample data used for placeholder substitution in previews.
export const SAMPLE_DATA: Record<string, unknown> = {
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
  BasicInfo: {
    FirstName: 'Priya',
    LastName: 'Sharma',
    FullName: 'Priya Sharma',
    Email: 'priya.sharma@example.com',
    Phone: '+91 98765 43210',
    DateOfBirth: '12 March 1998',
    Address: '42, MG Road, Bengaluru 560001',
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

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
  header: number
  footer: number
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildPreviewHtml(opts: {
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

  const hasPageBackground = Boolean(pageBackgroundUrl)
  const m = pageMargins || { top: 25, bottom: 25, left: 20, right: 20, header: 12, footer: 12 }
  const pageBgStyle = ''

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
  .page-section {
    position: relative;
    border-bottom: 2px dashed #94a3b8;
    margin-bottom: 16px;
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
  .page span[style] { display: inline; }
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
      <div class="page-section">
        <div class="page-header${headerHtml ? ' has-content' : ''}" data-role="header">${headerHtml}</div>
        <div class="page-body" data-role="body">${bodyHtml}</div>
        <div class="page-footer${footerHtml ? ' has-content' : ''}" data-role="footer">${footerHtml}</div>
      </div>
    </div>
  </div>
  <script>
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

        var pageW = page.offsetWidth;
        var pageHeightPx = pageW > 0 ? Math.round(pageW * (297 / 210)) : mmToPx(297);
        if (!pageHeightPx) return;

        seed.style.height = pageHeightPx + 'px';
        seed.style.minHeight = pageHeightPx + 'px';

        var contentPerPage = seedBody.offsetHeight;
        if (contentPerPage < 100) contentPerPage = pageHeightPx - 200;

        var children = Array.from(seedBody.children);
        var measured = children.map(function (c) {
          return {
            el: c,
            h: childOuterHeight(c),
            forceBreak: c.classList && c.classList.contains('hireflow-page-break'),
          };
        });

        var pages = [[]];
        var cumH = 0;
        measured.forEach(function (m) {
          if (m.forceBreak) {
            if (pages[pages.length - 1].length > 0) pages.push([]);
            cumH = 0;
            pages[pages.length - 1].push(m.el);
            cumH += m.h;
            return;
          }
          if (m.h > contentPerPage) {
            if (pages[pages.length - 1].length > 0) pages.push([]);
            pages[pages.length - 1].push(m.el);
            pages.push([]);
            cumH = 0;
            return;
          }
          if (cumH + m.h > contentPerPage && pages[pages.length - 1].length > 0) {
            pages.push([]);
            cumH = 0;
          }
          pages[pages.length - 1].push(m.el);
          cumH += m.h;
        });
        if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();

        var totalPages = pages.length;

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
