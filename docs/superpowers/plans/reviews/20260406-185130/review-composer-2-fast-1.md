
Here is a structured review based on reading all 19 plan files (`docs/superpowers/plans/PLAN.md` + 18 sub-plans), the specs index (`docs/superpowers/specs/SPEC.md` — there is no `specs/PLAN.md` or `specs/INDEX.md` in the repo; the master plan links to `../specs/INDEX.md`, which is a broken path), and the current codebase.

**Codebase verification (key files)**  
- `prisma/schema.prisma`: Only generator, datasource stub — no models (matches “empty schema”; plan 1a is meant to add everything).  
- `src/server/api/trpc.ts`: T3 default — `createTRPCContext` uses `auth()` from `~/server/auth`; `publicProcedure` / `protectedProcedure` with `ctx.session.user` (plan 1b intends to replace this).  
- `src/server/api/root.ts`: Empty `createTRPCRouter({})`.  
- `src/app/layout.tsx`: `TRPCReactProvider` only — no `Navbar` / `PrivyProvider` yet.  
- `package.json`: NextAuth absent from deps in the listing you have is wrong — current file still has `next-auth` and `@auth/prisma-adapter` (plan 1b is aligned with “migrate away,” not with today’s tree). Note `"db:generate": "prisma migrate dev"` is unusual (often `prisma generate`); plan 1a uses `db:push` / `migrate` explicitly.  
- `src/env.js`: `AUTH_SECRET`, `DATABASE_URL`, no Privy vars yet.  
- `src/server/db.ts`: Imports `PrismaClient` from `../../generated/prisma` (root-level `generated/`). `tsconfig.json` maps `~/*` → `./src/*` only — there is **no** `~/generated/prisma` under `src/`.

---

### 1. Completeness  
**Rating: IMPORTANT (with CRITICAL gaps in Phase 2–3 merge)**

- **Phase 1 breadth:** The 18 plans cover the SPEC.md “Survey Platform” slice (auth, model, builder, respondent flow, results, dashboard, discovery, AI, premium) in outline form.  
- **Hard merges missing from the written plans:**  
  - **2d** and **2e** both define `src/server/api/routers/response.ts` for different procedure sets. **2e** even says “create” the file with `getConfirmation` / `listMine`, which would **wipe** **2d**’s `start` / `saveAnswer` / `submit` / `clear` unless an editor merges by hand — not spelled out.  
  - **3c Task 1** instructs **creating** `survey.ts` with only `getStats` and **replacing `root.ts`** with `health` + `survey`, which **collides with 2a** (full survey router) and **drops** `question`, `response`, `results`, etc.  
- **Spec vs plans:** Respondent spec items like “email when survey closes” are only partially threaded (3d templates exist; **2a** `close` does not enqueue email / jobs — left to later plans but not explicitly wired in **2a** checklist).  
- **Docs index:** `PLAN.md` points to `docs/superpowers/specs/INDEX.md`; actual index is **`SPEC.md`**.

---

### 2. Correctness  
**Rating: CRITICAL**

- **`ctx.session` vs `ctx.userId` (Privy):** After **1b**, `protectedProcedure` exposes **`ctx.userId`** / **`ctx.walletAddress`**, not `ctx.session.user`. Yet **2a** (survey router + tests), **2e** (response), **3a** (`results.getForCreator`, and `ctx.session?.user?.id` in public procedures) still use **NextAuth-shaped session context**. That code **does not type-check or run** against the **1b** `trpc.ts` replacement without further bridging (e.g. restoring a session object or updating every procedure).  
- **Invalid Prisma client import path:** **2b** uses `import { QuestionType } from "~/generated/prisma"`. With `paths`: `"~/*": ["./src/*"]`, that resolves to **`src/generated/prisma`**, which does not exist; the client lives at **`generated/prisma`** (see `src/server/db.ts`). Same pattern in **4c** (`Question`, `Answer`) and **4d** (`SubscriptionPlan`).  
- **2c Survey Builder — broken / obsolete wiring:**  
  - **Server page** imports `auth` from `~/server/auth` and `redirect("/api/auth/signin")` — **1b deletes** those.  
  - **`useAutoSave`** snippet passes **`id: builder.survey.title`** to `survey.update`, **`surveyId: question.id`** to `question.upsert`, and **`question.delete`** with `{ id }` while **2b** defines **`questionId`**. Comments say “will be wired” but as written it **does not compile**.  
  - **`PublishDialog`** navigates to **`/surveys/${surveyId}`**; public URLs are **`/s/[slug]`** per routing elsewhere.  
- **2d landing page** uses `survey._count?.questions`; **2a** `getBySlug` only includes **`_count.responses`**, not questions — **runtime undefined / wrong counts** unless **2a** is extended.  
- **3e `browse` filter:** `categories: { array_contains: input.categories }` is **not** standard Prisma JSON filtering for arbitrary “categories in JSON array” on Postgres; likely **invalid or ineffective** without raw SQL / `Prisma.sql` / documented JSON path filters.  
- **4c `buildContext`:** For `MULTIPLE_CHOICE`, treating `a.value` as a single key in `dist` is **wrong** if values are **JSON string arrays** (as in **2d** / **3a**).  
- **Results checklist vs code:** **3a** checklist says SINGLE_SELECT percentages “sum to 100%”; for multi-select options, sums are not required to equal 100% — minor doc imprecision.

---

### 3. Architecture  
**Rating: IMPORTANT**

- **Dependency graph** in `PLAN.md` is logically ordered.  
- **Implementation is not “compose-only”:** Many tasks say **“replace entire `root.ts`”** with a **subset** of routers — that contradicts a clean incremental architecture and causes **lost routers** unless every task is edited to **merge**.  
- **3c** file list says “Create `survey.ts`” although **2a** already owns that file — architectural **ownership conflict**.  
- **RSC + auth:** **1b** assumes Bearer tokens on tRPC HTTP; **RSC** `createContext` uses `headers()` only. If Privy does not put the same token in headers for server-internal tRPC calls, **protected** `api.*` from Server Components may need **cookie-based** verification — not designed in the plans.

---

### 4. TDD structure  
**Rating: GOOD (where present) / IMPORTANT (gaps)**

- **2a** and **4a** include Vitest setup and tests.  
- **2b**, **2d**, **3a**, **3e**, etc. rely on “`pnpm typecheck`” only — weaker for regressions.  
- **2a** tests assume **`session`** in context — they **become invalid** after **1b** unless updated to mock **`userId`**.

---

### 5. Dependencies & ordering  
**Rating: CRITICAL**

- Not circular at the **graph** level, but **linear git-style application** of commits as written yields **overwrites** (**2e** vs **2d**, **3c** vs **2a**, every **root.ts** “replace”).  
- **4d** depends on **3f**’s `user.getSubscription` — ordering is OK if **3f** lands first; **4d** even repeats “add getSubscription” — slight redundancy.

---

### 6. Cross-plan consistency  
**Rating: CRITICAL**

| Topic | Issue |
|--------|--------|
| Auth context | **1b** `userId` vs **2a/2e/3a** `session.user.id` |
| `root.ts` | Competing “full replace” snippets |
| `response.ts` | **2d** vs **2e** duplicate ownership |
| `survey.ts` | **2a** full CRUD vs **3c** fresh file |
| Import paths | `~/generated/prisma` vs actual `../../generated/prisma` |
| Public survey URL | **`/s/[slug]`** vs **2c** `/surveys/${id}` |

---

### 7. Risk  
**Rating: IMPORTANT**

- **Highest rework risk:** **1b ⟷ all plans still using `ctx.session`**, **`root.ts` merge strategy**, **2d+2e `response` router**, **3c vs 2a `survey` router**, **2c** builder snippets.  
- **Large for one session:** **2c** (many files), **3c** (if taken as a second full survey implementation), **3d** (email + router + UI).  
- **3a + RSC + session:** Needs explicit design for how **`userId`** reaches `publicProcedure` for gated “public” results.

---

## Prioritized recommendations

1. **CRITICAL — Standardize tRPC context after Privy:** Either (a) extend **1b** context so `protectedProcedure` also exposes a stable **`user` object** (e.g. `{ id: userId }`) compatible with downstream code, or (b) sweep **all** plans to use **`ctx.userId`** only and drop every `ctx.session` reference (2a, 2e, 3a, survey tests, etc.).  
2. **CRITICAL — Fix `generated/prisma` imports:** Use the same pattern as `src/server/db.ts` (relative from each file) or add a `paths` entry (e.g. `"generated/*": ["./generated/*"]`) and document it once.  
3. **CRITICAL — Merge strategy for routers:** Replace every “replace entire `root.ts`” with a single **cumulative** `appRouter` example at the end of **PLAN.md** or require “add import + one key” per plan.  
4. **CRITICAL — Unify `response.ts`:** Specify **one** file containing **all** procedures from **2d** and **2e**; mark **2e** as “extend `response.ts` from 2d.”  
5. **CRITICAL — Drop or rewrite 3c Task 1–3 survey creation:** **3c** should **only add dashboard UI** assuming **2a**’s router, not recreate `survey.ts`.  
6. **CRITICAL — Fix 2c:** Replace NextAuth `auth()` with Privy-compatible gate (client **AuthGuard** or server token/cookie strategy); fix **`useAutoSave`** inputs to match **2a/2b** Zod shapes; fix publish navigation to **`/s/${slug}`**; wire **`PublishDialog`** to **`confirmPublish`** or single mutation.  
7. **IMPORTANT — Fix 2d / 2a contract:** Extend **`getBySlug`** with **`_count.questions`** (or derive count from `questions.length` in a dedicated field).  
8. **IMPORTANT — Fix 3a access control inputs:** Use **`ctx.userId`** (and optional DB load) instead of **`ctx.session`** for results visibility checks.  
9. **IMPORTANT — Fix 3d env snippet:** Do not reintroduce **`AUTH_SECRET`** if **1b** removes NextAuth; merge Resend vars into the **Privy** `env.js` shape.  
10. **IMPORTANT — 3e:** Replace **`array_contains`** with a **supported** Prisma/Postgres JSON query or normalize categories to a join table if filtering must be reliable.  
11. **MINOR — Fix doc links:** `PLAN.md` → `specs/SPEC.md`; **4d** → `SPEC.md` not `INDEX.md`.  
12. **POTENTIAL — RSC protected calls:** Document how **`api.survey.getForEdit`** from Server Components obtains Privy identity (header forwarding vs cookie verification).

---

**Bottom line:** The plans match the **intent** of `SPEC.md` Phase 1 well at a feature level, but several sub-plans are **not mechanically composable** as written: **auth context**, **router ownership**, **`root.ts` replacements**, **Prisma import paths**, and **2c** code blocks would block or corrupt implementation until reconciled. Addressing the numbered items above — especially **1–6** — should be done before agent execution at scale.
