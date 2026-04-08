# Sub-Plan 2-5b: Verification UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the verification page that displays proof data (verification status, tx hashes, block numbers, Basescan links, IPFS CIDs) and add verification status indicators to survey cards and landing pages. No live hash recomputation in the browser.

**Architecture:** The verification page at `/s/[slug]/verify` fetches stored proof data from the `verification` tRPC router (2-5a) and displays it. The page shows verification status, transaction hashes with Basescan links, block numbers, and IPFS CIDs. Live hash recomputation and independent verification checks are deferred to the pre-launch phase (Sub-Plan 2-6). A reusable `VerificationBadge` component is used on survey cards and the survey landing page.

**Tech Stack:** Next.js 16 (App Router), React 19, TailwindCSS, tRPC v11

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
- [ ] **Step 2: Create CheckItem component** — a proof data display row with props:
  - `label`: string (e.g., "Survey Published", "Survey Closed", "Response Count")
  - `status`: `'verified' | 'pending' | 'not_published'`
  - `txHash`: string | null
  - `blockNumber`: number | null
  - `timestamp`: number | null
  - `basescanLink`: string | null
  - `ipfsCid`: string | null
- [ ] **Step 3: Implement CheckItem rendering:**
  - Status icon: green checkmark for verified, amber spinner for pending, gray dash for not published
  - Label and status text
  - Transaction hash (truncated, with copy button) and Basescan link (external link icon)
  - Block number and timestamp when available
  - IPFS CID with gateway link when available
  - **Note:** No live hash recomputation or on-chain reads. All data comes from the database via the API.
- [ ] **Step 4: Create OnChainDetails component**
  - Display proof data from `verification.getSurveyProof`: tx hashes, block numbers, timestamps, Basescan links, IPFS CIDs
  - Each transaction: type label, truncated tx hash (with copy), block number, timestamp, Basescan link
  - Section for survey publication tx and survey closure tx (if closed)
- [ ] **Step 5: Special handling for cached response integrity check**
  - Show "Last verified: [date]" with the `verifiedAt` timestamp
  - If not yet verified, show "Verification will run when the survey closes"
  - **Note:** Full independent verification (live hash recomputation) is deferred to the pre-launch phase (Sub-Plan 2-6)

---

### Task 3: Build the full verification page

**Files:**
- Modify: `src/app/s/[slug]/verify/page.tsx`

- [ ] **Step 1: Replace the stub** with a full server component page
- [ ] **Step 2: Fetch verification data** using tRPC:
  - Call `verification.getStatus({ slug })` for verification status and proof data
  - Call `verification.getSurveyProof({ slug })` for tx hashes, block numbers, Basescan links, IPFS CIDs
- [ ] **Step 3: Compose the page layout:**
  ```
  VerificationHeader (survey title, hash)
  ProofDataList (CheckItem components showing tx hashes, block numbers, Basescan links, IPFS CIDs)
  OnChainDetails (detailed transaction info)
  ```
  **Note:** No live hash recomputation in the browser. The page displays stored proof data only.
- [ ] **Step 4: Add a "Full Verification" note section**
  - Brief note: "Full independent verification tools (CLI, static page) will be available before launch"
  - This section is a placeholder -- the actual tools are deferred to the pre-launch phase (Sub-Plan 2-6)
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

- [ ] **Step 1: Run `pnpm typecheck`** and fix any type errors
- [ ] **Step 2: Verify all new components** accept the correct prop types from the tRPC router return types
- [ ] **Step 3: Check that the verification page renders** without runtime errors (run `next build` or dev server)
