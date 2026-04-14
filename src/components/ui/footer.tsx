'use client'

import React from 'react'
import {
  Briefcase,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'

interface FooterProps {
  brandName?: string
  primaryColor?: string
  accentColor?: string
}

const Footer: React.FC<FooterProps> = ({
  brandName,
  primaryColor = '#4f46e5',
  accentColor = '#7c3aed',
}) => {
  const name = brandName || 'HireFlow'

  return (
    <footer className="mt-auto">
      {/* Dark branded band */}
      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
      >
        {/* Subtle diagonal pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 8px,
              rgba(255,255,255,0.4) 8px,
              rgba(255,255,255,0.4) 9px
            )`,
          }}
        />
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold tracking-wide text-sm">
              {name}
            </span>
          </div>
          <p className="text-white/60 text-xs tracking-wider uppercase hidden sm:block">
            Building great teams, one hire at a time
          </p>
        </div>
      </div>

      {/* Warm content area */}
      <div className="bg-[#faf8f5] border-t border-[#ede8e0]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
            {/* Brand / About */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}18, ${accentColor}18)` }}
                >
                  <Briefcase className="w-4 h-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="font-bold text-[#2a2520] text-sm tracking-tight leading-none">
                    {name}
                  </p>
                  <p className="text-[10px] text-[#9c8e7e] tracking-widest uppercase mt-0.5">
                    Careers
                  </p>
                </div>
              </div>
              <p className="text-[#7a6e62] text-[13px] leading-relaxed mb-5">
                Discover exciting opportunities and join a team that values innovation, growth, and collaboration.
              </p>
              <div className="flex gap-2">
                {['facebook', 'twitter', 'linkedin', 'instagram'].map((platform) => (
                  <a
                    key={platform}
                    href="#"
                    className="w-8 h-8 rounded-md border border-[#e0d8ce] bg-white flex items-center justify-center text-[#a09488] hover:text-white transition-all duration-200 hover:border-transparent hover:scale-105"
                    style={{
                      ['--tw-shadow-color' as string]: `${primaryColor}30`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white'
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      {platform === 'facebook' && (
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      )}
                      {platform === 'twitter' && (
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      )}
                      {platform === 'linkedin' && (
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      )}
                      {platform === 'instagram' && (
                        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
                      )}
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Opportunities */}
            <div>
              <h4 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#6b5e52] mb-5 flex items-center gap-2">
                <span
                  className="w-5 h-px"
                  style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }}
                />
                Opportunities
              </h4>
              <ul className="space-y-2.5">
                {[
                  'Browse All Jobs',
                  'Engineering',
                  'Design & Product',
                  'Sales & Marketing',
                  'Operations',
                ].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="group flex items-center text-[13px] text-[#7a6e62] hover:text-[#2a2520] transition-colors duration-200"
                    >
                      <ChevronRight
                        className="w-3 h-3 mr-1.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                        style={{ color: primaryColor }}
                      />
                      <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                        {item}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#6b5e52] mb-5 flex items-center gap-2">
                <span
                  className="w-5 h-px"
                  style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }}
                />
                Navigation
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'Home', href: '#' },
                  { label: 'About Us', href: '#' },
                  { label: 'Our Culture', href: '#' },
                  { label: 'Benefits', href: '#' },
                  { label: 'Contact Us', href: '#' },
                ].map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="group flex items-center text-[13px] text-[#7a6e62] hover:text-[#2a2520] transition-colors duration-200"
                    >
                      <ChevronRight
                        className="w-3 h-3 mr-1.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                        style={{ color: primaryColor }}
                      />
                      <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                        {item.label}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#6b5e52] mb-5 flex items-center gap-2">
                <span
                  className="w-5 h-px"
                  style={{ background: `linear-gradient(to right, ${primaryColor}, ${accentColor})` }}
                />
                Get in Touch
              </h4>
              <ul className="space-y-3.5">
                <li className="flex items-start gap-2.5">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${primaryColor}10` }}
                  >
                    <MapPin className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                  </div>
                  <span className="text-[13px] text-[#7a6e62] leading-snug">
                    Ahmedabad, Gujarat<br />India
                  </span>
                </li>
                <li>
                  <a href="mailto:careers@company.com" className="flex items-center gap-2.5 group">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${primaryColor}10` }}
                    >
                      <Mail className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                    </div>
                    <span className="text-[13px] text-[#7a6e62] group-hover:text-[#2a2520] transition-colors flex items-center gap-1">
                      careers@company.com
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </span>
                  </a>
                </li>
                <li>
                  <a href="tel:+919737168423" className="flex items-center gap-2.5 group">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${primaryColor}10` }}
                    >
                      <Phone className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                    </div>
                    <span className="text-[13px] text-[#7a6e62] group-hover:text-[#2a2520] transition-colors">
                      +91 97371 68423
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#e0d8ce]">
          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-[#a09488] tracking-wide">
              &copy; {new Date().getFullYear()} {name}. All Rights Reserved.
            </p>
            <p className="text-[11px] text-[#c4b8aa] italic tracking-wide">
              Powered by HireFlow
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
