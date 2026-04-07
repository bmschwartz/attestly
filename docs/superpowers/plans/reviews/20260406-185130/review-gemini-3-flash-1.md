I have completed a comprehensive review of the 18 implementation plans for Attestly Phase 1. My analysis included reading all 19 plan files (including the master `PLAN.md`), cross-referencing them with the 8 design specification files, and verifying the current state of the scaffolded T3 Stack codebase.

Overall, the plans are **exceptionally well-structured**, following a logical dependency graph that builds the platform from the database layer up to advanced AI features. The use of subagent-driven development patterns (checkboxes, clear file structures, and task-by-task instructions) makes them highly actionable.

However, I identified several **CRITICAL** and **IMPORTANT** issues that must be addressed to ensure the code compiles and functions consistently across the 18-plan sequence.

---

### 1. Completeness
**Rating: IMPORTANT**

*   **Missing `survey.getForResponse` (IMPORTANT):** Plan 2d (Survey Landing & Response) mentions `survey.getForResponse` in its tRPC procedure table but never defines it in the task steps. This procedure is essential for fetching the survey questions for a respondent while enforcing invite-only access.
*   **Missing Background Job Handlers (IMPORTANT):** Plan 4a (Background Jobs) creates a infrastructure but only registers "placeholder" handlers. While Plan 4b (AI Summaries) implements the `GENERATE_AI_SUMMARY` handler, the `SEND_EMAIL` handler (critical for Plan 3d's invite system and survey closure) is never fully implemented in any plan.
*   **Missing `invite.check` in Respondent Flow (MINOR):** Plan 2d mentions checking `invite.check` for invite-only surveys but doesn't explicitly show the implementation of that gate in the `SurveyRespondPage`.

### 2. Correctness
**Rating: CRITICAL**

*   **Prisma Client Import Paths (CRITICAL):** Multiple plans (1a, 9, 15) reference imports from `~/generated/prisma`. However, the standard T3 Stack and Plan 1a's own schema configuration output the client to `node_modules/.prisma/client` (accessed via `@prisma/client`). Importing from `~/generated/prisma` will cause compilation failures unless a custom alias and output path are perfectly synchronized, which is prone to error.
*   **Next.js 16 `params` Type (IMPORTANT):** Plans 1c and 2d correctly identify that `params` in Next.js 16 are `Promise` objects. However, some code blocks (e.g., Plan 2c's `SurveyBuilderPage`) might need more explicit handling of this async pattern to avoid TypeScript errors during the transition from scaffolded code.
*   **Zod Native Enums (MINOR):** Plan 2b uses `z.nativeEnum(QuestionType)` before the Prisma client has been generated in that specific agent session, which might cause temporary type errors during development.

### 3. Architecture
**Rating: GOOD**

*   **Dependency Graph (GOOD):** The ordering in `PLAN.md` is sound. Building the schema (1a) and auth (1b) first provides the necessary foundation for all subsequent features.
*   **Separation of Concerns (GOOD):** The split between `surveyRouter`, `questionRouter`, `responseRouter`, and `resultsRouter` is clean and prevents any single file from becoming a "mega-router."
*   **Hybrid Client/Server Rendering (GOOD):** The plans make good use of RSCs for initial data fetching/prefetching while using Client Components for interactive forms and real-time previews.

### 4. TDD Structure
**Rating: GOOD**

*   **Vitest Integration (GOOD):** Plan 2a correctly introduces Vitest and provides a robust mock for Prisma. This establishes a testing pattern that other plans follow.
*   **Verification Checklists (GOOD):** Every sub-plan includes a detailed verification checklist, which is critical for ensuring each "agent session" actually meets the requirements.

### 5. Cross-Plan Consistency
**Rating: CRITICAL**

*   **Auth Context Inconsistency (CRITICAL):**
    *   **Plan 1b (Auth Migration)** defines the tRPC context with `userId` and `walletAddress`.
    *   **Plan 2a (Survey CRUD)** and **Plan 2c (Survey Builder)** frequently use `ctx.session.user.id`.
    *   **Plan 2b (Question CRUD)** uses `ctx.userId`.
    *   **This will cause immediate compilation failures.** All plans must be updated to use a single consistent context shape (ideally `ctx.userId` as defined in the core auth migration plan 1b).
*   **Duplicate Router Definitions (IMPORTANT):** Both Plan 2d and Plan 2e attempt to "Create" `src/server/api/routers/response.ts`. Plan 2e should be an "Update" to the file created in 2d.
*   **Inconsistent Model Field References (MINOR):** Plan 1a defines `User.privyId`, but some later plans (like the auth middleware in 1b) need to be extremely careful about mapping the Privy DID to this field.

### 6. Risk
**Rating: POTENTIAL**

*   **Plan 2c (Survey Builder UI) Size (POTENTIAL):** This plan is very large (14 tasks, dozens of components). It risks exceeding the context window or "reasoning limit" of a single agent session. It might be safer to split this into "Builder Infrastructure" and "Question Type Components."
*   **Resend Domain Verification (MINOR):** Plan 3d assumes `noreply@attestly.com` will work immediately. In reality, Resend requires domain verification. The plan should mention using the Resend testing domain (`onboarding@resend.dev`) for initial development.

---

## Prioritized Recommendations

1.  **CRITICAL: Standardize Auth Context:** Update all tRPC procedures in Plans 2a, 2c, 3a, 3c, 3f, 4b, 4c, and 4d to use `ctx.userId` instead of `ctx.session.user.id`. This is the most frequent source of potential failure.
2.  **CRITICAL: Fix Prisma Import Paths:** Update all plans to import from `@prisma/client` instead of `~/generated/prisma` to match standard T3/Prisma patterns and ensure the generated types are found.
3.  **IMPORTANT: Implement `survey.getForResponse`:** Add a task to Plan 2d to implement this query. It must fetch the survey and its questions, and if `accessMode === 'INVITE_ONLY'`, it must call the `invite.check` logic.
4.  **IMPORTANT: Implement `SEND_EMAIL` Handler:** Add a "Task 0" to Plan 3d (Invite System) to implement the actual `SEND_EMAIL` background job handler in `src/server/jobs/handlers.ts` so that invites actually send.
5.  **IMPORTANT: Fix Router File Collisions:** Update Plan 2e to "Modify" `response.ts` instead of "Create" it, ensuring it appends its procedures to the ones created in 2d.
6.  **MINOR: Split Plan 2c:** Consider breaking the Survey Builder UI into two sub-plans (e.g., 2c-1: Shell & Metadata, 2c-2: Question Editors & Preview) to ensure high-quality implementation by agents.
7.  **MINOR: Update `package.json` in Plan 1a:** Ensure `tsx` is added to `devDependencies` in the first plan so the seed script works immediately. (Plan 1a currently lists it in Task 9, but it's better to be explicit).
