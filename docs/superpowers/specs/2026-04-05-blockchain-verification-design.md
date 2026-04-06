# Blockchain & Verification Design

## Overview

Attestly records survey lifecycle events on Base (L2) to create a tamper-evident audit trail. A smart contract enforces integrity rules (uniqueness, signature verification, state transitions). A relayer pattern lets Attestly pay gas on behalf of users while preserving cryptographic guarantees. Independent verification is available via a public verification page and open-source tools.

## Chain

**Base** (Ethereum L2) — cheapest gas, strong ecosystem for consumer apps, Privy integration.

- Chain ID: 8453 (mainnet), 84532 (Sepolia testnet)
- Gas costs: ~$0.001-0.01 per transaction
- Attestly pays all gas via a funded relayer wallet

## Smart Contract

### Toolchain

**Hardhat** — TypeScript-based, matching the rest of the stack. Solidity contracts, TypeScript tests and deployment scripts.

### Contract Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAttestly {
    // Events (the public audit trail)
    event SurveyPublished(bytes32 indexed surveyHash, string ipfsCid, uint256 timestamp);
    event ResponseSubmitted(
        bytes32 indexed surveyHash,
        bytes32 indexed blindedId,
        string ipfsCid,
        uint256 timestamp
    );
    event SurveyClosed(bytes32 indexed surveyHash, uint256 timestamp);

    // State-changing functions
    function publishSurvey(
        bytes32 surveyHash,
        string calldata ipfsCid,
        address creator,
        bytes calldata signature
    ) external;

    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        bytes calldata signature
    ) external;

    function closeSurvey(
        bytes32 surveyHash,
        bytes calldata signature
    ) external;

    // View functions (for verifiers)
    function getSurvey(bytes32 surveyHash) external view returns (
        address creator,
        uint256 publishedAt,
        bool closed,
        uint256 closedAt,
        uint256 responseCount
    );

    function isResponseSubmitted(
        bytes32 surveyHash,
        bytes32 blindedId
    ) external view returns (bool);

    function getResponseCount(bytes32 surveyHash) external view returns (uint256);
}
```

### On-Chain Enforcement

| Rule | Why it must be on-chain |
|------|------------------------|
| Survey hash must be unique | Attestly can't publish two different surveys with the same hash |
| Signature verified against creator address | Attestly can't publish surveys on behalf of someone else |
| Survey must exist + not be closed to accept responses | Attestly can't backfill responses after closure |
| Blinded ID unique per survey | Attestly can't stuff duplicate responses |
| Response signature verified on-chain | Attestly can't fabricate responses — needs the respondent's private key |
| Only creator can close | Attestly can't close a survey to suppress responses. `closeSurvey` recovers the signer from the EIP-712 signature and verifies it matches the stored `creator` address for the given `surveyHash`. |

### Blinded ID Computation

The contract computes the blinded ID on-chain to verify correctness:

1. Recover signer address from the EIP-712 signature
2. Compute `keccak256(abi.encodePacked(signer, surveyHash))`
3. Check it matches the provided `blindedId`
4. Check `blindedId` hasn't been used before for this survey

The signer's address is used for computation but only the blinded ID is stored in contract state/events.

### Upgradeability

- **UUPS proxy pattern** during Phases 2-4 — allows bug fixes, feature additions (escrow in Phase 4), and iteration
- **Renounce upgrade admin after Phase 4 is deployed and tested, before public launch** — permanently immutable. This is the final act before going live.
- Verifiers can confirm admin renouncement on-chain via Basescan

## EIP-712 Schema

### Domain

```typescript
const domain = {
  name: "Attestly",
  version: "1",
  chainId: 8453, // Base mainnet
  verifyingContract: "0x..." // Attestly contract address
}
```

### Survey Types (signed by creator at publication)

```typescript
const surveyTypes = {
  Survey: [
    { name: "title", type: "string" },
    { name: "description", type: "string" },
    { name: "creator", type: "address" },
    { name: "slug", type: "string" },
    { name: "isPrivate", type: "bool" },
    { name: "accessMode", type: "string" },        // "OPEN" | "INVITE_ONLY"
    { name: "resultsVisibility", type: "string" },  // "PUBLIC" | "RESPONDENTS" | "CREATOR"
    { name: "questions", type: "Question[]" },
  ],
  Question: [
    { name: "text", type: "string" },
    { name: "questionType", type: "string" },
    { name: "position", type: "uint8" },
    { name: "required", type: "bool" },
    { name: "options", type: "string[]" },
    { name: "minRating", type: "uint8" },
    { name: "maxRating", type: "uint8" },
    { name: "maxLength", type: "uint16" },
  ],
}
```

### Response Types (signed by respondent at submission)

```typescript
const responseTypes = {
  SurveyResponse: [
    { name: "surveyHash", type: "bytes32" },
    { name: "respondent", type: "bytes32" }, // blinded: keccak256(abi.encodePacked(walletAddress, surveyHash))
    { name: "answers", type: "Answer[]" },
  ],
  Answer: [
    { name: "questionIndex", type: "uint8" },
    { name: "questionType", type: "string" },
    { name: "value", type: "string" },
  ],
}
```

## Relayer Architecture

### Pattern

Attestly acts as a relayer — submits transactions on behalf of users (paying all gas). The contract verifies EIP-712 signatures inside each function, so Attestly can relay but cannot forge.

### Async Queue

On-chain transactions are processed asynchronously via a background worker:

1. **User action** → API validates, saves to Postgres, returns success immediately
2. **Job queued** → blockchain job created in a Postgres-backed queue (e.g., graphile-worker or simple polling table — no Redis needed at launch)
3. **Worker picks up job** → pins to IPFS first (if applicable, to get CID), then relays the user's pre-signed EIP-712 data and submits tx to Base (CID included in tx for `submitResponse`). Note: the user signs at action time (publish/submit/close); the worker only broadcasts the transaction.
4. **Tx confirmed** → worker updates database record with txHash, ipfsCid, blindedId
5. **User sees status update** → "Pending" → "Verified ✓"

### Why Async

- On-chain transactions take seconds to confirm — don't block the API response
- Handles retries gracefully — if a tx fails (gas spike, nonce issue), the worker retries without the user knowing
- Decouples user experience from chain performance

### Job Ordering

The worker respects dependencies between jobs for the same survey:

- `SUBMIT_RESPONSE` jobs wait for the survey's `PUBLISH_SURVEY` job to complete (the contract requires the survey to exist on-chain before accepting responses)
- `CLOSE_SURVEY` jobs wait for all pending `SUBMIT_RESPONSE` jobs to complete
- Respondents can submit while `PUBLISH_SURVEY` is still pending — their response is saved to Postgres immediately, and the `SUBMIT_RESPONSE` job queues behind the publish job

This means there is a window between platform publication and chain publication where responses accumulate in Postgres. All of them are recorded on-chain once the publish job completes and the response jobs process in order.

### Job Types

| Job | Triggered By | Actions |
|-----|-------------|---------|
| `PUBLISH_SURVEY` | Creator publishes survey | Hash survey content (EIP-712), pin survey JSON to IPFS, call `publishSurvey()` on contract |
| `SUBMIT_RESPONSE` | Respondent submits response | Hash response (EIP-712), pin response to IPFS (plaintext or encrypted), call `submitResponse()` on contract |
| `CLOSE_SURVEY` | Creator closes survey | Call `closeSurvey()` on contract |
| `VERIFY_RESPONSES` | Survey closed | Run full response integrity check (check 4), cache result |

### Retry Policy

- Max 3 retries per job with exponential backoff (5s, 30s, 5min)
- If all retries fail, job is marked as `FAILED` and an alert is triggered
- **Stale job timeout:** if any job remains in PENDING for more than 60 minutes, it is automatically retried regardless of retry count. This accounts for worker crashes, restarts, or missed jobs.
- Failed jobs are visible in an admin/monitoring view
- Creator/respondent sees "Verification pending — we're working on it"
- Alert triggered if any job stays PENDING > 15 minutes (early warning before the 60-minute auto-retry)

### Relayer Wallet

- Funded hot wallet on Base, private key stored in cloud KMS (AWS KMS or GCP Cloud HSM)
- Auto-refill from a cold wallet when balance drops below threshold
- Balance monitoring and alerting
- Rate-limit outgoing transactions to prevent drain in case of compromise

## On-Chain Verification States

Each blockchain-enabled record transitions through:

| State | DB Field | UI Indicator |
|-------|----------|-------------|
| `PENDING` | txHash = null | Spinner / "Pending verification" |
| `SUBMITTED` | txHash set, not confirmed | Clock icon / "Confirming" |
| `VERIFIED` | txHash confirmed on-chain | Green checkmark / "Verified on-chain" |
| `FAILED` | job failed after retries | Warning / "We're working on verifying this" |

### Data Model Addition

Add a `verificationStatus` enum to Survey and Response:

```prisma
enum VerificationStatus {
  NONE       // Phase 1 — no blockchain
  PENDING
  SUBMITTED
  VERIFIED
  FAILED
}
```

Survey and Response tables get a `verificationStatus` field (default `NONE`, transitions start in Phase 2).

## Verification Page (`/s/[slug]/verify`)

Public page showing the on-chain verification status of a survey.

### Checks

| # | Check | Method | Speed |
|---|-------|--------|-------|
| 1 | **Survey Content Integrity** | Recompute EIP-712 hash of survey content, compare to on-chain `surveyHash` | Live, instant |
| 2 | **Response Count** | Compare `getResponseCount(surveyHash)` on-chain with platform count | Live, instant |
| 3 | **Survey Closure** | Verify `SurveyClosed` event exists on-chain | Live, instant |
| 4 | **Response Integrity** | All IPFS CIDs exist, all blinded IDs are unique, count matches | Cached from close-time verification |

- Checks 1-3 run live on every page view (instant contract reads)
- Check 4 is cached — run once as a background job when the survey closes. Result stored in database. Displayed as "Last verified: {date} — all N responses verified."
- If someone doesn't trust the cached result, they use the open-source CLI or static page to re-run check 4 independently

### Page Content

- Survey title and hash
- Per-check status (green checkmark / details)
- Block numbers, timestamps, and Basescan links for each on-chain event
- Links to open-source verification tools

## Open-Source Verification Tools

Published on GitHub for fully independent verification:

### CLI Tool

```bash
npx @attestly/verify <survey-hash-or-slug>
```

- Runs all 4 checks from scratch using public Base RPC and IPFS gateways
- No Attestly server involved
- Outputs pass/fail per check with details
- Can be pointed at any RPC endpoint

### Static Verification Page

- Hosted on GitHub Pages (not on attestly.com)
- User pastes a survey hash
- Runs verification client-side using public RPC (e.g., Base public RPC) and IPFS gateways
- Zero server dependencies — purely client-side JavaScript
- Source code visible and auditable

## IPFS Pinning

Covered in detail in the IPFS & Storage spec. Summary of what gets pinned:

- **Survey publication:** full survey content JSON (questions, options, metadata) → CID referenced in publish job
- **Response submission:** response data (plaintext for public surveys, encrypted for private) → CID recorded on-chain via `submitResponse()`

## Privacy

- Wallet addresses are NOT stored in contract state or events
- Blinded identifiers (`keccak256(abi.encodePacked(walletAddress, surveyHash))`) are stored instead
- Signer address is recoverable from transaction calldata via deep forensic analysis
- Practical privacy, not cryptographically absolute — ZK proofs are the path to stronger privacy if needed

## tRPC Procedures (blockchain-related)

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `verification.getStatus` | Query | Public | Get verification status for a survey (4 checks) |
| `verification.getSurveyProof` | Query | Public | Get on-chain proof details (tx hashes, block numbers, Basescan links) |
| `verification.getResponseProof` | Query | Protected | Get on-chain proof for a specific response (respondent's own) |

## Component Structure

```
VerificationPage (/s/[slug]/verify)
├── VerificationHeader (survey title, hash)
├── CheckList
│   ├── CheckItem (Survey Content Integrity — live)
│   ├── CheckItem (Response Count — live)
│   ├── CheckItem (Survey Closure — live)
│   └── CheckItem (Response Integrity — cached)
├── OnChainDetails (block numbers, tx hashes, Basescan links)
└── IndependentVerificationLinks (CLI, static page, GitHub)
```

## Hardhat Project Structure

```
contracts/
├── Attestly.sol          # Main contract
├── interfaces/
│   └── IAttestly.sol     # Interface
├── test/
│   ├── Attestly.test.ts  # Contract tests
│   └── helpers/          # Test utilities
├── scripts/
│   ├── deploy.ts         # Deployment script
│   └── verify.ts         # Etherscan verification
├── hardhat.config.ts     # Hardhat configuration
└── .env                  # Contract deployment keys (not committed)
```

Located within the monolith (e.g., `/contracts` directory at project root) or as a separate workspace — both work with Hardhat.
