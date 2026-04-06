# Attestly — Design Specs Index

## What is Attestly?

Attestly is a decentralized survey platform that proves survey results haven't been tampered with. It anchors survey lifecycle events to the blockchain, making surveys publicly auditable without sacrificing respondent privacy. The blockchain isn't the product; trust is the product.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router) + React 19 + Tailwind CSS |
| API | tRPC 11 (end-to-end type safety) |
| Database | PostgreSQL via Prisma 7 |
| Auth & Wallets | Privy (embedded wallets, MPC, non-custodial) |
| Chain | Base (Ethereum L2) |
| Storage | Pinata (IPFS pinning) |
| Signing | EIP-712 Typed Structured Data |
| Encryption | AES-256-GCM + AWS KMS (envelope encryption) |
| Contract Toolchain | Hardhat (Solidity + TypeScript tests) |
| AI | Provider-agnostic (Gemini Flash-Lite for summaries, Gemini Flash for chat — leading candidates) |

## Build Phases

All phases are **development milestones**, not separate releases. Built sequentially to de-risk (Phase 1 validates UX before wiring into contracts). Ship to users only after all 4 phases are complete and tested:

1. **Survey Platform** — Auth, data model, survey builder, respondent flow, results, dashboard, marketplace
2. **On-Chain Verification** — Base contract, IPFS/Pinata, EIP-712 signing, relayer, verification page
3. **Private Surveys** — AES-256-GCM encryption, AWS KMS, verification bundles, premium visibility controls
4. **Paid Surveys** — USDC escrow contract, creator deposits, instant respondent payouts
5. **Credit Card Funding** *(future)* — Stripe integration, fiat-to-USDC conversion, auto-replenishment

## Free vs Premium

| | Free | Premium |
|---|---|---|
| Surveys | Max 5 | Unlimited |
| Responses per survey | Max 50 | Unlimited |
| Survey visibility | Public only | Public + Private |
| Access control | Open only | Open + Invite-only |
| Results visibility | Public only | Public / Respondents-only / Creator-only |
| AI Insights | Visible but gated (upsell) | Summaries + Chat + Cross-survey |
| Paid surveys (USDC bounty) | Visible but gated (upsell) | Full escrow + payouts |

---

## Specs

### 1. [Data Model](2026-04-04-data-model-design.md)

The foundation — Prisma schema, entities, relationships, and constraints. Pragmatic hybrid approach: JSON for question options, normalized Answer table for aggregation, blockchain fields inlined on parent tables.

**Key entities:** User, Subscription, Survey, Question, Response, Answer, SurveyInvite, EncryptionKey, SurveyBounty, AiSummary, ChatSession, BackgroundJob

**Key decisions:**
- Internal UUID primary keys decoupled from Privy (auth-provider agnostic)
- Response status: IN_PROGRESS / SUBMITTED (enables progress auto-save). Soft-delete (`deletedAt`) for IN_PROGRESS responses on survey close.
- Survey access: OPEN / INVITE_ONLY with email + domain invites
- Results visibility: PUBLIC / RESPONDENTS / CREATOR
- Verification status: NONE / PENDING / SUBMITTED / VERIFIED / FAILED
- Subscription model: Subscription table (FREE/PREMIUM/ENTERPRISE plans, ACTIVE/CANCELED/PAST_DUE/EXPIRED status, Stripe fields for future billing)
- Background job queue: BackgroundJob table for async blockchain, IPFS, email, and AI operations
- Chat sessions: ChatSession table, server-side, persist indefinitely, multiple per survey

---

### 2. [Auth & User Management](2026-04-04-auth-design.md)

Privy replaces NextAuth entirely. Single auth system for all users. Login providers: Google, Apple, Email (magic link).

**Key decisions:**
- Privy SDK only (client + server verification), no NextAuth
- Creators authenticate upfront for persistent dashboard access
- Respondents authenticate at "Start Survey" (not at view) to enable progress saving
- tRPC middleware verifies Privy token, upserts User record to Postgres
- Two procedure types: publicProcedure (view surveys) and protectedProcedure (create/respond)

---

### 3. [Survey Builder](2026-04-05-survey-builder-design.md)

Split-pane editor (left: editor, right: live preview) for creating surveys. Four question types with type-specific configuration.

**Key decisions:**
- Type-first question creation (pick type from menu, then configure)
- Auto-save on every change (debounced 1-2s)
- Up/down arrows for reordering, question duplication supported
- Slug auto-generated with random 4-char suffix, editable
- Publish validates all rules (including title max 200 chars, description max 2000 chars), immutability confirmation dialog
- Draft deletion allowed (hard delete), published surveys never deleted
- Mobile: split-pane collapses to tabbed editor/preview toggle
- Premium features visible but gated: private toggle, invite-only toggle, results visibility

---

### 4. [Respondent Experience](2026-04-05-respondent-experience-design.md)

The public-facing flow — landing page, response page, confirmation, results, and "My Responses" history.

**Key decisions:**
- Survey landing page is public (no auth to view)
- Auth triggered at "Start Survey" — enables progress auto-save
- All questions on one scrollable page (not wizard/stepper)
- Post-submit: verification proof + "results available when survey closes"
- Email notification to respondents when survey closes
- No response withdrawal — permanent once submitted. But respondents can "Clear responses" to restart an IN_PROGRESS response.
- IN_PROGRESS responses persist while survey is open, soft-deleted on close. Incomplete responses shown to creator in separate section.
- My Responses page (`/my-responses`) shows participation history
- Mobile-first for all respondent-facing pages
- Invite-only access check after auth (email or domain matching)

---

### 5. [Results & Analytics](2026-04-05-results-analytics-design.md)

Basic per-question aggregations. Results gated until survey closes (except creator real-time view).

**Key decisions:**
- Single Select / Multiple Choice: horizontal bar charts with count + percentage
- Rating: average + distribution bars
- Free Text: paginated list (10 per page, newest first)
- No cross-question filtering or cross-tabulation at launch
- Access controlled by resultsVisibility (PUBLIC / RESPONDENTS / CREATOR)
- Aggregations computed server-side via SQL, cacheable for closed surveys

---

### 6. [Creator Dashboard](2026-04-05-creator-dashboard-design.md)

Home base for survey creators — overview stats, filterable survey list, and inline invite management.

**Key decisions:**
- Overview stats: total surveys, total responses, active survey count
- Survey cards with status-specific content and actions
- Filter tabs: All / Draft / Published / Closed
- Sort: Newest, Oldest, Most responses, Alphabetical
- Close survey: consolidated procedure — status transition, soft-delete IN_PROGRESS (hard cutoff), email notifications, AI summary generation, blockchain close job, escrow refund (each phase adds steps)
- Invite management panel: add emails/domains, bulk entry, response progress tracking
- Free tier: max 5 surveys — "New Survey" button gated with upsell

---

### 7. [Public Survey Discovery](2026-04-05-public-survey-discovery-design.md)

Full marketplace for discovering public surveys. Browse, search, filter, featured/trending sections, and user profiles.

**Key decisions:**
- Search across titles, descriptions, and tags
- Featured surveys (admin-curated via `/admin` page, up to 6)
- Trending surveys (ranked by response velocity, not total count)
- Categories: 1-5 from fixed platform list (Business, Education, Research, Health, Technology, Politics, Entertainment, Science, Community, Other)
- Tags: 0-10 freeform per survey, used in search
- Bounty filter: has bounty toggle + minimum reward input
- User profiles (`/u/[userId]`): display name, avatar, bio, wallet/ENS, public surveys
- Profile settings: editable display name, avatar upload, bio
- Only public + published + open-access surveys appear

---

### 8. [AI Insights](2026-04-05-ai-insights-design.md)

LLM-powered analysis — auto-generated summaries and chat with survey data. Premium feature.

**Key decisions:**
- Top-level summary: key findings, sentiment, patterns (auto-generated on survey close)
- Per-question summaries: free text questions only (select/rating charts are self-explanatory)
- Regeneration with optional focus prompt ("Focus on negative feedback")
- Single-survey chat: collapsible sidebar on results page, streaming responses
- Cross-survey chat: full-page interface at `/dashboard/insights`, select 2+ surveys
- Summaries stored in AiSummary table for instant page load
- Provider-agnostic AI layer; Gemini Flash-Lite for summaries (~$0.09 per full survey analysis), Gemini Flash for chat
- Chat sessions: server-side, persist indefinitely, multiple sessions per survey with session picker
- Retroactive summary generation when user upgrades to Premium
- Free users see blurred/gated upsell where summaries and chat would be

---

### 9. [Blockchain & Verification](2026-04-05-blockchain-verification-design.md)

Smart contract on Base, EIP-712 signing, relayer pattern, and independent verification tools.

**Key decisions:**
- Hardhat toolchain (TypeScript tests, matching the stack)
- Robust contract: enforces uniqueness, signature verification, state transitions on-chain. Survey IPFS CID anchored on-chain in `SurveyPublished` event for full verifier independence.
- Relayer pattern: Attestly submits txs, contract verifies signatures — can relay but not forge. Worker relays pre-signed data, does NOT sign.
- EIP-712 Survey struct includes `accessMode` and `resultsVisibility` as on-chain commitments (prevents post-publication tampering)
- Async Postgres-backed queue for tx submission (don't block API on chain confirmation)
- Verification states: PENDING → SUBMITTED → VERIFIED (or FAILED with retry)
- UUPS upgradeable proxy during Phases 2-4, renounce admin after Phase 4 before public launch
- Verification page (`/s/[slug]/verify`): checks 1-3 live, check 4 cached from close
- Open-source CLI (`npx @attestly/verify`) + static GitHub Pages verifier for full independence
- Blinded identifiers: `keccak256(abi.encodePacked(walletAddress, surveyHash))` — canonical Solidity encoding. TypeScript equivalent: `keccak256(solidityPacked(['address', 'bytes32'], [walletAddress, surveyHash]))` (ethers.js). Practical privacy, not absolute.

---

### 10. [IPFS & Storage](2026-04-05-ipfs-storage-design.md)

Three storage layers: Postgres (primary), IPFS/Pinata (verifiable backup), Base (immutable hashes).

**Key decisions:**
- Survey content JSON pinned to IPFS at publication (verifier independence from Attestly)
- Response JSON pinned to IPFS (plaintext for public, encrypted for private)
- Version field in all IPFS content for forward compatibility
- Deterministic JSON serialization (sorted keys, no trailing whitespace, UTF-8) for CID reproducibility
- Pinata dedicated gateway for reliable fetching
- Public IPFS gateways for open-source verification tools
- Postgres is always the primary — IPFS is the decentralized proof layer

---

### 11. [Private Surveys](2026-04-05-private-surveys-design.md)

AES-256-GCM encryption for response data on IPFS. AWS KMS envelope encryption for key management.

**Key decisions:**
- Per-survey encryption key (blast radius of compromise = one survey)
- Two-layer envelope encryption: KMS master key encrypts per-survey keys, survey keys encrypt responses
- AWS KMS: master key never leaves HSM, IAM-controlled access, audit logs
- Plaintext answers still in Postgres (for queries, aggregation, AI insights)
- Encrypted blob format on IPFS: version, format, IV, auth tag, ciphertext
- Verification bundles: downloadable JSON with decryption key, generated on demand by creator
- Survey content (questions) is NOT encrypted — only responses are

---

### 12. [Paid Surveys](2026-04-05-paid-surveys-design.md)

USDC escrow on Base. Creators deposit bounties, respondents get paid instantly on submission.

**Key decisions:**
- Phase 4: direct USDC deposit from creator's Privy wallet
- Phase 5 (future): credit card funding via Stripe with batch charging
- Delayed payout: 24-hour review hold, auto-approved if creator doesn't act. Creator can approve (immediate) or reject (USDC returned to bounty pool).
- Sybil resistance: Cloudflare Turnstile, IP rate limiting, device fingerprinting, email verification required, delayed payouts, creator manual review
- Atomic publish: `publishSurveyWithBounty()` — single contract call for survey + bounty creation
- Auto-refund: remaining USDC returned to creator on survey close
- Manual top-off: creator can add more funds to extend a bounty
- Bounty exhaustion: dual enforcement — API pre-check (fast) + contract revert (trustworthy fallback)
- Marketplace integration: bounty badge on survey cards, bounty filter in explore page (Phase 4 UI hidden until Phase 4 ships)

---

## Cross-Cutting Concerns

### Premium Upsell Pattern
All premium features are **visible but gated** — shown in their natural UI location with specific value propositions, not hidden behind a generic upgrade page.

### App Shell
- **Authenticated:** Logo | Explore | Dashboard | My Responses | [Avatar]
- **Unauthenticated:** Logo | Explore | [Sign In]
- **During survey response:** Minimal navbar (logo + save status only)

### Threat Model
Adversaries: survey creator (A), platform operator (B), external attacker (C). Every design decision is evaluated against: "does this still hold if Attestly is the adversary?"

### Premium Downgrade Behavior
When a user downgrades from Premium to Free:
- **Grandfathered:** existing private surveys stay private, encrypted IPFS data stays encrypted, existing invite lists remain active
- **Gated:** AI summaries hidden (blurred upsell shown), chat disabled, can't regenerate summaries, can't generate verification bundles, can't start new chat sessions
- **Revoked for new actions:** can't create new private/invite-only surveys, 5-survey and 50-response limits re-apply to new surveys
- Principle: protect data integrity (can't un-encrypt IPFS), gate ongoing premium services

### Private Survey + PUBLIC Results Invariant
Private surveys with `resultsVisibility = PUBLIC` show aggregated results only (charts, averages). Free text paginated list is hidden — individual free text responses require at least RESPONDENTS visibility on private surveys.

### Privacy Scope for Private Surveys
"Private" means encrypted on IPFS — plaintext answers remain in Postgres for aggregation and AI. Encryption protects against adversary C (external breach of IPFS), not adversary B (platform operator). Blockchain protects integrity against all adversaries. Confidentiality from B would require client-side encryption that makes aggregation impractical — a deliberate tradeoff.

### Rating UI
Numbered buttons for ranges up to 10, number input for ranges > 10.

### Mobile
Respondent-facing pages: mobile-first. Builder/dashboard: desktop-optimized, mobile-responsive.

### Admin
`/admin` page restricted to admin users (`isAdmin` on User table). Starts with featured survey management, designed to expand over time.

### Stale Job Recovery
Background worker jobs that remain PENDING for more than 60 minutes are auto-retried. Alert triggered at 15 minutes as an early warning.

### JSON Determinism
All JSON pinned to IPFS uses deterministic serialization (sorted keys, UTF-8, no trailing whitespace) to ensure CID reproducibility across Attestly and independent verification tools.

### questionIndex = Question.position
`Answer.questionIndex` is the same value as `Question.position`, denormalized for EIP-712 self-describing responses.
