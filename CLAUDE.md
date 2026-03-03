# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (next lint)
```

No test framework is configured. There is no test command.

## Architecture

**HireFlow** is a multi-tenant ATS (Applicant Tracking System) built with Next.js 14 App Router, TypeScript, Supabase (Postgres + Auth), Tailwind CSS, and shadcn/ui.

### App Router Layout

- `src/app/(auth)/` — Auth pages (login, signup, forgot-password, set-password, org/new)
- `src/app/(dashboard)/` — Authenticated pages behind middleware (dashboard, jobs, candidates, applications, interviews, offers, pipeline, reports, settings, email-templates)
- `src/app/careers/` — Public careers page and apply form
- `src/app/api/` — API routes (ai-matching, gmail, interviews, offers, resumes, whatsapp, webhooks, etc.)

### Service Layer (`src/lib/services/`)

All data access goes through service files that use Supabase clients. Key services: `candidates.ts`, `jobs.ts`, `applications.ts`, `interviews.ts`, `offers.ts`, `feedback.ts`, `gmail.ts`, `google-calendar.ts`, `ai-matching.ts`, `resume-parser.ts`, `reports.ts`, `whatsapp.ts`, `organization.ts`.

Services use three Supabase clients from `src/lib/supabase/`:
- `client.ts` — Browser client (singleton)
- `server.ts` — Server/RSC client with cookie management
- `admin.ts` — Service role client for privileged operations

### Validation (`src/lib/validators/`)

Zod schemas for all entities, re-exported from `src/lib/validators/index.ts`. Used with react-hook-form via `@hookform/resolvers`.

### Types (`src/types/database.ts`)

All database entity interfaces and enum types are defined here. This is the single source of truth for TypeScript types matching the Supabase schema.

### Constants (`src/lib/constants/index.ts`)

Application-wide constants: pipeline stages, employment types, salary structure config, currencies (plain string array), status configs, email template variables.

### Multi-tenancy

Middleware (`src/lib/supabase/middleware.ts`) resolves tenant from custom domains or subdomains via `x-org-id` header. Tenant resolution logic is in `src/lib/tenant-resolver.ts`.

### Database

Schema lives in `supabase/migrations/` (15 migration files, `00001` through `00015`). Key tables: `organizations`, `organization_members`, `jobs`, `pipeline_stages`, `candidates`, `applications`, `interviews`, `interview_feedback`, `offer_letters`, `email_templates`, `oauth_tokens`, `candidate_match_scores`, `whatsapp_messages`.

### External Integrations

- **OpenAI** (GPT-4o + text-embedding-3-small): AI candidate scoring and resume parsing
- **Google OAuth**: Gmail send + Calendar events with Meet links
- **@react-pdf/renderer**: Offer letter PDF generation
- **unpdf**: Resume PDF text extraction
- **Vercel API**: Custom domain management

## Key Gotchas

- **Table names**: Offers table is `offer_letters` (not `offers`). Always check `database.ts` types and migrations before assuming column names.
- **Missing columns**: `candidates` has no `avatar_url` or `skills`. `applications` has no `deleted_at` or `source`. `organization_invitations` table does not exist.
- **Zod v4**: Use `{ message: '...' }` instead of `required_error` parameter. `.refine()` breaks `.partial()` — split into base schema + refined create schema + `base.partial()` for update.
- **@hookform/resolvers v5 + react-hook-form v7**: Type mismatch on `zodResolver` — use `as any` cast.
- **@react-pdf/renderer**: `renderToBuffer` returns Node Buffer — wrap in `new Uint8Array(buffer)` for NextResponse. Component types don't match `renderToBuffer` param — use `as any`.
- **jobs table**: Has `jobs_salary_range` check constraint — salary fields must be null or positive.
- **ESLint**: `no-explicit-any` is set to `"warn"`, not `"error"`.
