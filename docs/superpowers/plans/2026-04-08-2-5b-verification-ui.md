# Sub-Plan 2-5b: Verification UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the verification page and add verification status indicators to survey cards and landing pages.

**Architecture:** The verification page at `/s/[slug]/verify` fetches data from the `verification` tRPC router (2-5a) and renders 4 check items with live status. A reusable `VerificationBadge` component is used on survey cards and the survey landing page. All on-chain data is fetched server-side via tRPC queries.

**Tech Stack:** Next.js 15 (App Router), React 19, TailwindCSS, tRPC v11

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

**Assumes:** Verification API (Sub-Plan 2-5a) is implemented and the `verification` router is registered.

---

## File Structure

- Modify: `src/app/s/[slug]/verify/page.tsx` — full verification page (replace stub)
- Create: `src/app/s/[slug]/verify/_components/CheckItem.tsx` — individual check display component
- Create: `src/app/s/[slug]/verify/_components/VerificationHeader.tsx` — survey title and hash header
- Create: `src/app/s/[slug]/verify/_components/OnChainDetails.tsx` — block numbers, tx hashes, Basescan links
- Create: `src/components/VerificationBadge.tsx` — reusable badge component
- Modify: `src/app/s/[slug]/page.tsx` — add verification badge to survey landing page
- Modify: survey card component (in dashboard) — add verification indicator

---

### Task 1: Create the VerificationBadge reusable component

**Files:**
- Create: `src/components/VerificationBadge.tsx`

- [ ] **Step 1: Create the VerificationBadge component** with the following props:
  - `status`: `'VERIFIED' | 'PENDING' | 'FAILED' | 'NONE' | 'SUBMITTED'`
  - `size`: `'sm' | 'md'` (default `'sm'`)
  - `showLabel`: `boolean` (default `true`)
- [ ] **Step 2: Implement status-based rendering:**
  - `VERIFIED`: green checkmark icon + "Verified on-chain" text
  - `PENDING`: amber spinner/clock icon + "Verification pending" text
  - `SUBMITTED`: blue clock icon + "Confirming on-chain" text
  - `FAILED`: red warning icon + "Verification issue" text
  - `NONE`: no badge rendered (return null)
- [ ] **Step 3: Style with TailwindCSS** — small pill/badge shape, appropriate colors, responsive sizing

---

### Task 2: Build the verification page components

**Files:**
- Create: `src/app/s/[slug]/verify/_components/VerificationHeader.tsx`
- Create: `src/app/s/[slug]/verify/_components/CheckItem.tsx`
- Create: `src/app/s/[slug]/verify/_components/OnChainDetails.tsx`

- [ ] **Step 1: Create VerificationHeader component**
  - Display survey title prominently
  - Show the full survey hash in a monospace font with a copy button
  - Include a link back to the survey page (`/s/[slug]`)
- [ ] **Step 2: Create CheckItem component** with props:
  - `name`: string (check name)
  - `status`: `'pass' | 'fail' | 'pending' | 'unavailable' | 'not_closed' | 'not_published'`
  - `details`: object (check-specific details)
  - `blockNumber`: number | null
  - `timestamp`: number | null
  - `basescanLink`: string | null
- [ ] **Step 3: Implement CheckItem rendering:**
  - Status icon: green checkmark for pass, red X for fail, amber spinner for pending, gray dash for unavailable
  - Check name and description
  - Details section: varies per check type (hash comparison, count comparison, closure timestamp, cached verification date)
  - Block number and Basescan link when available (external link icon)
- [ ] **Step 4: Create OnChainDetails component**
  - Display tx hashes, block numbers, and timestamps from `verification.getSurveyProof`
  - Each transaction: type label, truncated tx hash (with copy), block number, timestamp, Basescan link
  - Section for survey publication tx and survey closure tx (if closed)
- [ ] **Step 5: Special handling for Check 4 (cached)**
  - Show "Last verified: [date]" with the `verifiedAt` timestamp
  - If not yet verified, show "Verification will run when the survey closes"
  - Include a note: "Run independent verification using the open-source tools below"

---

### Task 3: Build the full verification page

**Files:**
- Modify: `src/app/s/[slug]/verify/page.tsx`

- [ ] **Step 1: Replace the stub** with a full server component page
- [ ] **Step 2: Fetch verification data** using tRPC:
  - Call `verification.getStatus({ slug })` for the 4 checks
  - Call `verification.getSurveyProof({ slug })` for on-chain details
- [ ] **Step 3: Compose the page layout** following the component structure from the spec:
  ```
  VerificationHeader (survey title, hash)
  CheckList (4 CheckItem components)
  OnChainDetails (block numbers, tx hashes, Basescan links)
  IndependentVerificationLinks (CLI, static page, GitHub)
  ```
- [ ] **Step 4: Add the Independent Verification Links section**
  - Link to the `@attestly/verify` npm package / CLI
  - Link to the static verification page (GitHub Pages)
  - Link to the GitHub repo for source code
  - Brief explanation: "These tools verify survey integrity without relying on Attestly's servers"
- [ ] **Step 5: Handle edge cases**
  - Survey not found: 404 page
  - Survey not yet published on-chain: show "This survey has not been published on-chain yet" with pending status
  - On-chain reads unavailable: show degraded state with "Some checks are temporarily unavailable"
- [ ] **Step 6: Add metadata** — page title "Verify: [Survey Title] | Attestly", description for SEO

---

### Task 4: Add verification badge to survey landing page

**Files:**
- Modify: `src/app/s/[slug]/page.tsx`

- [ ] **Step 1: Import the VerificationBadge component**
- [ ] **Step 2: Fetch the survey's `verificationStatus`** from the existing survey query (should already be on the model)
- [ ] **Step 3: Render the VerificationBadge** near the survey title, using `size="md"`
- [ ] **Step 4: Add a "Verify" link** next to the badge that navigates to `/s/[slug]/verify`

---

### Task 5: Add verification indicator to dashboard survey cards

**Files:**
- Modify: survey card component in dashboard (locate in `src/app/` dashboard components)

- [ ] **Step 1: Import the VerificationBadge component**
- [ ] **Step 2: Render the badge** on each survey card, using `size="sm"` and the survey's `verificationStatus`
- [ ] **Step 3: Ensure the badge does not disrupt** the existing card layout — position it in the card header or metadata row

---

### Task 6: Typecheck

- [ ] **Step 1: Run `npx tsc --noEmit`** and fix any type errors
- [ ] **Step 2: Verify all new components** accept the correct prop types from the tRPC router return types
- [ ] **Step 3: Check that the verification page renders** without runtime errors (run `next build` or dev server)
