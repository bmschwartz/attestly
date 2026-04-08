# Attestly Phase 2 — On-Chain Verification

> For design specifications, see [docs/superpowers/specs/2026-04-05-blockchain-verification-design.md](../../specs/2026-04-05-blockchain-verification-design.md) and [docs/superpowers/specs/2026-04-05-ipfs-storage-design.md](../../specs/2026-04-05-ipfs-storage-design.md)

## Overview

Phase 2 adds blockchain verification to the survey platform. Smart contract on Base L2 records survey lifecycle events. EIP-712 signatures prove creator/respondent authorship. IPFS stores survey content and response data. A relayer submits transactions on behalf of users (paying gas) while the contract verifies signatures.

11 sub-plans. Build in order — each depends on its predecessors.

## Dependency Graph

```
2-1a Hardhat Setup
    ↓
2-1b Contract Implementation
    ↓
2-1c Contract Tests
    ↓
2-2 EIP-712 TypeScript Library
    ├→ 2-3 IPFS / Pinata
    │   └→ 2-3b Signing Integration (tRPC + client call sites)
    │       └→ 2-4a Blockchain Infrastructure
    │           └→ 2-4b Job Handlers
    │               └→ 2-5a Verification API
    │               └→ 2-5b Verification UI
    └→ 2-6 Open-Source Tools (deferred to pre-launch)
```

## Sub-Plans

| # | Plan | Goal | Key Files |
|---|------|------|-----------|
| [2-1a](2026-04-08-2-1a-hardhat-setup.md) | **Hardhat Setup** | Project config, deps, directory structure, interface | `contracts/`, `hardhat.config.ts` |
| [2-1b](2026-04-08-2-1b-contract-implementation.md) | **Contract Implementation** | Full Attestly.sol with EIP-712 recovery, UUPS proxy | `contracts/Attestly.sol` |
| [2-1c](2026-04-08-2-1c-contract-tests.md) | **Contract Tests** | 22+ tests covering all functions, reverts, lifecycle | `contracts/test/` |
| [2-2](2026-04-08-2-2-eip712-library.md) | **EIP-712 Library** | Domain, types, hashing, signing, blinded ID computation | `src/lib/eip712/` |
| [2-3](2026-04-08-2-3-ipfs-pinata.md) | **IPFS / Pinata** | Deterministic JSON, pin survey/response, Pinata client | `src/lib/ipfs/` |
| [2-3b](2026-04-08-2-3b-signing-integration.md) | **Signing Integration** | Modify survey/response tRPC routes + client call sites to collect EIP-712 signatures and enqueue blockchain jobs | `src/server/api/routers/survey.ts`, `src/server/api/routers/response.ts`, client components |
| [2-4a](2026-04-08-2-4a-blockchain-infra.md) | **Blockchain Infrastructure** | Provider, relayer (gas ceiling + revert handling), contract client | `src/server/blockchain/` |
| [2-4b](2026-04-08-2-4b-job-handlers.md) | **Job Handlers** | Wire PUBLISH, SUBMIT, CLOSE, VERIFY handlers + job ordering | `src/server/jobs/handlers/` |
| [2-5a](2026-04-08-2-5a-verification-api.md) | **Verification API** | tRPC procedures, proof data retrieval | `src/server/api/routers/verification.ts` |
| [2-5b](2026-04-08-2-5b-verification-ui.md) | **Verification UI** | /s/[slug]/verify page, status badges | `src/app/s/[slug]/verify/` |
| [2-6](2026-04-08-2-6-open-source-tools.md) | **Open-Source Tools** | CLI verifier + static page *(deferred to pre-launch)* | `packages/verify/` |

## Key Design Decisions

- **User signs client-side** via Privy embedded wallet (not server-side) — preserves adversary B trust model
- **Compact signing payload** — user signs `{ surveyHash, title, slug, questionCount, creator }` not the full survey data. Content hash binds signature to exact content.
- **Separate wallets** — admin wallet (UUPS owner, cold storage) vs relayer wallet (tx submitter, hot)
- **Gas ceiling** — reject txs above 10x expected gas, retry later. Contract reverts fail permanently.
- **Minimal verification page** — show proof data (tx hashes, Basescan links, IPFS CIDs). No live hash recomputation in browser — that's for the open-source CLI (pre-launch).
- **Contract address as env var** — `ATTESTLY_CONTRACT_ADDRESS`, stable after first UUPS deploy
- **Local Hardhat for contract dev** → Base Sepolia for integration testing

## Tech Stack

- **Contract:** Solidity ^0.8.24, Hardhat, OpenZeppelin (UUPS, ECDSA, EIP712)
- **Chain:** Base L2 (chainId 8453, Sepolia testnet for dev)
- **Signing:** viem (EIP-712 typed data hashing + signing)
- **IPFS:** Pinata SDK
- **Serialization:** RFC 8785 JSON Canonicalization

## Environment Variables (new in Phase 2)

```
# Server-side
ADMIN_PRIVATE_KEY=          # UUPS proxy owner (deploy + upgrades)
RELAYER_PRIVATE_KEY=        # Transaction submitter (hot wallet)
ATTESTLY_CONTRACT_ADDRESS=  # Stable after first UUPS deploy
BASE_RPC_URL=               # Base Sepolia or mainnet RPC
PINATA_JWT=                 # Pinata v3 SDK JWT (replaces API key + secret)
PINATA_GATEWAY_URL=         # Pinata dedicated gateway URL

# Client-side (exposed to browser via NEXT_PUBLIC_)
NEXT_PUBLIC_ATTESTLY_CONTRACT_ADDRESS=  # Same value as server-side (for EIP-712 domain)
NEXT_PUBLIC_CHAIN_ID=                   # 8453 (mainnet) or 84532 (Base Sepolia)
```
