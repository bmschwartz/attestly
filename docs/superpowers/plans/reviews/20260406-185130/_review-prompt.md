Review the implementation plan documents in this workspace. Read every file thoroughly before beginning your analysis.

## Excluded Directories
Do not explore or reference code in these directories: .claude/worktrees
They contain unrelated code from other work-in-progress branches.

The implementation plans are located in `docs/superpowers/plans/`. Start by reading `PLAN.md` which provides the master index, dependency graph, and links to all 18 sub-plans. Read ALL 19 files.

The design specifications that these plans implement are in `docs/superpowers/specs/`. Read `docs/superpowers/specs/PLAN.md` (the specs index) for context on what the plans should accomplish. Reference individual spec files as needed to verify plan accuracy.

## Codebase Verification (CRITICAL)

You have access to the actual project codebase. The codebase is a fresh T3 Stack scaffold (create-t3-app) with no domain logic implemented yet — empty Prisma schema, empty tRPC routers, NextAuth configured but with no providers. Verify any claims the plans make about existing code patterns.

Key files to verify against:
- `prisma/schema.prisma` — currently empty, plan 1a creates the full schema
- `src/server/api/trpc.ts` — current tRPC setup with publicProcedure/protectedProcedure
- `src/server/api/root.ts` — current empty router
- `src/app/layout.tsx` — current root layout
- `package.json` — current dependencies and scripts
- `src/env.js` — current environment variable validation

## Evaluation Dimensions

### 1. Completeness
- Does each plan cover everything specified in its corresponding spec?
- Are there gaps between plans (e.g., a procedure referenced in plan X but never defined)?
- Do the 18 plans together cover the full Phase 1 spec?
- Are there missing error handling steps, edge cases, or validation?

### 2. Correctness
- Do code blocks compile? Are tRPC procedure signatures consistent across plans?
- Do Prisma queries reference the correct model names and field names from plan 1a?
- Are import paths correct for the Next.js App Router structure?
- Do React components use correct props and event handlers?
- Are Zod schemas consistent with the data model?

### 3. Architecture
- Does the dependency order (shown in PLAN.md) make sense?
- Can each plan be implemented independently given its prerequisites?
- Are shared components properly extracted and referenced?
- Is the file structure clean and well-organized?

### 4. TDD Structure
- Do plans include test steps where appropriate?
- Are verification checklists comprehensive?
- Can each task be verified independently?

### 5. Dependencies & Ordering
- Are there circular dependencies between plans?
- Does each plan correctly assume what its prerequisites provide?
- Are tRPC router registrations in root.ts handled consistently across plans?

### 6. Cross-Plan Consistency
- Do multiple plans reference the same tRPC procedure with the same signature?
- Are component names consistent (e.g., SurveyCard used in both dashboard and explore)?
- Do auth context references (ctx.userId, ctx.user.isAdmin) match across plans?
- Are Prisma model names and field references consistent?

### 7. Risk
- Which plans are most likely to need rework?
- Are there plans that are too large for a single agent session?
- Are there tasks that require more context than the plan provides?

## Severity Definitions

- **CRITICAL**: Code that won't compile, missing steps that block implementation, wrong function signatures that would cause cascading failures across plans
- **IMPORTANT**: Inconsistencies between plans, missing edge cases, architectural concerns that would require rework
- **MINOR**: Style improvements, nice-to-haves, or low-impact optimizations
- **POTENTIAL**: Low-confidence concerns — flagged for human judgment

## Output Format

For each dimension:
- Severity-tagged rating: CRITICAL / IMPORTANT / MINOR / POTENTIAL / GOOD
- Cite specific files, plan numbers, and code blocks
- Concrete, actionable suggestions

Finish with a **Prioritized Recommendations** section: numbered list ordered by impact, tagged with severity.
