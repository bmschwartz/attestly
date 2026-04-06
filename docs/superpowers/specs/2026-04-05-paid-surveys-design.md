# Paid Surveys Design

## Overview

Paid surveys let creators incentivize participation with USDC rewards. The escrow contract holds funds and pays respondents instantly on submission. Phase 4 launches with direct USDC deposits from creator wallets. Phase 5 adds credit card funding via Stripe, making crypto invisible to mainstream creators.

## Premium Feature

Paid surveys are a premium feature. Free users see the bounty section in the builder with a lock icon: "Incentivize responses with USDC rewards — available on Premium."

## Phases

### Phase 4: Direct USDC (launch)
- Creator deposits USDC from their Privy wallet to the escrow contract
- Manual top-off to add more funds
- Respondents receive USDC instantly on submission

### Phase 5: Credit Card Funding (future)
- Creator registers a card via Stripe
- Attestly charges in batches ($25-50 at a time) to maintain a credit balance
- Auto-replenish when balance drops below threshold
- Attestly converts USD to USDC and deposits to escrow behind the scenes
- Creator experience: "I'm paying $0.50 per response with my Visa"

Both phases use the same escrow contract and payout logic. The only difference is how funds enter the contract.

## Escrow Contract

### Extension to IAttestly

```solidity
// Events
event BountyCreated(
    bytes32 indexed surveyHash,
    uint256 totalAmount,
    uint256 perResponse,
    uint256 maxResponses
);
event BountyToppedUp(
    bytes32 indexed surveyHash,
    uint256 additionalAmount,
    uint256 additionalResponses
);
event BountyPaid(
    bytes32 indexed surveyHash,
    bytes32 indexed blindedId,
    uint256 amount
);
event BountyRefunded(
    bytes32 indexed surveyHash,
    uint256 amount
);

// Functions
// createBounty is replaced by publishSurveyWithBounty for atomicity
function publishSurveyWithBounty(
    bytes32 surveyHash,
    string calldata ipfsCid,
    address creator,
    bytes calldata signature,
    uint256 perResponse,
    uint256 maxResponses
) external;

function topUpBounty(
    bytes32 surveyHash,
    uint256 additionalResponses
) external;

function closeSurvey(
    bytes32 surveyHash,
    bytes calldata signature
) external; // Updated: auto-refunds remaining USDC to creator
```

### Contract Logic

**USDC on Base:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (ERC-20)

**createBounty:**
1. Verify survey exists and caller is creator (or relayer with creator's signature)
2. Require USDC `approve()` already called for totalAmount (perResponse × maxResponses)
3. `transferFrom()` creator's wallet → contract
4. Store bounty state: perResponse, maxResponses, remainingResponses, creator address
5. Emit `BountyCreated`

**submitResponse (updated):**
1. Existing logic: verify signature, check uniqueness, record response
2. If bounty exists and remainingResponses > 0:
   - Transfer perResponse USDC from contract → respondent's wallet (recovered from signature)
   - Decrement remainingResponses
   - Emit `BountyPaid`
3. If bounty exists and remainingResponses == 0:
   - Revert (survey is full)

**Dual enforcement:** The API pre-checks response count against maxResponses before queueing the blockchain job (fast rejection, no wasted gas). The contract enforces as a trustworthy fallback. API check is a performance optimization; contract check is the security guarantee.

**topUpBounty:**
1. Verify survey exists, is PUBLISHED, caller is creator
2. Require USDC `approve()` for additionalAmount (perResponse × additionalResponses)
3. `transferFrom()` creator's wallet → contract
4. Increment maxResponses and remainingResponses
5. Emit `BountyToppedUp`

**closeSurvey (updated):**
1. Existing close logic
2. Calculate remaining = remainingResponses × perResponse
3. If remaining > 0: transfer USDC from contract → creator's wallet
4. Emit `BountyRefunded` (if remaining > 0)

### Bounty Exhaustion

When all bounty slots are filled (remainingResponses == 0):
- Contract rejects new responses to this survey
- Survey remains PUBLISHED but functionally full
- Landing page shows: "This survey has reached its response limit"
- Creator can top-off to accept more, or close the survey
- Dashboard shows: "100/100 responses · Bounty exhausted · [Add Funds] [Close]"

## Sybil Resistance & Fraud Prevention

Open paid surveys are vulnerable to sybil attacks (one person, many accounts). The following mitigation stack is required for all paid surveys:

### Cloudflare Turnstile
- Invisible challenge on "Start Survey" and "Submit" actions
- Blocks bots, scripts, headless browsers
- Free, privacy-friendly CAPTCHA alternative

### IP Rate Limiting
- Max N survey starts per hour from the same IP address
- Applied at the API layer (middleware)

### Device Fingerprinting
- Browser fingerprinting (e.g., FingerprintJS) to detect the same physical device across multiple Privy accounts
- If the same device fingerprint submits to the same paid survey from different accounts, flag and block

### Email Verification
- Privy email must be verified (not just provided) to submit to a paid survey
- Raises the cost of mass-creating throwaway accounts

### Delayed Payouts
- All paid survey responses have a **24-hour payout hold** before USDC is transferred
- During the hold period, the creator can review and reject suspicious responses
- After 24 hours, unreviewed responses are **auto-approved** and USDC is transferred

### Creator Manual Review
- Creator sees a "Pending Review" section on their dashboard for paid surveys
- Each pending response shows: submission time, device fingerprint hash (anonymized), response preview
- Creator can **Approve** (triggers immediate payout) or **Reject** (response remains in results but no payout, USDC returned to bounty pool)
- After 24 hours without creator action, response is auto-approved and paid out
- Rejected responses still count as submitted (on-chain integrity preserved) but do not receive USDC

### Data Model Addition

Response table:

| Field | Type | Notes |
|-------|------|-------|
| payoutStatus | Enum | NONE (no bounty), PENDING_REVIEW (24hr hold), APPROVED, REJECTED, PAID, PAYOUT_FAILED. Default NONE. |
| payoutApprovedAt | DateTime? | When creator approved or auto-approval triggered |
| deviceFingerprint | String? | Hashed device fingerprint for fraud detection |

## Payment Flow

### Respondent Receives USDC

USDC is transferred from the escrow contract to the respondent's Privy wallet after the 24-hour review period (or immediate creator approval). The payout is triggered by a background job that processes approved responses.

The respondent sees "Payment pending review (up to 24 hours)" on their confirmation page, then receives USDC in their wallet once approved.

### What If the On-Chain Tx Fails?

The respondent's answers are saved to Postgres (for results) immediately. The USDC payout happens when the background worker successfully submits the `submitResponse` transaction.

| Scenario | Behavior |
|----------|----------|
| Tx succeeds | Respondent receives USDC. Normal flow. |
| Tx fails, retry succeeds | Respondent receives USDC on retry. Slight delay. |
| All retries fail | Response is recorded in Postgres but unpaid. Alert triggered. Requires manual resolution — admin submits the tx manually or refunds the creator. |

Failed payouts should be rare (Base is reliable) but need monitoring and alerting.

## Survey Builder Integration

Premium users see a bounty section in the survey metadata:

```
┌──────────────────────────────────────────┐
│  💰 Bounty (optional)                    │
│                                          │
│  Reward per response:  [___] USDC        │
│  Max responses:        [___]             │
│                                          │
│  Total deposit: 50.00 USDC               │
│  Your wallet balance: 127.50 USDC        │
│                                          │
│  Funds will be pulled from your wallet   │
│  when you publish this survey.           │
└──────────────────────────────────────────┘
```

- Bounty is optional — premium users can publish without one
- Total deposit calculated live: perResponse × maxResponses
- Wallet balance fetched from creator's Privy wallet for reference
- Validation on publish: creator must have sufficient USDC balance

## Publication Flow (with bounty)

1. Creator clicks Publish
2. Standard validation (questions, slug, categories, etc.)
3. If bounty set: check creator's wallet balance >= total deposit
4. Confirmation dialog: "Publishing this survey will pull {totalAmount} USDC from your wallet as bounty for respondents. This is irreversible. Continue?"
5. Creator's wallet signs USDC `approve(contractAddress, totalAmount)` — Privy handles the signing prompt
6. Background worker calls `publishSurveyWithBounty()` on the contract (atomic — survey + bounty created in one tx). For surveys without bounty, uses `publishSurvey()`.

## Top-Off Flow

Creator wants more responses after initial bounty is partially or fully consumed.

1. Creator clicks "Add Funds" on the dashboard survey card
2. Input: "Additional responses: [___]" — total calculated as additionalResponses × perResponse
3. Wallet balance shown for reference
4. Creator confirms, signs USDC `approve()` for additional amount
5. Background worker calls `topUpBounty()` on the contract
6. Survey can accept more responses

## Dashboard Integration

Published surveys with bounties show:

```
│  Employee Satisfaction 2026              Published │
│  73/100 responses · $0.50/response                 │
│  💰 $36.50 paid · $13.50 remaining                 │
│                                                    │
│  [View Results] [Add Funds] [Copy Link] [Close]    │
```

When exhausted:

```
│  Employee Satisfaction 2026              Published │
│  100/100 responses · $0.50/response                │
│  💰 $50.00 paid · Bounty exhausted                 │
│                                                    │
│  [View Results] [Add Funds] [Copy Link] [Close]    │
```

## Explore Page Integration

Survey cards with bounties show a badge:

```
│  Remote Work Survey                      Research │
│  by Dr. Sarah Chen · 42 responses · 2d ago        │
│  💰 $0.50 USDC per response (58 remaining)        │
```

Bounty filter in the explore page:
- Toggle: "Has bounty" — show only paid surveys
- Minimum reward input: "Min reward: $___" — filter by per-response amount
- Sort option: "Highest bounty" — sort by per-response payout

## Respondent Experience

### Landing Page

Paid surveys show the bounty prominently:

```
│  Employee Satisfaction Survey 2026               │
│  by Acme Corp                                    │
│                                                  │
│  💰 Earn $0.50 USDC for completing this survey   │
│  58 spots remaining                              │
│                                                  │
│  12 questions · ~5 min                           │
│  [Start Survey]                                  │
```

### Post-Submit Confirmation

```
│  ✓ Response Submitted                            │
│                                                  │
│  💰 $0.50 USDC has been sent to your wallet      │
│  (or: 💰 $0.50 USDC pending — confirming on-chain)│
│                                                  │
│  🔒 Verification Proof                           │
│  ...                                             │
```

## Phase 5: Credit Card Funding (Future)

### Architecture

```
Creator's Card → Stripe → Attestly receives USD
    → Fiat-to-USDC conversion (on-ramp provider)
    → USDC deposited to escrow contract
    → Respondent submits → instant USDC payout
```

### Batch Charging

Per-submission card charges are not viable — Stripe fees (~$0.30 + 2.9% per transaction) would consume most of a $0.50 response reward. Instead:

- Creator sets per-response reward and registers a card
- Attestly charges in batches ($25-50) to maintain a credit balance
- When credit balance drops below threshold (e.g., 10 responses worth), auto-charge next batch
- Creator sees a running balance in the dashboard
- Fees amortized across batches instead of per-transaction

### Creator Experience (Phase 5)

"I'm paying $0.50 per response with my Visa. I don't need to know what USDC is."

### Requirements (not built in Phase 4)

- Stripe integration for card storage and charging
- Fiat-to-USDC conversion pipeline (Moonpay, Transak, or similar)
- Credit balance management in Postgres
- Auto-replenishment logic
- Refund handling (remaining credit balance when survey closes)
- Stripe webhook handling for failed charges

## Data Model

### SurveyBounty table (already in data model spec)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey, Unique | 1:1 relationship |
| totalAmount | Decimal | | Total USDC deposited (including top-offs) |
| perResponse | Decimal | | USDC per respondent |
| maxResponses | Int | | Total max responses (including top-offs) |
| remainingResponses | Int | | Decremented on each payout |
| escrowTxHash | String? | | Initial createBounty tx hash |
| currency | String | | Always "USDC" for Phase 4 |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

Note: `remainingResponses` is defined in the canonical data model spec.

### Response table addition

| Field | Type | Notes |
|-------|------|-------|
| payoutAmount | Decimal? | USDC amount paid to respondent. Null if no bounty. |
| payoutTxHash | String? | Tx hash of the USDC transfer. Null if no bounty. |

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `bounty.create` | Mutation | Protected | Set bounty params on a draft survey (before publish) |
| `bounty.topUp` | Mutation | Protected | Add more funds to a published survey's bounty |
| `bounty.getStatus` | Query | Protected | Get bounty status (paid, remaining, response count) |
| `bounty.getForSurvey` | Query | Public | Get bounty info for survey landing page (per-response amount, remaining) |

## Component Structure

```
SurveyBuilderPage (additions)
└── BountyConfig (premium)
    ├── PerResponseInput
    ├── MaxResponsesInput
    ├── TotalDepositDisplay
    └── WalletBalanceDisplay

DashboardPage (additions)
└── SurveyCard (bounty info)
    ├── BountyProgress (paid / remaining)
    └── TopUpButton → TopUpModal

SurveyLandingPage (additions)
└── BountyBadge (amount, remaining spots)

ConfirmationPage (additions)
└── PayoutNotice (amount sent, tx link)
```
