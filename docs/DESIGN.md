# Attestly — Design Overview

> For detailed specifications, see [docs/superpowers/specs/INDEX.md](superpowers/specs/INDEX.md)

## What is Attestly?

A decentralized survey platform that proves survey results haven't been tampered with. Anchors survey lifecycle events to the blockchain, making surveys publicly auditable without sacrificing respondent privacy. The blockchain isn't the product; trust is the product.

## Threat Model

- **(A) Survey creator** — can't stuff the ballot box, change questions, or hide responses
- **(B) Platform operator (Attestly)** — system must be trustworthy even if Attestly is compromised or malicious
- **(C) External attacker** — standard infosec (encryption, access control, auth)

Core principle: every design decision is evaluated against "does this still hold if Attestly is the adversary?"

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router) + React 19 + Tailwind CSS |
| API | tRPC 11 |
| Database | PostgreSQL via Prisma 7 |
| Auth & Wallets | Privy (embedded wallets, MPC, non-custodial) |
| Chain | Base (Ethereum L2) |
| Storage | Pinata (IPFS pinning) |
| Signing | EIP-712 Typed Structured Data |
| Encryption | AES-256-GCM + AWS KMS |
| Contract Toolchain | Hardhat |
| AI | Provider-agnostic (Gemini Flash-Lite/Flash leading candidates) |
| Email | Resend |

## How It Works

1. **Creator** signs in (Google/Apple/Email via Privy), builds a survey with a rich question builder (4 types: single select, multiple choice, rating, free text), and publishes it
2. **Publication** hashes the survey content (EIP-712) and records it on Base L2 + pins to IPFS — creating a tamper-evident seal
3. **Respondent** clicks a survey link, authenticates at "Start Survey" (Privy creates an embedded wallet silently), fills out answers with auto-save, and submits
4. **Submission** signs the response with the respondent's wallet, pins to IPFS, and records the IPFS CID + blinded identifier on-chain — proving the response exists without revealing who submitted it
5. **Results** become available when the survey closes. Creator gets AI-generated summaries and can chat with their data
6. **Verification** — anyone can independently verify survey integrity: recompute hashes, check on-chain records, fetch from IPFS. Attestly provides a verification page as a convenience, plus open-source CLI and static tools for full independence

## Key Design Decisions

- **Privy embedded wallets** — non-custodial, MPC key sharding. Respondents sign in with Google and get a wallet silently. No MetaMask, no seed phrases.
- **Blinded identifiers** — `keccak256(abi.encodePacked(walletAddress, surveyHash))` stored on-chain instead of raw wallet addresses. Practical privacy.
- **Public by default, private as premium** — public surveys have plaintext responses on IPFS (trivial verification). Private surveys encrypt responses on IPFS (AES-256-GCM, per-survey key, AWS KMS).
- **Survey immutability** — published surveys cannot be edited. No versioning. Close and create a new one.
- **Hard cutoff on close** — IN_PROGRESS responses are soft-deleted. No post-close submissions.
- **USDC escrow for paid surveys** — creators deposit bounties, respondents get paid after 24-hour review hold. Sybil resistance via Turnstile, device fingerprinting, email verification, and creator review.
- **Async blockchain operations** — Postgres-backed job queue. User gets instant response, chain catches up in background.
- **Relayer pattern** — Attestly pays all gas, submits txs on behalf of users. Contract verifies EIP-712 signatures — can relay but cannot forge.

## Free vs Premium

| | Free | Premium |
|---|---|---|
| Surveys | Max 5 | Unlimited |
| Responses/survey | Max 50 | Unlimited |
| Visibility | Public only | Public + Private |
| Access | Open only | Open + Invite-only |
| Results | Public only | Public / Respondents-only / Creator-only |
| AI Insights | Gated (visible upsell) | Summaries + Chat + Cross-survey |
| Paid surveys | Gated (visible upsell) | USDC escrow + payouts |

Premium managed via Subscription table (FREE/PREMIUM/ENTERPRISE plans). On downgrade: data preserved, ongoing services gated.

## Build Phases

Development milestones, not separate releases. Ship after all 4 complete:

1. **Survey Platform** — Auth, data model, survey builder, respondent flow, results, dashboard, marketplace, admin
2. **On-Chain Verification** — Base contract, IPFS/Pinata, EIP-712, relayer, verification page, open-source tools
3. **Private Surveys** — AES-256-GCM encryption, AWS KMS, verification bundles, premium visibility controls
4. **Paid Surveys** — USDC escrow, delayed payouts, sybil resistance, creator review
5. **Credit Card Funding** *(future)* — Stripe, fiat-to-USDC, auto-replenishment

## Detailed Specs

All specs live in [docs/superpowers/specs/](superpowers/specs/INDEX.md):

1. [Data Model](superpowers/specs/2026-04-04-data-model-design.md) — 14 entities, relationships, constraints
2. [Auth & User Management](superpowers/specs/2026-04-04-auth-design.md) — Privy integration, login flows
3. [Survey Builder](superpowers/specs/2026-04-05-survey-builder-design.md) — Split-pane editor, question types, validation
4. [Respondent Experience](superpowers/specs/2026-04-05-respondent-experience-design.md) — Landing page through results
5. [Results & Analytics](superpowers/specs/2026-04-05-results-analytics-design.md) — Charts, aggregations, access control
6. [Creator Dashboard](superpowers/specs/2026-04-05-creator-dashboard-design.md) — Stats, survey management, invites
7. [Public Survey Discovery](superpowers/specs/2026-04-05-public-survey-discovery-design.md) — Marketplace, profiles, admin
8. [AI Insights](superpowers/specs/2026-04-05-ai-insights-design.md) — Summaries, chat, cross-survey analysis
9. [Blockchain & Verification](superpowers/specs/2026-04-05-blockchain-verification-design.md) — Contract, relayer, verification
10. [IPFS & Storage](superpowers/specs/2026-04-05-ipfs-storage-design.md) — Three storage layers
11. [Private Surveys](superpowers/specs/2026-04-05-private-surveys-design.md) — Encryption, KMS, bundles
12. [Paid Surveys](superpowers/specs/2026-04-05-paid-surveys-design.md) — Escrow, payouts, fraud prevention
