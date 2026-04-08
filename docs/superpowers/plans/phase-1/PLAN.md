# Attestly Phase 1 — Survey Platform

> For design specifications, see [docs/superpowers/specs/PLAN.md](../../specs/PLAN.md)

## Overview

Phase 1 implements the full survey platform: auth, data model, survey builder, respondent flow, results, dashboard, marketplace, AI insights, and premium gating. No blockchain, IPFS, or encryption — those are Phase 2-4.

19 sub-plans + 1 wizard refactor. **Status: COMPLETE.**

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

Survey Wizard (refactors 2c-1/2c-2 into 4-step wizard)
```

## Sub-Plans

### Foundation

| # | Plan | Goal | Status |
|---|------|------|--------|
| [1a](2026-04-06-1a-prisma-schema.md) | **Prisma Schema** | 12 entities, enums, indexes, seed data | ✅ |
| [1b](2026-04-06-1b-auth-migration.md) | **Auth Migration** | NextAuth → Privy, auth middleware | ✅ |
| [1c](2026-04-06-1c-app-shell.md) | **App Shell** | Navbar, 14 route stubs, auth guards | ✅ |

### Core Survey Features

| # | Plan | Goal | Status |
|---|------|------|--------|
| [2a](2026-04-06-2a-survey-crud.md) | **Survey CRUD** | 9 tRPC procedures | ✅ |
| [2b](2026-04-06-2b-question-crud.md) | **Question CRUD** | upsert, delete, reorder | ✅ |
| [2c-1](2026-04-06-2c1-builder-shell.md) | **Builder Shell** | Hooks, header, footer, publish | ✅ |
| [2c-2](2026-04-06-2c2-builder-questions-preview.md) | **Builder Questions** | Question cards, preview | ✅ |
| [2d](2026-04-06-2d-survey-response.md) | **Survey Response** | Landing, response form, auto-save | ✅ |
| [2e](2026-04-06-2e-confirmation-my-responses.md) | **Confirmation** | Post-submit, response history | ✅ |

### Dashboard, Results & Discovery

| # | Plan | Goal | Status |
|---|------|------|--------|
| [3a](2026-04-06-3a-results-api.md) | **Results API** | Per-question aggregation | ✅ |
| [3b](2026-04-06-3b-results-ui.md) | **Results UI** | Charts, distributions, free text | ✅ |
| [3c](2026-04-06-3c-creator-dashboard.md) | **Dashboard** | Stats, survey list, close flow | ✅ |
| [3d](2026-04-06-3d-invite-system.md) | **Invite System** | CRUD, email, Resend | ✅ |
| [3e](2026-04-06-3e-explore-page.md) | **Explore Page** | Search, featured, trending | ✅ |
| [3f](2026-04-06-3f-profiles-settings-admin.md) | **Profiles & Admin** | Profiles, settings, admin | ✅ |

### AI & Premium

| # | Plan | Goal | Status |
|---|------|------|--------|
| [4a](2026-04-06-4a-background-jobs.md) | **Job Queue** | Postgres-backed worker | ✅ |
| [4b](2026-04-06-4b-ai-summaries.md) | **AI Summaries** | Gemini, summary generation | ✅ |
| [4c](2026-04-06-4c-ai-chat.md) | **AI Chat** | Chat sidebar, cross-survey | ✅ |
| [4d](2026-04-06-4d-premium-gating.md) | **Premium Gating** | Subscription, upsells, limits | ✅ |

### Refactors

| # | Plan | Goal | Status |
|---|------|------|--------|
| [wizard](2026-04-07-survey-wizard.md) | **Survey Wizard** | 4-step wizard replacing split-pane editor | ✅ |

## Tech Stack

- **Runtime:** Next.js 16 (App Router), React 19, TypeScript
- **API:** tRPC 11 with Zod validation
- **Database:** PostgreSQL via Prisma 7
- **Auth:** Privy (embedded wallets, Google/Apple/Email)
- **Styling:** Tailwind CSS
- **Email:** Resend
- **AI:** Google Generative AI SDK (Gemini Flash-Lite/Flash)
- **Testing:** Vitest
