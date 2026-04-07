I read all 19 plan files under `docs/superpowers/plans/`, the actual specs index at `docs/superpowers/specs/SPEC.md`, the relevant detailed specs, and verified claims against the current scaffolded codebase. The repo state matches your description: the Prisma schema is still basically empty, auth is still NextAuth/session-based, the root router is empty, and the tRPC client is not yet forwarding auth tokens.

```4:11:prisma/schema.prisma
generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
}

datasource db {
    provider = "postgresql"
}
```

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

```52:59:src/trpc/react.tsx
headers: () => {
  const headers = new Headers();
  headers.set("x-trpc-source", "nextjs-react");
  return headers;
},
```

## Completeness — CRITICAL
- `2d` is not actually complete enough to implement the respondent flow. The respondent spec requires `survey.getForResponse`, redirects for existing `IN_PROGRESS` / `SUBMITTED` responses, and a full response page. The plan never defines `survey.getForResponse`, and the main page is left as a placeholder instead of a real implementation.

```518:539:docs/superpowers/plans/2026-04-06-2d-survey-response.md
export default function SurveyRespondPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Implementation: fetch survey, start/resume response, render questions,
  // auto-save answers, handle submit.
  // Full implementation follows the patterns from the input components above.

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p>Response form — implementation in this task</p>
    </main>
  );
}
```

- `2e` replaces `src/server/api/routers/response.ts` with only `getConfirmation` and `listMine`, so following the plans literally would delete `start`, `saveAnswer`, `submit`, and `clear` from `2d`. That is a hard cross-plan completeness failure.
- `3c` does not cover everything in the creator dashboard spec. The spec calls for a mini-chart on published cards, a “Manage Invites” action for invite-only surveys, and creator real-time results via `results.getForCreator`; the plan’s published card omits those behaviors.
- `4b` says “integrate with results page,” but the task list never actually modifies `src/app/s/[slug]/results/page.tsx` or `QuestionResultsList` to render summaries. The feature is only half-planned.
- `3e` only partially covers discovery: it misses tag search, debounced search behavior, clear/reset UX, and load-more/infinite-scroll behavior described in the discovery spec.

## Correctness — CRITICAL
- The biggest compile/runtime blocker is auth-context drift. `1b` rewrites auth around `ctx.userId` / `ctx.walletAddress`, but many later plans still use `ctx.session.user.id` or even `ctx.user.isAdmin`. Those cannot all compile together.

```542:619:docs/superpowers/plans/2026-04-06-1b-auth-migration.md
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.headers.get("authorization");
  // ...
  return next({
    ctx: {
      userId: user.id,
      walletAddress: user.walletAddress,
    },
  });
});
```

```150:156:docs/superpowers/plans/2026-04-06-2a-survey-crud.md
const survey = await ctx.db.survey.create({
  data: {
    creatorId: ctx.session.user.id,
    title: input.title,
    description: "",
```

```408:429:docs/superpowers/plans/2026-04-06-3f-profiles-settings-admin.md
export const adminRouter = createTRPCRouter({
  searchSurveys: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.isAdmin);
```

- `1a` does not account for the current `prisma/schema.prisma` missing `url = env("DATABASE_URL")`. Because the plan only appends models/enums after the existing datasource block, `pnpm db:push` and later Prisma commands would still fail on the fresh scaffold unless the datasource is fixed first.
- Several plans use Prisma client import paths that do not match the current repo layout. The generated client lives at `generated/prisma`, not under `src`, so imports like `~/generated/prisma` in `2b`, `4b`, and `4d` are wrong for this workspace.
- `2c` has multiple concrete payload bugs in `useAutoSave`: it sends the survey title as the survey ID, sends `question.id` as `surveyId`, and calls `question.delete` with `{ id }` even though `2b` defines `{ questionId }`.

```740:783:docs/superpowers/plans/2026-04-06-2c-survey-builder-ui.md
promises.push(
  surveyUpdateMutation.mutateAsync({
    id: builder.survey.title, // This will be the survey ID passed through context
    title: builder.survey.title,
    // ...
  }),
);
// ...
promises.push(
  questionUpsertMutation.mutateAsync({
    id: question.id,
    surveyId: question.id, // Will be wired to actual survey ID
// ...
for (const prevId of prevQuestionIdsRef.current) {
  if (!currentIds.has(prevId)) {
    promises.push(questionDeleteMutation.mutateAsync({ id: prevId }));
  }
}
```

- `2c` also reintroduces deleted NextAuth primitives after `1b` removes them.

```281:295:docs/superpowers/plans/2026-04-06-2c-survey-builder-ui.md
import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
// ...
const session = await auth();
if (!session?.user) {
  redirect("/api/auth/signin");
}
```

- `4a`’s retry logic is incorrect: `failJob()` immediately resets retriable jobs back to `PENDING`, while `claimNextJob()` only claims `PENDING` jobs. That means a worker can instantly reclaim the same job and burn through retries before the intended backoff delay has elapsed.

## Architecture — CRITICAL
- The dependency graph in `plans/PLAN.md` looks sensible at a high level, but the actual file instructions do not preserve that graph. Multiple plans rewrite the same router files from scratch instead of extending them, so the architecture only works if the implementer manually notices and merges changes.
- `2a`, `2e`, and `3c` all treat core routers as if they are being introduced for the first time. That makes the “single agent session” assumption unrealistic for later plans because later tasks require careful manual reconciliation with prior ones.
- The strongest architecture pieces are `1a`’s broad upfront schema coverage and `3a`’s separation of aggregation helpers from access control, but those positives are outweighed by the repeated overwrite-style instructions.

## TDD Structure — IMPORTANT
- Some plans include useful tests, especially `2a` and `4a`, but the highest-risk plans are the ones with the weakest verification. `2d`, `3d`, `4b`, `4c`, and `4d` mostly rely on manual checks even though they contain the most stateful, integration-heavy behavior.
- `2a`’s tests are already misaligned with the auth migration because they mock `session`-based callers, so they would need rework as soon as `1b` lands.
- Several manual verification commands are not portable to the stated environment. The repo is on macOS, but plans like `4a` use GNU-style `timeout`, which is not present by default on macOS.
- The checklists are generally detailed, but they often verify the “happy path” and miss the exact cross-plan failure modes that are most likely here: router merge integrity, auth-context consistency, and procedure signature drift.

## Dependencies & Ordering — CRITICAL
- The `root.ts` instructions are the clearest ordering break. Later plans repeatedly replace the root router with a subset of routers, which would silently remove earlier registrations.

```809:822:docs/superpowers/plans/2026-04-06-2a-survey-crud.md
export const appRouter = createTRPCRouter({
  survey: surveyRouter,
});
```

```213:224:docs/superpowers/plans/2026-04-06-2e-confirmation-my-responses.md
export const appRouter = createTRPCRouter({
  response: responseRouter,
});
```

```83:96:docs/superpowers/plans/2026-04-06-3c-creator-dashboard.md
export const appRouter = createTRPCRouter({
  health: healthRouter,
  survey: surveyRouter,
});
```

- `2e` depends on `2d` but recreates `response.ts` from scratch instead of extending it.
- `3c` depends on `2a` but also recreates `survey.ts` from scratch, with different input shapes and narrower procedure coverage.
- `4b` depends on `4a`, but its handler-registration instructions target `worker.ts` instead of the registry pattern that `4a` actually introduced in `handlers.ts`.

```258:303:docs/superpowers/plans/2026-04-06-4a-background-jobs.md
const handlers = new Map<string, JobHandler>();
// ...
registerHandler("SEND_EMAIL", placeholderHandler("SEND_EMAIL"));
registerHandler(
  "GENERATE_AI_SUMMARY",
  placeholderHandler("GENERATE_AI_SUMMARY"),
);
```

```292:299:docs/superpowers/plans/2026-04-06-4b-ai-summaries.md
In `src/server/jobs/worker.ts`, import and register:
```typescript
import { handleGenerateAiSummary } from "./handlers/generate-ai-summary";
// In the handler map:
GENERATE_AI_SUMMARY: handleGenerateAiSummary,
```
```

## Cross-Plan Consistency — CRITICAL
- Auth context naming is inconsistent across `1b`, `2a`, `2e`, `3a`, `3d`, and `3f`.
- Procedure inputs drift across plans. `2a` defines `survey.deleteDraft({ id })` and `survey.close({ id })`, while `3c` uses `{ surveyId }` for both. That guarantees UI/API mismatch if both are followed literally.

```560:566:docs/superpowers/plans/2026-04-06-2a-survey-crud.md
deleteDraft: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
```

```314:318:docs/superpowers/plans/2026-04-06-3c-creator-dashboard.md
deleteDraft: protectedProcedure
  .input(z.object({ surveyId: z.string().uuid() }))
```

- `2b` defines `question.upsert` around `questionId`, but `2c` autosave sends `{ id, surveyId: question.id }`, so the two plans disagree on both field names and values.
- `3f` already adds `user.getSubscription` and `admin.setUserPlan`, while `4d` plans to add them again. That duplication is a rework trap rather than a clean prerequisite chain.
- There is also a documentation mismatch at the index level: `docs/superpowers/plans/PLAN.md` links to `../specs/INDEX.md`, and your prompt referenced `docs/superpowers/specs/PLAN.md`, but the actual specs index is `docs/superpowers/specs/SPEC.md`.

## Risk — IMPORTANT
- Highest rework risk: `2c`, `2d`, `3c`, `4b`, and `4c`. They are large, stateful, and currently rest on incorrect assumptions about auth, router composition, and available procedures.
- `2d` and `4c` are too large for a single clean agent session as currently written. Both include major UI, server logic, state management, and edge-case handling, but one is under-specified and the other omits streaming and ownership checks.
- `1b` has one lower-confidence but real risk: it assumes a specific Privy token retrieval mechanism in the client without grounding that choice in the current code or the spec. That may require implementation-time API research.
- The AI area has an external inconsistency in the specs themselves: `SPEC.md` frames Gemini as the leading candidate, while the detailed AI spec still says Claude. The plans chose Gemini, which is reasonable, but the spec set is not fully internally consistent there.

## Prioritized Recommendations
1. **[CRITICAL]** Rewrite the shared foundation assumptions first: standardize all post-`1b` plans on one auth context contract (`ctx.userId`, plus an explicit `ctx.user` shape if admin/subscription info is needed).
2. **[CRITICAL]** Replace every “rewrite `root.ts`” step with append-only router registration guidance, and audit all later plans for router/file replacement that would clobber earlier work.
3. **[CRITICAL]** Split `2d` into a real API plan and a real UI plan, and add the missing `survey.getForResponse` procedure plus resume/submitted redirect handling from the respondent spec.
4. **[CRITICAL]** Fix `2c` before anyone implements it: remove deleted NextAuth references, pass real survey/question IDs, and align autosave payloads with `2b`’s procedure signatures.
5. **[IMPORTANT]** Consolidate `survey.ts`, `response.ts`, `user.ts`, and `admin.ts` ownership so later plans extend earlier routers instead of redefining them.
6. **[IMPORTANT]** Bring discovery, dashboard, and AI plans back into spec alignment by adding missing behaviors: tag search, manage-invites wiring, creator real-time results path, summary rendering on results, and streaming chat.
7. **[IMPORTANT]** Fix verification strategy on the risky plans: add focused automated tests for respondent flow, invite checks, premium gating, and AI access control; remove/macOS-fix commands like `timeout`.
8. **[MINOR]** Clean up documentation path errors so the master plan and premium plan point to the real specs index file and implementers do not start from broken links.

If you want, I can turn this into a plan-by-plan punch list next, with one short corrective action list for each of the 18 sub-plans.
