"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { motion, useInView } from "framer-motion"
import { Syne } from "next/font/google"
import {
  ContainerScroll,
  ContainerStagger,
  ContainerAnimated,
  ContainerInset,
} from "@/components/blocks/hero-video"
import { Button } from "@/components/ui/button"
import {
  CalendarCheck,
  BarChart3,
  Zap,
  ArrowRight,
  CheckCircle2,
  Star,
  Brain,
  FileText,
  GitBranch,
  Mail,
  ChevronRight,
} from "lucide-react"

const syne = Syne({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-syne" })

// ─── Animated Counter ────────────────────────────────────────────────────────
function AnimatedCounter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const step = end / (duration / 16)
    const timer = setInterval(() => {
      start = Math.min(start + step, end)
      setCount(Math.floor(start))
      if (start >= end) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [isInView, end, duration])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ─── Feature Card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, gradient }: {
  icon: React.ElementType; title: string; description: string; gradient: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300"
    >
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} mb-4`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />
    </motion.div>
  )
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", fn, { passive: true })
    return () => window.removeEventListener("scroll", fn)
  }, [])

  return (
    <div className={`${syne.variable} min-h-screen bg-[#04070F] text-white overflow-x-hidden`}>
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-20"
          style={{ background: "radial-gradient(ellipse at center, #3B82F6 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 left-0 w-[600px] h-[400px] opacity-10"
          style={{ background: "radial-gradient(ellipse at center, #6366F1 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 right-0 w-[500px] h-[400px] opacity-8"
          style={{ background: "radial-gradient(ellipse at center, #3B82F6 0%, transparent 70%)" }} />
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
      </div>

      {/* ── Floating Navbar ───────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4"
      >
        <div className={`flex items-center justify-between rounded-2xl px-5 py-3 transition-all duration-300 ${
          scrolled
            ? "border border-white/10 bg-[#04070F]/80 backdrop-blur-xl shadow-xl shadow-black/40"
            : "border border-white/[0.06] bg-white/[0.03] backdrop-blur-md"
        }`}>
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            <span className="font-[family-name:var(--font-syne)] text-[15px] font-700 tracking-tight text-white">
              HireFlow
            </span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {["Features", "Pricing", "Careers", "Blog"].map((item) => (
              <span key={item} className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer">
                {item}
              </span>
            ))}
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/10 text-sm h-8 px-3">
                Sign in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-blue-500 hover:bg-blue-400 text-white text-sm h-8 px-4 rounded-xl font-medium shadow-lg shadow-blue-500/25">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── Hero Text (static, above scroll section) ─────────────────────── */}
      <section className="relative z-10 flex flex-col items-center px-4 pt-32 pb-12 text-center">
        <ContainerStagger transition={{ staggerChildren: 0.12 }}>
          {/* Badge */}
          <ContainerAnimated animation="top">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-300 tracking-wide">AI-powered hiring, end to end</span>
            </div>
          </ContainerAnimated>

          {/* Main headline */}
          <ContainerAnimated animation="top">
            <h1 className="font-[family-name:var(--font-syne)] max-w-3xl text-5xl font-800 leading-[1.05] tracking-tighter text-white sm:text-6xl md:text-7xl">
              Hire the best people,{" "}
              <span className="relative">
                <span className="relative z-10 bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
                  10x faster
                </span>
                <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
              </span>
            </h1>
          </ContainerAnimated>

          <ContainerAnimated animation="bottom">
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/50 sm:text-lg">
              HireFlow unifies job posting, candidate tracking, AI scoring, interview scheduling,
              and offer management — so your team can focus on people, not paperwork.
            </p>
          </ContainerAnimated>

          {/* CTA Buttons */}
          <ContainerAnimated animation="blur" className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button
                size="lg"
                className="group relative h-12 rounded-xl bg-blue-500 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-400 transition-all"
              >
                Start hiring free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="ghost"
                className="h-12 rounded-xl border border-white/10 px-7 text-sm font-medium text-white/70 hover:bg-white/[0.06] hover:text-white hover:border-white/20 transition-all"
              >
                View demo
              </Button>
            </Link>
          </ContainerAnimated>

          {/* Trust line */}
          <ContainerAnimated animation="blur" className="mt-8 flex items-center gap-3 text-xs text-white/30">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400/60" />
            <span>No credit card required</span>
            <span className="w-px h-3 bg-white/10" />
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400/60" />
            <span>Free 14-day trial</span>
            <span className="w-px h-3 bg-white/10" />
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400/60" />
            <span>Setup in 5 minutes</span>
          </ContainerAnimated>
        </ContainerStagger>
      </section>

      {/* ── Hero Video Scroll Reveal ───────────────────────────────────────── */}
      <ContainerScroll className="relative z-10 bg-transparent pt-0" style={{ minHeight: "110vh" }}>
        {/* Product Video Reveal */}
        <ContainerInset
          className="relative z-10 mx-4 md:mx-12"
          insetYRange={[20, 0]}
          insetXRange={[30, 0]}
          roundednessRange={[800, 16]}
          translateYRange={["0%", "25%"]}
        >
          {/* Browser chrome header */}
          <div className="flex items-center gap-2 bg-[#0D1117] px-5 py-3 border-b border-white/[0.06]">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
            </div>
            <div className="mx-auto flex h-6 items-center rounded-md bg-white/[0.06] px-4 text-xs text-white/30">
              app.hireflow.io/dashboard
            </div>
          </div>
          <video
            width="100%"
            height="100%"
            loop
            playsInline
            autoPlay
            muted
            className="relative z-10 block h-auto max-h-full max-w-full object-cover align-middle bg-[#0D1117]"
            style={{ aspectRatio: "16/9" }}
          >
            <source
              src="https://videos.pexels.com/video-files/8084758/8084758-uhd_2560_1440_25fps.mp4"
              type="video/mp4"
            />
          </video>
        </ContainerInset>
      </ContainerScroll>

      {/* ── Trust Bar ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/[0.06] py-10">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-center text-xs uppercase tracking-widest text-white/25 mb-8">
            Trusted by fast-growing teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {["Stripe", "Linear", "Vercel", "Notion", "Figma", "Loom"].map((co) => (
              <span key={co} className="font-[family-name:var(--font-syne)] text-lg font-600 text-white/20 hover:text-white/50 transition-colors cursor-default tracking-tight">
                {co}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-28 px-6">
        <div className="mx-auto max-w-5xl">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5">
              <span className="text-xs font-medium text-white/50 tracking-wide">Everything you need</span>
            </div>
            <h2 className="font-[family-name:var(--font-syne)] text-3xl font-700 tracking-tight text-white sm:text-4xl">
              Built for modern hiring teams
            </h2>
            <p className="mt-4 text-white/40 max-w-md mx-auto text-sm leading-relaxed">
              From sourcing to signing, every step of your hiring process in one cohesive platform.
            </p>
          </motion.div>

          {/* 3-col then 3-col grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Brain}
              title="AI Candidate Scoring"
              description="GPT-4o ranks candidates against job requirements with skill, experience, and semantic analysis. Know your best fit instantly."
              gradient="from-violet-500 to-purple-600"
            />
            <FeatureCard
              icon={GitBranch}
              title="Visual Pipeline"
              description="Drag-and-drop Kanban board with custom stages. Move candidates through your funnel in seconds."
              gradient="from-blue-500 to-cyan-600"
            />
            <FeatureCard
              icon={CalendarCheck}
              title="Smart Scheduling"
              description="Schedule interviews with Google Calendar + Meet links auto-generated. Invite external interviewers seamlessly."
              gradient="from-emerald-500 to-teal-600"
            />
            <FeatureCard
              icon={FileText}
              title="AI Resume Parsing"
              description="Automatically extract skills, experience, and contact info from uploaded resumes using GPT-4o."
              gradient="from-amber-500 to-orange-600"
            />
            <FeatureCard
              icon={Mail}
              title="Gmail Integration"
              description="Send offer letters, interview invites, and custom emails directly via your Gmail. All logged automatically."
              gradient="from-rose-500 to-pink-600"
            />
            <FeatureCard
              icon={BarChart3}
              title="Hiring Analytics"
              description="Pipeline funnel, source effectiveness, hiring velocity, and time-to-hire charts. Make data-driven decisions."
              gradient="from-blue-500 to-indigo-600"
            />
          </div>
        </div>
      </section>

      {/* ── Stats Section ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-blue-500/10 via-transparent to-indigo-500/10 p-12 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
              {[
                { value: 500, suffix: "+", label: "Companies hiring" },
                { value: 50, suffix: "K+", label: "Candidates managed" },
                { value: 3, suffix: "x", label: "Faster time-to-hire" },
                { value: 98, suffix: "%", label: "Customer satisfaction" },
              ].map(({ value, suffix, label }) => (
                <div key={label} className="text-center">
                  <div className="font-[family-name:var(--font-syne)] text-4xl font-800 text-white tracking-tight">
                    <AnimatedCounter end={value} suffix={suffix} />
                  </div>
                  <div className="mt-1.5 text-sm text-white/40">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Second Scroll Feature (dark video section) ──────────────────────── */}
      <ContainerScroll
        className="relative z-10 bg-transparent"
        style={{ paddingBottom: "25%" }}
      >
        <ContainerStagger
          className="relative z-20 flex flex-col items-center px-4 pt-24 pb-16 text-center"
          transition={{ staggerChildren: 0.15 }}
        >
          <ContainerAnimated animation="blur">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
              <Star className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300 tracking-wide">Offer management</span>
            </div>
          </ContainerAnimated>
          <ContainerAnimated animation="top">
            <h2 className="font-[family-name:var(--font-syne)] max-w-2xl text-4xl font-700 leading-tight tracking-tight text-white sm:text-5xl">
              Craft beautiful offer letters{" "}
              <span className="text-white/40">in minutes, not hours</span>
            </h2>
          </ContainerAnimated>
          <ContainerAnimated animation="bottom">
            <p className="mt-5 max-w-lg text-base text-white/45 leading-relaxed">
              4-step offer wizard with Keka-style salary breakdown, PDF generation, and one-click
              Gmail delivery. Candidates accept or decline right in their inbox.
            </p>
          </ContainerAnimated>
          <ContainerAnimated animation="blur" className="mt-7 flex flex-wrap gap-3 justify-center">
            {["Salary structure builder", "PDF offer letters", "Gmail delivery", "Accept / Decline flow"].map((tag) => (
              <span key={tag} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-white/55">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                {tag}
              </span>
            ))}
          </ContainerAnimated>
        </ContainerStagger>

        <ContainerInset
          className="relative z-10 mx-4 md:mx-16"
          insetYRange={[28, 0]}
          insetXRange={[30, 0]}
          roundednessRange={[800, 12]}
        >
          <div className="flex items-center gap-2 bg-[#080C12] px-5 py-3 border-b border-white/[0.05]">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
            </div>
            <div className="mx-auto text-xs text-white/25">Offer Letter Preview</div>
          </div>
          <video
            width="100%"
            height="100%"
            loop
            playsInline
            autoPlay
            muted
            className="block h-auto max-h-full max-w-full object-cover bg-[#080C12]"
            style={{ aspectRatio: "16/9" }}
          >
            <source
              src="https://videos.pexels.com/video-files/8086707/8086707-uhd_2560_1440_25fps.mp4"
              type="video/mp4"
            />
          </video>
        </ContainerInset>
      </ContainerScroll>

      {/* ── Testimonial ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-10 text-center backdrop-blur-sm"
          >
            <div className="flex justify-center gap-1 mb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <blockquote className="font-[family-name:var(--font-syne)] text-xl font-500 leading-relaxed text-white/80 tracking-tight">
              &ldquo;We reduced our time-to-hire from 6 weeks to 12 days.
              The AI scoring alone saves our team 4 hours per role — it&rsquo;s like having
              a recruiter that never sleeps.&rdquo;
            </blockquote>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                PK
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white">Priya Kapoor</div>
                <div className="text-xs text-white/40">Head of Talent · Razorpay</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-28 px-6">
        <div className="mx-auto max-w-2xl text-center">
          {/* Glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-30"
            style={{ background: "radial-gradient(ellipse at center, #3B82F6 0%, transparent 65%)" }} />
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-[family-name:var(--font-syne)] text-4xl font-800 tracking-tight text-white sm:text-5xl mb-6">
              Ready to transform your hiring?
            </h2>
            <p className="text-white/45 text-base leading-relaxed mb-10">
              Join hundreds of teams using HireFlow to find and hire exceptional talent.
              Get started in minutes, no credit card required.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="group h-13 rounded-xl bg-blue-500 px-8 text-base font-semibold text-white shadow-2xl shadow-blue-500/30 hover:bg-blue-400 transition-all"
                >
                  Start for free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/careers">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-13 rounded-xl border border-white/10 px-8 text-base font-medium text-white/60 hover:bg-white/[0.06] hover:text-white hover:border-white/20"
                >
                  See jobs board
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-10 px-6">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
              <GitBranch className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-[family-name:var(--font-syne)] text-sm font-600 text-white/80">HireFlow</span>
          </div>
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} HireFlow. Built for teams that care about people.
          </p>
          <div className="flex gap-6">
            {["Privacy", "Terms", "Support"].map((item) => (
              <span key={item} className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer">
                {item}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
