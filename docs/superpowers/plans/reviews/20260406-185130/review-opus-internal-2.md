# Internal Reviewer 2 (Opus)

## Finding 1: ctx.session.user.id vs ctx.userId Inconsistency
**Severity: CRITICAL**

Plan 1b rewrites trpc.ts to use Privy, attaching ctx.userId and ctx.walletAddress. However, these plans use the OLD ctx.session.user.id pattern:
- Plan 2a (Survey CRUD): ctx.session.user.id throughout
- Plan 2e (Confirmation): ctx.session.user.id
- Plan 3a (Results API): ctx.session?.user?.id
- Plan 3d (Invite System): ctx.session.user.id
- Plan 3f (Admin): ctx.user.isAdmin

Plans that correctly use ctx.userId: 2b, 3c, 4b, 4c, 4d.

Every plan referencing ctx.session.user.id will produce compile errors after Plan 1b executes.

## Finding 2: ctx.user.isAdmin Does Not Exist
**Severity: CRITICAL**

Plan 3f (Admin) references ctx.user.isAdmin. The auth middleware from 1b only provides ctx.userId and ctx.walletAddress. Admin router needs to fetch user record from DB to check isAdmin, or middleware needs extending.

## Finding 3: Plans 2a and 3c Both Create survey.ts From Scratch
**Severity: CRITICAL**

Both define overlapping but incompatible procedures. Plan 2a: create, update, getForEdit, getBySlug, publish, deleteDraft, close, getStats, listMine. Plan 3c: getStats, listMine, create, deleteDraft, close. Different input schemas and context access patterns. Whichever executes second overwrites or conflicts.

## Finding 4: Plans 2d and 2e Both Create response.ts From Scratch
**Severity: CRITICAL**

Plan 2d creates response.ts with start, saveAnswer, submit, clear. Plan 2e creates response.ts with getConfirmation, listMine — as a complete replacement that does NOT include Plan 2d's procedures. Executing 2e after 2d destroys core functionality.

## Finding 5: Plan 3d Uses AUTH_SECRET in env.js
**Severity: IMPORTANT**

Plan 3d shows env.js still containing AUTH_SECRET, contradicting Plan 1b which removes it.

## Finding 6: Plan 2c Uses auth() From NextAuth
**Severity: IMPORTANT**

Plan 2c imports auth from ~/server/auth and redirects to /api/auth/signin — both NextAuth-specific, won't exist after Plan 1b.

## Finding 7: Multiple Plans Overwrite root.ts Instead of Appending
**Severity: IMPORTANT**

Plans 1b, 2e, 3a, 3c each provide "replace entire root.ts" instructions, each including only routers known at that plan's writing time. Sequential execution destroys previously registered routers.

## Finding 8: Plan 3e Uses array_contains for JSON Category Filtering
**Severity: IMPORTANT**

categories is Json type, not native PostgreSQL array. Prisma's array_contains doesn't work on Json columns. Query will fail at runtime.

## Finding 9: Plan 4b Job Handler Registration Conflicts With 4a
**Severity: IMPORTANT**

Plan 4a creates handlers.ts as flat file with Map registry. Plan 4b creates handlers/generate-ai-summary.ts in a subdirectory. Architecture mismatch.

## Finding 10: Plan 4c References survey.listMine Without Dependency
**Severity: IMPORTANT**

Dependency graph shows 4c -> 4b -> 4a -> 1c but not 3c or 2a where listMine is defined.

## Finding 11: getBySlug Missing walletAddress on Creator Select
**Severity: MINOR**

Plan 2a's getBySlug select for creator includes {id, displayName, avatar} but Plan 2d's landing page renders creator.walletAddress.

## Finding 12: Plan 2c References Nonexistent isPremium
**Severity: MINOR**

useSurveyBuilder hook never defines isPremium, but builder UI passes it to SurveyMetadataForm. Plan 4d adds premium checks later.

## Finding 13: AiSummary @@unique With NULL questionId
**Severity: MINOR**

PostgreSQL NULLs are distinct in unique constraints. Partial index in Task 8 handles it, but Prisma upsert won't work as expected for NULL questionId.

## Finding 14: Public Procedures Need Optional Auth
**Severity: IMPORTANT**

Plans 3a and 3d use ctx.session?.user?.id in public procedures. After 1b, session won't exist on public procedures. Need optionalProtectedProcedure or manual token extraction.

## Finding 15: Plan 2c Is Very Large
**Severity: POTENTIAL**

16 files, 11+ React components. May exceed single agent session capacity.

## Finding 16: No Shared verifyCreatorOwnership Helper
**Severity: POTENTIAL**

Plans 2a, 2b, 3d each define inline ownership verification. Could share a common utility.

## Finding 17: Good Design Decisions
**Severity: GOOD**

- Dependency graph well-structured and mostly acyclic
- Partial unique indexes handled correctly
- Seed data is practical
- Worker pattern is production-appropriate
- Premium gating as final pass is clean

## Prioritized Recommendations

1. **[CRITICAL] Fix ctx.session.user.id → ctx.userId** across Plans 2a, 2e, 3a, 3d, 3f. Compile-blocking. Affects 5 plans.
2. **[CRITICAL] Resolve duplicate file creation** — Plans 2a/3c (survey.ts) and 2d/2e (response.ts). Merge or make additive.
3. **[IMPORTANT] Change root.ts from replace to append** — Each plan should add its router incrementally.
4. **[CRITICAL] Add isAdmin to auth context** or document DB fetch pattern for admin procedures.
5. **[IMPORTANT] Fix public procedures needing optional auth** — Create optionalProtectedProcedure.
6. **[IMPORTANT] Fix JSON categories filtering** in Plan 3e.
7. **[MINOR] Add walletAddress to getBySlug creator select** in Plan 2a.
8. **[IMPORTANT] Remove NextAuth auth() from Plan 2c**, use AuthGuard/Privy hooks.
9. **[IMPORTANT] Remove AUTH_SECRET from Plan 3d** env.js snippet.
10. **[POTENTIAL] Consider splitting Plan 2c** into smaller sub-plans.
