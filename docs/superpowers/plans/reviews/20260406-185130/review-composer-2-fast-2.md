
Here is a structured review based on reading all 19 plan files under `docs/superpowers/plans/PLAN.md` plus the 18 numbered sub-plans, cross-checking `docs/superpowers/specs/SPEC.md` (the specs index is **`SPEC.md`**, not `PLAN.md` or `INDEX.md` as some plans claim), and verifying against the repo (excluding `.claude/worktrees`).

**Codebase snapshot verified**

- `prisma/schema.prisma`: generator + PostgreSQL datasource only; no models (matches “minimal/empty” aside from generator block).
- `src/server/api/trpc.ts`: T3 default with `auth()` from `~/server/auth`, `publicProcedure` / `protectedProcedure` using `ctx.session.user`.
- `src/server/api/root.ts`: empty `appRouter`.
- `src/app/layout.tsx`: `TRPCReactProvider` only (no Privy).
- `package.json`: Next 16, React 19, tRPC 11, Prisma 7, **next-auth** present; no Privy, Resend, Gemini, or Vitest.
- `src/env.js`: `AUTH_SECRET`, `DATABASE_URL` (no Privy vars).
- `src/server/db.ts`: imports `PrismaClient` from **`../../generated/prisma`** (repo root `generated/prisma` — `tsconfig` `~/*` maps only to `./src/*`, so **`~/generated/prisma` is not a valid alias** in this project).
- `src/app/page.tsx`: still uses `auth()` / `~/server/auth` (NextAuth), not the stub 1b describes for post-migration.

---

### 1. Completeness

**Rating: CRITICAL (with SPEC/plan doc issues: IMPORTANT)**

- **Broken / wrong spec links in plans**: Master `docs/superpowers/plans/PLAN.md` points to `../specs/INDEX.md`, which does not exist; the real index is `docs/superpowers/specs/SPEC.md`. Plan `4d` also cites `specs/INDEX.md`. **IMPORTANT** for anyone following links.
- **`root.ts` “replace entire file” patterns drop routers**: Examples: `2a` registers only `survey` (drops `health` from `1b`); `2e` replaces `root.ts` with **only** `response`; `3a` Task 5 shows `response` + `results` only; `3c` Task 1 replaces with `health` + `survey` and later steps re-expand `survey` as if `2a` never existed. A sequential implementer **loses** routers unless they manually merge. **CRITICAL** for completeness of the API surface.
- **Plan `3c` re-implements `survey.ts` from scratch** (create, listMine, close, etc.) while **`2a` already defines a full `survey` router** (including `listMine` with a **different** input shape: cursor vs `ALL`/`sort`). Same domain, incompatible procedure contracts — **CRITICAL** gap vs dependency graph (`2a` → `3c`).
- **Plan `2e` re-“creates” `response.ts`** for `getConfirmation` / `listMine` while **`2d` already defines `response.ts`** (`start`, `saveAnswer`, `submit`, `clear`). Dependency order says `2d` then `2e`; the doc should say **extend** the existing router, not create a new file. **CRITICAL** for merge clarity.
- **Respondent spec**: `SPEC.md` / respondent experience requires **invite-only checks after auth**. **`2d` `response.start`** does not validate `INVITE_ONLY` or email/domain invites — **IMPORTANT** completeness gap.
- **Optional**: Specs mention email on close, AI on close, etc.; later plans (`3c`/`4a`/`4b`) partially cover this — acceptable as phased, but **`survey.close` in `2a` does not enqueue jobs**, while **`3c`’s close may** — another place plans disagree.

---

### 2. Correctness

**Rating: CRITICAL**

- **Auth context mismatch (`ctx.session` vs `ctx.userId`)**: After `1b`, `protectedProcedure` is supposed to expose **`ctx.userId`** / `ctx.walletAddress`, not `ctx.session`. These plans still use **`ctx.session.user.id`**:
  - `2a` (architecture + all protected snippets + tests),
  - `2e` (`getConfirmation`, `listMine`),
  - `3a` (`getBySurvey` / `getQuestionAggregation` use `ctx.session?.user?.id`; `getForCreator` uses `ctx.session.user.id`),
  - `3d` (multiple `ctx.session.user.id` references).
  Meanwhile `2b`, `2d`, `3c`, `3f` (partially), `4b`–`4d` use **`ctx.userId`**. This will not compile or behave consistently after `1b`. **CRITICAL.**
- **`ctx.user` / `ctx.user.isAdmin` without definition**: `3f` `admin` router and `4d` use **`ctx.user.isAdmin`**, but `1b`’s middleware does not add a `user` object to context. **CRITICAL.**
- **`publicProcedure` “optional auth”**: `3a` uses `ctx.session?.user` on **`publicProcedure`** for RESPONDENTS / CREATOR gating. After `1b`, base context has **no `session`**; there is also **no optional Bearer / Privy verification** on public procedures described, so **signed-in users cannot prove identity** on public routes unless you extend context (e.g. optional auth middleware or read Privy token from cookie in context). **CRITICAL** for results access control.
- **Wrong Prisma client import paths in plans**:
  - `2b`: `import { QuestionType } from "~/generated/prisma"` — **`~` → `src/`**; client lives at **`generated/prisma`** (see `src/server/db.ts`). **CRITICAL** if copied literally.
  - `3a` `results.ts`: `import type { PrismaClient } from "../../../generated/prisma"` from `src/server/api/routers/` resolves under **`src/`**, not repo root — **wrong**. Should match **`../../generated/prisma`** from `src/server/` or a dedicated path alias.
  - `4d` `premium.ts`: `import type ... from "~/generated/prisma"` — same **`~`** issue. **CRITICAL.**
- **`2b` helper typing**: `verifyDraftSurveyOwnership`’s `db` type via nested `Parameters<typeof protectedProcedure.query>...` is fragile and likely **does not typecheck**; use `typeof db` / `PrismaClient` or `ctx`’s `db` type. **IMPORTANT.**

---

### 3. Architecture

**Rating: CRITICAL**

- **Dependency graph vs `3c`**: Graph says dashboard builds on existing survey APIs; **`3c` Task 1 contradicts** by creating a **new** `survey.ts` with only `getStats` and a **different** `listMine`/CRUD story than `2a`. **CRITICAL.**
- **Single `root.ts` evolution**: Plans should treat **`appRouter` as cumulative** (health, survey, question, response, results, explore, user, profile, admin, ai, …). Repeated “replace entire file” steps are **unsafe**. **IMPORTANT.**
- **RSC + `createCaller` + Privy**: `src/trpc/server.ts` forwards `headers()` to `createTRPCContext`. Client tRPC (`1b`) adds **`Authorization: Bearer`**. Typical browser **page** requests expose **cookies**, not that header, unless you add middleware or context code to **derive the user from Privy’s cookie/JWT for RSC**. Otherwise **`3c`’s “server page prefetches via RSC caller”** for protected procedures **will not authenticate**. **CRITICAL** architectural gap.

---

### 4. TDD structure

**Rating: GOOD / IMPORTANT**

- **`2a`** includes Vitest setup and a solid **`survey.test.ts`** — **GOOD**.
- Many other plans lack tests (`2b`, `2d`, `2e`, `3a`, etc.) — acceptable for speed, but **IMPORTANT** for regression on the **`response`/`survey` merge conflicts** above.
- **`2a` tests** assume **NextAuth-style `session` context**; they must be rewritten for **`ctx.userId`** after `1b`. **CRITICAL** relative to the chosen auth design.

---

### 5. Dependencies & ordering

**Rating: CRITICAL**

- **Circular / contradictory ordering**: `2a` ↔ `1b` (session vs userId), `2a` ↔ `3c` (duplicated `survey` router), `2d` ↔ `2e` (duplicate `response` router definition).
- **Graph**: `PLAN.md` dependency tree is **conceptually fine**; **execution details** in individual plans violate it.
- **`root.ts`**: Not handled as a monotonically growing registry — **IMPORTANT** process issue.

---

### 6. Cross-plan consistency

**Rating: CRITICAL**

- **Auth**: `ctx.userId` vs `ctx.session.user.id` vs `ctx.user.isAdmin` — inconsistent.
- **Routers**: `survey.create` in **`2a`** takes optional title + slug rules; **`3c`** `create` is **no-input** and embeds premium limit — different contracts.
- **Components**: **`SurveyCard`** exists as **dashboard-local** (`3c`: `src/app/dashboard/_components/survey-card.tsx`) and **shared** (`3e`: `src/app/_components/survey-card.tsx`); **`3f`** correctly imports the shared path. **MINOR** duplication risk, not a naming bug.
- **Survey results route**: `1c` marks `/s/[slug]/results` as public; `3a`/`3b` enforce auth for some visibilities — **GOOD** alignment with the footnote in `1c`.

---

### 7. Risk

**Rating: IMPORTANT (multi-plan rework likely)**

- **Highest rework risk**: **`1b` auth contract** not propagated; **`3c` vs `2a`** survey router duplication; **`2d`/`2e`** response router merge; **`root.ts` churn**; **RSC auth** for protected prefetch.
- **Large plans**: **`2c`**, **`3c`** (very long), **`2a`** — possible to exceed one session; mitigated by task boundaries but **merge conflicts** increase risk.
- **External / runtime**: Privy token via **`document.cookie` / `privy-token`** in `1b` may not match Privy’s actual cookie/name/version — **POTENTIAL**; should be verified against current Privy Next.js guidance.

---

## Prioritized recommendations

1. **CRITICAL — Pick one auth context shape and normalize every plan**  
   Prefer matching **`1b`**: `ctx.userId`, optional `ctx.walletAddress`, and for admin add **`isAdmin`** (either `ctx.isAdmin` or load `ctx.user` from DB in middleware). Replace **all** `ctx.session` references in `2a`, `2e`, `3a`, `3d` and fix **`3f`/`4d`** `ctx.user` assumptions.

2. **CRITICAL — Fix `publicProcedure` access for results** (`3a`)  
   Add **optional Privy verification** (or read token from cookie in `createTRPCContext`) so RESPONDENTS/CREATOR checks receive a real `userId` on “public” procedures.

3. **CRITICAL — Resolve `survey` router ownership**  
   **Delete or rewrite `3c` Task 1–3** so the dashboard **consumes `2a`’s** `survey` procedures only; add dashboard-specific procedures in **`2a` extensions** or a thin **`dashboard` router** instead of a second `survey.ts`.

4. **CRITICAL — Resolve `response` router ownership**  
   Make **`2e` an additive delta** to `2d`’s `response.ts` (add `getConfirmation`, `listMine`); fix auth fields to `ctx.userId`.

5. **CRITICAL — Fix Prisma import examples**  
   Use the same pattern as **`src/server/db.ts`** (`../../generated/prisma` from `src/server/...`) or add a **`#prisma` / `@attestly/prisma`** path in `tsconfig` and use it consistently; remove **`~/generated/prisma`**.

6. **CRITICAL — `root.ts` maintenance**  
   Replace “replace entire file” blocks with **“merge into existing `appRouter`”** instructions and a **canonical final snippet** in `PLAN.md`.

7. **IMPORTANT — RSC protected tRPC**  
   Document how **`createContext`** obtains Privy identity from **incoming request cookies** (or require dashboard data via client-only tRPC). Without this, **`3c` prefetch** is unreliable.

8. **IMPORTANT — Invite-only enforcement**  
   Extend **`2d` `response.start`** (or a shared helper) per respondent spec: after auth, enforce **email/domain** invites for `INVITE_ONLY`.

9. **IMPORTANT — Documentation links**  
   Update `plans/PLAN.md`, `4d`, and any **`INDEX.md`** references to **`specs/SPEC.md`**.

10. **MINOR — `2b` types and Zod**  
   Simplify `verifyDraftSurveyOwnership` typing; confirm **`z.nativeEnum`** vs Zod 4 patterns you use elsewhere.

11. **POTENTIAL — `db:push` vs migrate-only workflow**  
   `1a` mixes **`db:push`** and **`migrate dev`**; ensure the team’s intended workflow is explicit to avoid drift between environments.

This review is intentionally grounded in the actual repo layout (`generated/prisma`, `~/` alias) and the contradictions between **`1b`** and downstream plans; addressing items 1–6 first will prevent most cascading implementation failures.
