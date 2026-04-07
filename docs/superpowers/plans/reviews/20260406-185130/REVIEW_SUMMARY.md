# Plan Review Summary

**Date:** 2026-04-06
**Models:** Opus (internal), Composer (external), GPT-5.4-medium-fast (external), Gemini-3-flash (external) (x2 instances each, 1 Opus pending)
**Review files:** review-opus-internal-2.md, review-composer-2-fast-1.md, review-composer-2-fast-2.md, review-gpt-5.4-medium-fast-1.md, review-gpt-5.4-medium-fast-2.md, review-gemini-3-flash-1.md, review-gemini-3-flash-2.md
**Failed reviews:** None (review-opus-internal-1.md still pending -- reduced coverage from Opus model)
**Review round:** 1
**Total findings:** 30 (8 CRITICAL, 12 IMPORTANT, 6 MINOR, 4 POTENTIAL)

---

## Auto-apply

Changes that multiple reviewers agree on. These will be applied automatically.

### Critical

1. **Standardize auth context to `ctx.userId` across all plans** -- After Plan 1b, `protectedProcedure` exposes `ctx.userId` and `ctx.walletAddress`, not `ctx.session.user`. Plans 2a, 2e, 3a, 3d still use `ctx.session.user.id`; Plan 3f uses `ctx.user.isAdmin`. All must be updated to use `ctx.userId` consistently, with admin checks done via DB lookup or extended middleware. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-1, gemini-3-flash-2 (7/7 reviewers, all 4 models)_

2. **Fix duplicate router file creation (response.ts: 2d vs 2e)** -- Plan 2e instructs "create `response.ts`" with only `getConfirmation`/`listMine`, which would overwrite Plan 2d's `start`/`saveAnswer`/`submit`/`clear`. Plan 2e must be changed to extend (not replace) 2d's router. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-1 (6/7 reviewers, all 4 models)_

3. **Fix duplicate router file creation (survey.ts: 2a vs 3c)** -- Plan 3c Task 1 creates a new `survey.ts` with `getStats`/`listMine`/`create`/`deleteDraft`/`close` using different input schemas than Plan 2a's existing full survey router. Plan 3c must consume 2a's router, not redefine it. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2 (5/7 reviewers, all 4 models)_

4. **Replace all "replace entire root.ts" instructions with additive merge** -- Plans 1b, 2a, 2e, 3a, 3c each provide "replace entire `root.ts`" with only their subset of routers, silently dropping previously registered routers. Each plan must instead add its router incrementally. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-1 (6/7 reviewers, all 4 models)_

5. **Fix Prisma client import paths** -- Plans 2b, 3a, 4b, 4c, 4d use `~/generated/prisma`, but `~` maps to `src/*` via tsconfig. The generated client lives at repo-root `generated/prisma` (as used in `src/server/db.ts` via `../../generated/prisma`). All imports must use the correct path or add a tsconfig alias. _Source: opus-internal-2 (implied), composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-1 (6/7 reviewers, 4 models)_

6. **Fix Plan 2c: remove NextAuth references and fix autosave payloads** -- Plan 2c imports `auth` from `~/server/auth` and redirects to `/api/auth/signin` (both deleted by 1b). Additionally, `useAutoSave` passes `builder.survey.title` as the survey ID, `question.id` as `surveyId`, and calls `question.delete` with `{ id }` instead of `{ questionId }` per 2b. _Source: opus-internal-2, composer-2-fast-1, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-2 (5/7 reviewers, all 4 models)_

7. **Add optional auth for public procedures (results access control)** -- Plans 3a and 3d use `ctx.session?.user?.id` in `publicProcedure` for RESPONDENTS/CREATOR gating. After 1b, no session exists on public procedures and there is no optional Privy verification, so signed-in users cannot prove identity on public routes. Need an `optionalProtectedProcedure` or cookie-based verification in `createTRPCContext`. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1 (4/7 reviewers, 3 models)_

8. **Fix `ctx.user.isAdmin` -- not in auth context** -- Plan 3f and 4d use `ctx.user.isAdmin`, but 1b's middleware only provides `ctx.userId` and `ctx.walletAddress`. Admin router needs to either fetch user from DB or have middleware extended to include `isAdmin`. _Source: opus-internal-2, composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1 (4/7 reviewers, 3 models)_

### Important

1. **Fix procedure input contract mismatches** -- Plan 2a defines `survey.deleteDraft({ id })` and `survey.close({ id })`, while 3c uses `{ surveyId }` for both. Plan 3c's `survey.create` takes no input while 2a takes `{ title }`. These must be unified. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-2 (3/7 reviewers, 2 models)_

2. **Add missing `survey.getForResponse` procedure** -- The respondent spec requires this procedure for fetching survey questions with invite-only enforcement and resume/redirect logic. No plan defines it. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2, gemini-3-flash-1 (3/7 reviewers, 2 models)_

3. **Plan 2d respondent page is incomplete** -- Task 4 leaves the main response page as a stub placeholder. The plan is not independently executable for the respondent flow. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2 (2/7 reviewers, 1 model)_

4. **Fix documentation links (PLAN.md -> specs/SPEC.md)** -- `PLAN.md` references `../specs/INDEX.md` which does not exist; the real file is `specs/SPEC.md`. Plan 4d also cites `INDEX.md`. _Source: composer-2-fast-1, composer-2-fast-2, gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2 (4/7 reviewers, 2 models)_

5. **Fix Plan 3e JSON category filtering** -- `categories: { array_contains: input.categories }` is not valid Prisma JSON filtering on PostgreSQL. Needs raw SQL, supported JSON path filters, or normalization to a join table. _Source: opus-internal-2, composer-2-fast-1, gpt-5.4-medium-fast-1 (3/7 reviewers, 3 models)_

6. **Plan 3d reintroduces AUTH_SECRET in env.js** -- Contradicts Plan 1b which removes NextAuth and AUTH_SECRET. _Source: opus-internal-2, composer-2-fast-1 (2/7 reviewers, 2 models)_

7. **Plan 4b AI summaries not wired into results page** -- Plan 4b creates services/components for AI summaries but never actually modifies the results page to render them. The integration is incomplete. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2 (2/7 reviewers, 1 model)_

### Minor

1. **Fix publish navigation URL in 2c** -- `PublishDialog` navigates to `/surveys/${surveyId}` but public URLs are `/s/[slug]` per routing elsewhere. _Source: composer-2-fast-1, gpt-5.4-medium-fast-2 (2/7 reviewers, 2 models)_

2. **Unify SurveyCard component** -- `SurveyCard` exists as dashboard-local (`3c`: `src/app/dashboard/_components/`) and shared (`3e`: `src/app/_components/`) with different prop shapes. Should be a single shared component. _Source: composer-2-fast-2, gemini-3-flash-2 (2/7 reviewers, 2 models)_

---

## Needs your input

Items that require human judgment before being applied.

1. **[CRITICAL] RSC + Privy authentication strategy for server-side tRPC calls**
   - **Context:** Multiple reviewers flagged that `createTRPCContext` in RSC (React Server Components) relies on `headers()` forwarding, but Privy tokens are set as Bearer headers by the client-side tRPC provider. Server-side page renders (e.g., 3c dashboard prefetch) send cookies, not Authorization headers. Protected procedures will fail to authenticate in RSC context.
   - **Option A:** Add cookie-based Privy JWT verification in `createTRPCContext` so RSC calls work via cookies _(Source: composer-2-fast-1, composer-2-fast-2)_
   - **Option B:** Restrict all protected data fetching to client-only tRPC and use RSC only for public data prefetch _(Source: composer-2-fast-2)_
   - **Recommendation:** Option A is more aligned with the existing plan architecture (3c explicitly prefetches protected data via RSC). Requires adding Privy cookie/JWT verification logic to `createTRPCContext` in Plan 1b.

2. **[IMPORTANT] Invite-only enforcement in response.start**
   - **Context:** Plan 2d's `response.start` reads `accessMode` but never checks it server-side. The respondent spec requires the access check after auth. However, `invite.check` is only introduced in Plan 3d (later in dependency graph).
   - **Option A:** Add invite-only enforcement directly in 2d's `response.start` as an inline check (before 3d creates the full invite router) _(Source: gpt-5.4-medium-fast-1)_
   - **Option B:** Defer invite enforcement entirely to Plan 3d and mark it as a known gap in 2d, adding a TODO comment _(Source: composer-2-fast-2)_
   - **Recommendation:** Option A is safer -- at minimum, 2d should reject responses for INVITE_ONLY surveys until proper invite infrastructure exists. A simple `if (survey.accessMode === 'INVITE_ONLY') throw new TRPCError(...)` prevents bypasses.

3. **[IMPORTANT] Plan 2c size -- split into sub-plans?**
   - **Context:** Plan 2c contains 14+ tasks and dozens of components. Multiple reviewers flagged it may exceed single agent session capacity.
   - **Option A:** Split into 2c-1 (shell, metadata, publish flow) and 2c-2 (question editors, preview, autosave) _(Source: gemini-3-flash-1, opus-internal-2)_
   - **Option B:** Keep as single plan but ensure robust checkpoints so partial completion is recoverable _(Source: gemini-3-flash-2)_
   - **Recommendation:** Splitting is lower risk for agent-driven implementation. The seam between metadata/shell and question-type editors is natural.

4. **[IMPORTANT] AI provider inconsistency (Gemini vs Claude)**
   - **Context:** `SPEC.md` frames Gemini as the likely AI provider, while `2026-04-05-ai-insights-design.md` mentions Claude. The plans chose Gemini. The spec set is not internally consistent.
   - **Option A:** Commit to Gemini as planned and update the AI design spec to match _(Source: gpt-5.4-medium-fast-1)_
   - **Option B:** Switch to Claude for better integration with the development toolchain _(implied alternative)_
   - **Recommendation:** Either is viable; key is to make the specs consistent with whichever choice is made.

5. **[IMPORTANT] Plan 1a Prisma schema -- missing datasource URL**
   - **Context:** Current `prisma/schema.prisma` has a datasource block without `url = env("DATABASE_URL")`. Plan 1a assumes schema already parses but its early verification step (`pnpm prisma format`) will fail.
   - **Option A:** Add datasource URL fix as Task 0 in Plan 1a _(Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2)_
   - **Option B:** Assume the scaffold is functional and the missing URL is a review artifact _(no reviewer suggested this)_
   - **Recommendation:** Option A. Add `url = env("DATABASE_URL")` to the datasource block as the first step.

---

## Unique insights

Suggestions raised by only one reviewer (or only one model).

1. **[IMPORTANT] Plan 4a retry logic burns through retries instantly** -- `failJob()` resets retriable jobs to `PENDING` immediately, while `claimNextJob()` claims `PENDING` jobs, so a worker can instantly reclaim and burn retries before intended backoff. _Source: gpt-5.4-medium-fast-2_. **Action:** Auto-apply (concrete bug).

2. **[IMPORTANT] Plan 4c AI chat lacks creator ownership verification** -- `chat` procedure never verifies that the session's `surveyId`/`surveyIds` belong to the calling creator. A premium user could chat against arbitrary survey IDs. _Source: gpt-5.4-medium-fast-1_. **Action:** Auto-apply (security gap).

3. **[IMPORTANT] Plan 4b/4c load answers from IN_PROGRESS/soft-deleted responses** -- Both plans load `question.answers` without filtering to `SUBMITTED` responses with `deletedAt = null`, violating the results spec. _Source: gpt-5.4-medium-fast-1_. **Action:** Auto-apply (correctness bug).

4. **[IMPORTANT] Plan 4c premium gating incomplete** -- Only `createSession` is premium-gated; `getSession`, `listSessions`, `renameSession`, `deleteSession`, and `chat` are not, conflicting with downgrade rules. _Source: gpt-5.4-medium-fast-1_. **Action:** Needs input (depends on desired UX for downgraded users).

5. **[IMPORTANT] Plan 3f settings page broken** -- Calls `api.user.getProfile.useQuery({ userId: "" }, { enabled: false })` with empty string ID and never replaces it. _Source: gpt-5.4-medium-fast-1_. **Action:** Auto-apply.

6. **[IMPORTANT] Plan 3e explore page missing spec features** -- Tag search, debounced search, clear/reset UX, and load-more/infinite-scroll from the discovery spec are missing. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2_. **Action:** Auto-apply.

7. **[IMPORTANT] Plan 4b handler registration architecture mismatch** -- Plan 4a creates `handlers.ts` with a Map registry, but 4b targets `worker.ts` for registration, and creates handlers in a `handlers/` subdirectory. _Source: opus-internal-2, gpt-5.4-medium-fast-2 (2 models)_. **Action:** Auto-apply.

8. **[IMPORTANT] Plan 3c/3d dashboard-invite wiring gap** -- `3c` SurveyCard never exposes "Manage Invites" action; `3d` creates `InviteManagementPanel` but never wires it into the dashboard. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2 (1 model)_. **Action:** Auto-apply.

9. **[IMPORTANT] Plan 2b verifyDraftSurveyOwnership typing is fragile** -- Uses nested `Parameters<typeof protectedProcedure.query>...` for `db` type which likely does not typecheck. Should use `PrismaClient` or `typeof db`. _Source: composer-2-fast-2_. **Action:** Auto-apply.

10. **[MINOR] Plan 2a getBySlug missing walletAddress and _count.questions** -- Creator select includes `{id, displayName, avatar}` but 2d renders `creator.walletAddress`. Also only includes `_count.responses`, not `_count.questions` which 2d needs. _Source: opus-internal-2, gpt-5.4-medium-fast-2_. **Action:** Auto-apply.

11. **[MINOR] Plan 2e missing survey hash from confirmation proof** -- Respondent spec calls for it but confirmation page omits it. _Source: gpt-5.4-medium-fast-1_. **Action:** Auto-apply.

12. **[MINOR] Plan 2c references nonexistent isPremium** -- `useSurveyBuilder` hook never defines `isPremium` but builder UI passes it to `SurveyMetadataForm`. Plan 4d adds premium checks later. _Source: opus-internal-2_. **Action:** Auto-apply (add placeholder/stub).

13. **[MINOR] AiSummary @@unique with NULL questionId** -- PostgreSQL NULLs are distinct in unique constraints. Prisma upsert won't work as expected for overall survey summaries (NULL questionId). _Source: opus-internal-2_. **Action:** Auto-apply (partial index handles storage but upsert logic needs adjustment).

14. **[MINOR] Plan 4a uses macOS-incompatible `timeout` command** -- Shell verification examples use `timeout` which is not available by default on macOS. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2_. **Action:** Auto-apply.

15. **[POTENTIAL] Plan 4d/3f duplicate `user.getSubscription` procedure** -- Both plans define this procedure, creating redundancy. _Source: gpt-5.4-medium-fast-1, gpt-5.4-medium-fast-2_. **Action:** Auto-apply (remove duplication from 4d).

16. **[POTENTIAL] Privy token retrieval mechanism unverified** -- 1b assumes specific cookie/token name for Privy without grounding in current Privy SDK documentation. _Source: gpt-5.4-medium-fast-2, composer-2-fast-2_. **Action:** Needs input (verify against Privy docs at implementation time).

17. **[POTENTIAL] Plan 4c AI context window limits** -- Sending up to 500 free-text responses per question to Gemini could exceed context window or become expensive. _Source: gemini-3-flash-2_. **Action:** Needs input.

18. **[POTENTIAL] No shared verifyCreatorOwnership helper** -- Plans 2a, 2b, 3d each define inline ownership verification. Could share a common utility. _Source: opus-internal-2_. **Action:** Auto-apply (minor refactor).

---

## Agreement Matrix

| Finding | opus-internal-2 | composer-2-fast-1 | composer-2-fast-2 | gpt-5.4-medium-fast-1 | gpt-5.4-medium-fast-2 | gemini-3-flash-1 | gemini-3-flash-2 |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **CRITICAL: Auth context (session vs userId)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **CRITICAL: response.ts duplicate (2d/2e)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | -- |
| **CRITICAL: survey.ts duplicate (2a/3c)** | ✓ | ✓ | ✓ | ✓ | ✓ | -- | -- |
| **CRITICAL: root.ts replace vs merge** | ✓ | ✓ | ✓ | ✓ | ✓ | -- | ✓ |
| **CRITICAL: Prisma import paths** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | -- |
| **CRITICAL: Plan 2c NextAuth + autosave bugs** | ✓ | ✓ | -- | ✓ | ✓ | -- | ✓ |
| **CRITICAL: Public procedures optional auth** | ✓ | ✓ | ✓ | ✓ | -- | -- | -- |
| **CRITICAL: ctx.user.isAdmin not in context** | ✓ | ✓ | ✓ | ✓ | -- | -- | -- |
| **IMPORTANT: Procedure input mismatches** | -- | -- | -- | ✓ | ✓ | -- | ✓ |
| **IMPORTANT: Missing getForResponse** | -- | -- | -- | ✓ | ✓ | ✓ | -- |
| **IMPORTANT: Plan 2d page incomplete** | -- | -- | -- | ✓ | ✓ | -- | -- |
| **IMPORTANT: Doc links INDEX.md vs SPEC.md** | -- | ✓ | ✓ | ✓ | ✓ | -- | -- |
| **IMPORTANT: 3e JSON category filter** | ✓ | ✓ | -- | ✓ | -- | -- | -- |
| **IMPORTANT: 3d AUTH_SECRET reintroduced** | ✓ | ✓ | -- | -- | -- | -- | -- |
| **IMPORTANT: 4b summaries not wired to UI** | -- | -- | -- | ✓ | ✓ | -- | -- |
| **IMPORTANT: RSC + Privy auth gap** | -- | ✓ | ✓ | -- | -- | -- | -- |

---

## Conflicts

No genuine conflicts were detected. All reviewers agree on the direction of fixes; differences are limited to:
- **Severity calibration:** gemini-3-flash-1 and gemini-3-flash-2 rated several issues lower severity than other reviewers (e.g., auth context as IMPORTANT rather than CRITICAL; duplicate routers not flagged). The higher severity from the cross-model consensus is used per synthesis rules.
- **Scope of coverage:** gemini-3-flash-1 and gemini-3-flash-2 provided less granular findings overall but did not contradict any specific finding from other reviewers.

No cases of mutually exclusive fix proposals or opposing conclusions were identified.

---

<!-- VERDICT_START -->
verdict:
  schema_version: 1
  type: plan
  decision: BLOCK
  timestamp: "20260406-192500"
  round_dir: "/Users/bmschwartz/Development/attestly/docs/superpowers/plans/reviews/20260406-185130/"
  findings:
    critical: 8
    important: 12
    minor: 6
    potential: 4
  agreements:
    strong: 14
    moderate: 6
    single: 10
  conflicts:
    detected: 0
    resolved: 0
    unresolved: 0
  reviewers:
    total: 8
    succeeded: 7
    failed: 0
    models: [opus-internal, composer-2-fast, gpt-5.4-medium-fast, gemini-3-flash]
  human_input_required:
    count: 5
    items:
      - id: "NI-1"
        title: "RSC + Privy authentication strategy"
        severity: CRITICAL
      - id: "NI-2"
        title: "Invite-only enforcement timing"
        severity: IMPORTANT
      - id: "NI-3"
        title: "Plan 2c size -- split into sub-plans"
        severity: IMPORTANT
      - id: "NI-4"
        title: "AI provider inconsistency (Gemini vs Claude)"
        severity: IMPORTANT
      - id: "NI-5"
        title: "Plan 1a missing datasource URL"
        severity: IMPORTANT
  previously_addressed: 0
<!-- VERDICT_END -->
