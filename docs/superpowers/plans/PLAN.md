# Attestly — Implementation Plans

> For design specifications, see [docs/superpowers/specs/PLAN.md](../specs/PLAN.md)

## Phases

| Phase | Description | Status | Plans |
|-------|-------------|--------|-------|
| [Phase 1](phase-1/PLAN.md) | Survey Platform (auth, builder, responses, dashboard, AI, premium) | ✅ Complete | 20 sub-plans |
| [Phase 2](phase-2/PLAN.md) | On-Chain Verification (contract, EIP-712, IPFS, relayer, verification) | 📝 Planned | 9 sub-plans |
| Phase 3 | Private Surveys (AES-256-GCM, AWS KMS, verification bundles) | ⏳ Not started | — |
| Phase 4 | Paid Surveys (USDC escrow, sybil resistance, delayed payouts) | ⏳ Not started | — |

## Execution Strategy

- Specs written early, plans written just-in-time (after previous phase is stable)
- Each sub-plan is one agent session via subagent-driven development
- Sequential execution within each phase
- Code review between phases

## Tech Stack

- **Runtime:** Next.js 16 (App Router), React 19, TypeScript
- **API:** tRPC 11, Zod
- **Database:** PostgreSQL via Prisma 7
- **Auth:** Privy (embedded wallets, Google/Apple/Email)
- **Styling:** Tailwind CSS
- **Email:** Resend
- **AI:** Google Generative AI SDK (Gemini Flash-Lite/Flash)
- **Chain:** Base L2, Solidity, Hardhat, OpenZeppelin
- **IPFS:** Pinata
- **Hosting:** Railway (web + worker + Postgres)
- **Testing:** Vitest, Hardhat tests
