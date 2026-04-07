# Attestly Phase 1 — Implementation Plans

> For design specifications, see [docs/superpowers/specs/PLAN.md](../specs/PLAN.md)

## Overview

Phase 1 implements the full survey platform: auth, data model, survey builder, respondent flow, results, dashboard, marketplace, AI insights, and premium gating. No blockchain, IPFS, or encryption — those are Phase 2-4.

19 sub-plans, each completable in a single agent session. Build in order — each depends on its predecessors.

## Dependency Graph

```
1a Prisma Schema
    ↓
1b Auth Migration
    ↓
1c App Shell
    ├→ 2a Survey CRUD
    │   ├→ 2b Question CRUD
    │   │   ├→ 2c-1 Builder Shell & Publish
    │   │   │   └→ 2c-2 Builder Questions & Preview
    │   │   └→ 2d Survey Landing & Response Form
    │   │       └→ 2e Confirmation & My Responses
    │   ├→ 3a Results Aggregation API
    │   │   └→ 3b Results UI
    │   ├→ 3c Creator Dashboard
    │   │   └→ 3d Invite System
    │   └→ 3e Explore Page
    │       └→ 3f User Profiles, Settings & Admin
    └→ 4a Background Job Queue
        └→ 4b AI Summaries
            └→ 4c AI Chat
                └→ 4d Premium Gating (final — applies gates across all features)
```

## Sub-Plans

### Phase 1: Foundation

| # | Plan | Goal | Key Files |
|---|------|------|-----------|
| [1a](2026-04-06-1a-prisma-schema.md) | **Prisma Schema** | Define all 12 entities, enums, indexes, seed data | `prisma/schema.prisma`, `prisma/seed.ts` |
| [1b](2026-04-06-1b-auth-migration.md) | **Auth Migration** | Remove NextAuth, add Privy, auth middleware | `src/server/api/trpc.ts`, `src/env.js` |
| [1c](2026-04-06-1c-app-shell.md) | **App Shell** | Navbar, route structure, auth guards | `src/app/layout.tsx`, all route stubs |

### Phase 2: Core Survey Features

| # | Plan | Goal | Key Files |
|---|------|------|-----------|
| [2a](2026-04-06-2a-survey-crud.md) | **Survey CRUD** | tRPC routers: create, update, publish, delete, close, list | `src/server/api/routers/survey.ts` |
| [2b](2026-04-06-2b-question-crud.md) | **Question CRUD** | tRPC routers: upsert, delete with reindex, reorder | `src/server/api/routers/question.ts` |
| [2c-1](2026-04-06-2c1-builder-shell.md) | **Builder Shell & Publish** | Page shell, hooks, header, footer, publish dialog, validation | `src/app/surveys/[id]/edit/` |
| [2c-2](2026-04-06-2c2-builder-questions-preview.md) | **Builder Questions & Preview** | Metadata form, question cards, preview pane, final wiring | `src/app/surveys/[id]/edit/_components/` |
| [2d](2026-04-06-2d-survey-response.md) | **Survey Landing & Response** | Landing page, response form, auto-save, submit | `src/app/s/[slug]/`, response router |
| [2e](2026-04-06-2e-confirmation-my-responses.md) | **Confirmation & My Responses** | Post-submit page, response history | `src/app/s/[slug]/confirmation/`, `/my-responses` |

### Phase 3: Dashboard, Results & Discovery

| # | Plan | Goal | Key Files |
|---|------|------|-----------|
| [3a](2026-04-06-3a-results-api.md) | **Results Aggregation API** | Per-question aggregation, access control | `src/server/api/routers/results.ts` |
| [3b](2026-04-06-3b-results-ui.md) | **Results UI** | Bar charts, rating distributions, free text lists | `src/app/s/[slug]/results/` |
| [3c](2026-04-06-3c-creator-dashboard.md) | **Creator Dashboard** | Stats, survey list, filters, close flow | `src/app/dashboard/` |
| [3d](2026-04-06-3d-invite-system.md) | **Invite System** | Invite CRUD, email/domain access, Resend emails | `src/server/api/routers/invite.ts` |
| [3e](2026-04-06-3e-explore-page.md) | **Explore Page** | Search, featured, trending, category filtering | `src/app/explore/`, explore router |
| [3f](2026-04-06-3f-profiles-settings-admin.md) | **Profiles, Settings & Admin** | User profiles, settings, admin featured management | `/u/[userId]`, `/settings/profile`, `/admin` |

### Phase 4: AI & Premium

| # | Plan | Goal | Key Files |
|---|------|------|-----------|
| [4a](2026-04-06-4a-background-jobs.md) | **Background Job Queue** | Postgres-backed async job infrastructure | `src/server/jobs/` |
| [4b](2026-04-06-4b-ai-summaries.md) | **AI Summaries** | LLM summary generation on close, AiSummary display | `src/server/ai/`, AI router |
| [4c](2026-04-06-4c-ai-chat.md) | **AI Chat** | Chat sidebar, sessions, cross-survey insights | ChatSidebar, `/dashboard/insights` |
| [4d](2026-04-06-4d-premium-gating.md) | **Premium Gating** | Subscription checks, upsells, free tier limits | `src/lib/premium.ts`, PremiumGate |

## Tech Stack

- **Runtime:** Next.js 16 (App Router), React 19, TypeScript
- **API:** tRPC 11 with Zod validation
- **Database:** PostgreSQL via Prisma 7
- **Auth:** Privy (embedded wallets, Google/Apple/Email)
- **Styling:** Tailwind CSS
- **Email:** Resend
- **AI:** Google Generative AI SDK (Gemini Flash-Lite for summaries, Gemini Flash for chat)
- **Testing:** Vitest (when applicable)

## Execution Strategy

Each sub-plan is designed for **subagent-driven development**:
1. Dispatch implementer subagent per task
2. Spec compliance review after each task
3. Code quality review after spec passes
4. Commit after both reviews pass

Total estimated effort: ~20-25 agent sessions across all 18 sub-plans.
