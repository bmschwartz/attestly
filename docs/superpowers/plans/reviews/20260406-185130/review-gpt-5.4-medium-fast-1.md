I read all 19 plan files in `docs/superpowers/plans/`, the specs index at `docs/superpowers/specs/SPEC.md` plus the relevant individual specs, and I verified the claims against the current scaffold. The biggest problem is that the plan set is not internally coherent yet: it mixes two incompatible auth/context models, redefines shared routers in later plans, and contains a few code blocks that will fail against the actual scaffold immediately.

Current scaffold evidence that drives several of the findings:

```29:36:src/server/api/trpc.ts
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return {
    db,
    session,
    ...opts,
  };
};
```

```27:30:tsconfig.json
"paths": {
  "~/*": ["./src/*"]
}
```

```1:3:src/server/db.ts
import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";
```

```4:11:prisma/schema.prisma
generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
}

datasource db {
    provider = "postgresql"
}
```

## Completeness
**Rating: CRITICAL**

- `CRITICAL`: `2026-04-06-2d-survey-response.md` does not fully specify the main response page. Task 4 leaves `src/app/s/[slug]/respond/page.tsx` as a stub and tells the implementer to build the real page later. That means the plan is not independently executable.
- `CRITICAL`: The spec in `2026-04-05-respondent-experience-design.md` includes `survey.getForResponse`, but no plan actually defines that procedure. That leaves a gap around protected survey loading, invite-only checks, resume behavior, and redirect logic.
- `IMPORTANT`: `2026-04-06-3b-results-ui.md` and `2026-04-06-3c-creator-dashboard.md` never complete the creator real-time results flow promised by `2026-04-05-results-analytics-design.md`. `3a` adds `results.getForCreator`, but `3b` only uses `results.getBySurvey`, and `3c` links published surveys to `/s/[slug]/results`, which stays closed to non-creators until the survey is closed.
- `IMPORTANT`: `2026-04-06-3c-creator-dashboard.md` says invite management exists, but its `SurveyCard` never exposes a `Manage Invites` action. `2026-04-06-3d-invite-system.md` creates `InviteManagementPanel`, but never wires it into the dashboard.
- `IMPORTANT`: `2026-04-06-4b-ai-summaries.md` claims to “display on the results page” but never actually updates the results page to fetch or render summaries. It creates services/components, but not the integration.
- `IMPORTANT`: `2026-04-06-3e-explore-page.md` misses several items required by `2026-04-05-public-survey-discovery-design.md`: search across tags, debounced search, clear/reset UX, and paginated “load more” browsing.
- `MINOR`: `2026-04-06-2e-confirmation-my-responses.md` omits the survey hash from the confirmation proof section even though the respondent spec calls for it.

## Correctness
**Rating: CRITICAL**

- `CRITICAL`: Auth context is inconsistent across plans. `2026-04-06-1b-auth-migration.md` changes protected procedures to `ctx.userId` / `ctx.walletAddress`, but `2026-04-06-2a-survey-crud.md`, `2e`, `3a`, and `3d` still use `ctx.session.user.id`, while `3f` and `4d` use `ctx.user.isAdmin`. Those code blocks will not compile together.
- `CRITICAL`: Prisma client import paths are wrong in multiple plans. `2026-04-06-2b-question-crud.md`, `4b-ai-summaries.md`, `4c-ai-chat.md`, and `4d-premium-gating.md` use `~/generated/prisma`, but `~` maps to `src/*`, and this repo’s Prisma client lives at repo-root `generated/prisma`.
- `CRITICAL`: `2026-04-06-2c-survey-builder-ui.md` contains concrete procedure-call bugs in `useAutoSave.ts`: `survey.update` sends `id: builder.survey.title`, `question.upsert` sends `id` instead of `questionId`, and `question.delete` sends `{ id }` even though `2026-04-06-2b-question-crud.md` defines `{ questionId }`.
- `CRITICAL`: `2026-04-06-2d-survey-response.md` does not enforce invite-only access on the server. `response.start` reads `accessMode` but never checks it, so a direct mutation can bypass invite restrictions. The spec requires the access check after auth.
- `CRITICAL`: `2026-04-06-4b-ai-summaries.md` and `2026-04-06-4c-ai-chat.md` both load `question.answers` directly, which would include answers from `IN_PROGRESS` or soft-deleted responses. That violates the results spec, which consistently says only `SUBMITTED` responses with `deletedAt = null` count.
- `CRITICAL`: `2026-04-06-1a-prisma-schema.md` assumes the scaffolded Prisma schema already parses, but the current `prisma/schema.prisma` is missing a datasource `url`. Its early `pnpm prisma format` verification step will fail before any model work unless the plan first restores the scaffold basics.
- `IMPORTANT`: `2026-04-06-4c-ai-chat.md` only premium-gates `createSession`. `getSession`, `listSessions`, `renameSession`, `deleteSession`, and `chat` are not premium-gated, which conflicts with the downgrade and premium-access rules.
- `IMPORTANT`: `2026-04-06-4c-ai-chat.md` also never verifies that the session’s `surveyId` or `surveyIds` belong to the creator, so a premium user could potentially chat against arbitrary survey IDs.
- `IMPORTANT`: `2026-04-06-3f-profiles-settings-admin.md`’s settings page is not actually implementable as written: it calls `api.user.getProfile.useQuery({ userId: "" }, { enabled: false })` and never replaces the empty ID.
- `IMPORTANT`: `2026-04-06-3e-explore-page.md` search only covers title and description, but the spec explicitly requires search across tags too.
- `POTENTIAL`: `2026-04-06-3e-explore-page.md` uses a `Json` filter shape for categories that may not match Prisma’s actual Postgres JSON filter API. That needs a compile check before implementation starts.

## Architecture
**Rating: IMPORTANT**

- `GOOD`: The high-level dependency graph in `docs/superpowers/plans/PLAN.md` is sensible: schema/auth/app shell first, then CRUD, then UIs, then AI/premium.
- `IMPORTANT`: Several later plans redefine the same core files instead of extending them. `2026-04-06-2d-survey-response.md` and `2e` both define `src/server/api/routers/response.ts`. `2026-04-06-2a-survey-crud.md` and `3c-creator-dashboard.md` both redefine `src/server/api/routers/survey.ts`.
- `IMPORTANT`: `2026-04-06-4b-ai-summaries.md` assumes handler registration happens inside `worker.ts`, but `2026-04-06-4a-background-jobs.md` establishes `src/server/jobs/handlers.ts` as the registry. Those plans are architecturally at odds.
- `IMPORTANT`: `2026-04-06-3c-creator-dashboard.md` and `3d-invite-system.md` split one user-facing dashboard feature across plans without a stable seam. The panel exists in `3d`, but the dashboard action that opens it is missing in `3c`.

## TDD Structure
**Rating: IMPORTANT**

- `GOOD`: `2026-04-06-2a-survey-crud.md` and `2026-04-06-4a-background-jobs.md` at least include real unit-test work rather than only manual smoke tests.
- `IMPORTANT`: The riskiest plans rely mostly on manual verification: `2d`, `3d`, `3e`, `3f`, `4b`, and `4c`. That is thin coverage for auth gates, access-control rules, and async job orchestration.
- `IMPORTANT`: `2026-04-06-4a-background-jobs.md` promises `src/server/jobs/__tests__/worker.test.ts` in the file structure, but never actually defines it in the task list.
- `IMPORTANT`: `2026-04-06-2d-survey-response.md` cannot be independently verified because the key response page implementation is deferred to “the implementer subagent should build this out fully.”
- `MINOR`: Many verification checklists are broad but not regression-focused. The plans that touch cross-plan contracts should have explicit “root router still contains X/Y/Z” checks.

## Dependencies & Ordering
**Rating: CRITICAL**

- `CRITICAL`: `2026-04-06-2d-survey-response.md` depends on `invite.check`, but `invite.check` is only introduced in `2026-04-06-3d-invite-system.md`, which comes later in the graph.
- `CRITICAL`: `2026-04-06-2e-confirmation-my-responses.md` replaces `response.ts` and `root.ts`, which would wipe out the `response.start`, `saveAnswer`, `submit`, and `clear` work from `2d` unless the implementer manually merges.
- `CRITICAL`: `2026-04-06-3c-creator-dashboard.md` starts by recreating `survey.ts` and narrowing `root.ts`, which would partially undo `2a` unless someone notices the conflict.
- `IMPORTANT`: `2026-04-06-4d-premium-gating.md` duplicates `user.getSubscription`, which is already present in `2026-04-06-3f-profiles-settings-admin.md`.
- `IMPORTANT`: The route and API ordering around results is off. `3a` introduces creator real-time results, but `3b` and `3c` do not actually depend on or consume that variant.

## Cross-Plan Consistency
**Rating: CRITICAL**

- `CRITICAL`: Three incompatible auth conventions exist across the plan set: `ctx.session.user.id`, `ctx.userId`, and `ctx.user.isAdmin`.
- `CRITICAL`: `survey.close` and `survey.deleteDraft` use conflicting input contracts. `2026-04-06-2a-survey-crud.md` defines `{ id }`, but `2026-04-06-3c-creator-dashboard.md` and `2026-04-06-4b-ai-summaries.md` call them as `{ surveyId }`.
- `CRITICAL`: Publish redirects are inconsistent inside `2026-04-06-2c-survey-builder-ui.md`. `PublishDialog` pushes to `/surveys/${surveyId}`, while `useSurveyBuilder` pushes to `/s/${survey.slug}`.
- `IMPORTANT`: `docs/superpowers/plans/PLAN.md` and `2026-04-06-4d-premium-gating.md` reference `specs/INDEX.md`, but the real index file is `docs/superpowers/specs/SPEC.md`.
- `IMPORTANT`: `2026-04-06-3c-creator-dashboard.md` points published “View Results” to `/s/[slug]/results`, but `2026-04-06-3b-results-ui.md` only uses `results.getBySurvey`, so the UI does not match the `3a` API contract for creator real-time access.
- `MINOR`: The plan set flips between “replace entire file” and additive updates for shared files like `root.ts`, which makes merge expectations inconsistent.

## Risk
**Rating: IMPORTANT**

- `CRITICAL`: `2026-04-06-2c-survey-builder-ui.md`, `3d-invite-system.md`, `4b-ai-summaries.md`, and `4c-ai-chat.md` are the most likely to need rework. They are either too large for a single clean pass or contain unresolved contract gaps.
- `IMPORTANT`: `2026-04-06-1a-prisma-schema.md` is risky because it assumes a healthier Prisma starting point than the repo actually has.
- `IMPORTANT`: `2026-04-06-4c-ai-chat.md` is high-risk because the spec calls for streaming, strict creator scoping, and downgrade-aware gating, but the plan only partially addresses those.
- `POTENTIAL`: The specs themselves need one reconciliation pass before implementation. `docs/superpowers/specs/SPEC.md` frames Gemini as the likely provider, while `2026-04-05-ai-insights-design.md` later says “Use the Claude API.” `SPEC.md` also mentions a 15-minute stale-job alert that `4a` does not plan.
- `MINOR`: `2026-04-06-4a-background-jobs.md` uses `timeout` in shell examples, which is not a standard macOS command in this environment.

## Prioritized Recommendations
1. `CRITICAL` Rewrite the plan set around one canonical auth context contract. Decide whether all post-`1b` procedures use `ctx.userId` plus optional `ctx.isAdmin`, then update `2a`, `2e`, `3a`, `3d`, `3f`, and `4d` to match.
2. `CRITICAL` Stop replacing shared router files in later plans. Convert every `root.ts`, `survey.ts`, and `response.ts` instruction to additive merges, and make `2e` explicitly extend `2d` instead of redefining it.
3. `CRITICAL` Fix hard compile/runtime errors before implementation starts: Prisma import paths, `2c` autosave mutation payloads, `1a`’s missing datasource `url` assumption, and the `id` vs `surveyId` procedure contract mismatch.
4. `CRITICAL` Add server-side access control where the specs require it: invite-only enforcement in `response.start`, creator ownership checks for AI chat/session survey IDs, and premium gating on all AI session procedures.
5. `IMPORTANT` Fill the major completeness gaps: add `survey.getForResponse`, fully specify `2d`’s response page, wire `3a`’s `getForCreator` into `3b`/`3c`, and connect `3d`’s invite panel to dashboard cards.
6. `IMPORTANT` Reconcile the docs/spec references and cross-cutting rules in one pass: `SPEC.md` vs `INDEX.md`, Gemini vs Claude, and the stale-job alert semantics.
7. `IMPORTANT` Add focused tests for the highest-risk behaviors: invite-only access, premium downgrade gating, creator-only AI access, results visibility, and background job retry/claim behavior.
