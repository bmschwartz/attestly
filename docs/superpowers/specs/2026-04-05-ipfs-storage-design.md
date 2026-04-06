# IPFS & Storage Design

## Overview

Attestly uses three storage layers: Postgres as the primary data store, IPFS (via Pinata) as a verifiable decentralized backup, and Base L2 for immutable hash records. This design ensures data survives even if Attestly goes offline, while maintaining fast queries for the application.

## Storage Distribution

| Data | Postgres | IPFS (Pinata) | On-Chain (Base) |
|------|----------|---------------|-----------------|
| Survey metadata (title, desc, slug, status, dates) | Yes (primary) | Yes (JSON) | Hash only |
| Questions + options | Yes (primary) | Yes (in survey JSON) | Part of survey hash |
| Response answers | Yes (primary) | Yes (plaintext or encrypted) | CID only |
| User accounts | Yes | No | No |
| Blinded IDs | Yes | No | Yes |
| Tx hashes | Yes | No | Yes (native) |
| AI summaries | Yes | No | No |
| Survey invites | Yes | No | No |
| Verification results (cached) | Yes | No | No |

## IPFS Content Formats

All IPFS content includes a `version` field for forward compatibility. If the schema ever changes, verification tools use the version to determine which schema to apply for hash computation.

**Deterministic serialization:** All JSON pinned to IPFS must use deterministic serialization per RFC 8785 (JSON Canonicalization Scheme) — keys sorted lexicographically, no trailing whitespace, no trailing newlines, UTF-8 encoding, no BOM, no insignificant whitespace. This ensures any party re-serializing the same data produces identical bytes and therefore an identical CID. A shared utility function (used by both the platform and open-source verification tools) should enforce this.

### Survey JSON (pinned at publication)

```json
{
  "version": "1",
  "title": "Employee Satisfaction Survey 2026",
  "description": "We'd love to hear your honest feedback...",
  "creator": "0x1a2b...3c4d",
  "slug": "employee-survey-x7k2",
  "isPrivate": false,
  "questions": [
    {
      "text": "How satisfied are you with your role?",
      "questionType": "SINGLE_SELECT",
      "position": 0,
      "required": true,
      "options": ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"],
      "minRating": 0,
      "maxRating": 0,
      "maxLength": 0
    },
    {
      "text": "Rate your work-life balance",
      "questionType": "RATING",
      "position": 1,
      "required": true,
      "options": [],
      "minRating": 1,
      "maxRating": 5,
      "maxLength": 0
    }
  ]
}
```

This mirrors the EIP-712 Survey struct exactly. A verifier can take this JSON, compute the EIP-712 hash, and compare to the on-chain `surveyHash`.

### Response JSON — Public Survey (plaintext)

```json
{
  "version": "1",
  "surveyHash": "0x4d2e...a7f0",
  "respondent": "0x8f3a1b2c...64-char-hex-blinded-id...d4e5f6a7",
  "answers": [
    { "questionIndex": 0, "questionType": "SINGLE_SELECT", "value": "Satisfied" },
    { "questionIndex": 1, "questionType": "RATING", "value": "4" }
  ],
  "signature": "0x..."
}
```

- `respondent` is the blinded ID (`keccak256(abi.encodePacked(walletAddress, surveyHash))`), not the raw wallet address
- `signature` is the respondent's EIP-712 signature over the SurveyResponse struct
- A verifier can recover the signer from the signature and recompute the blinded ID to confirm authenticity

### Response JSON — Private Survey (encrypted)

Covered in the Private Surveys spec (Topic 11). The IPFS content is an AES-256-GCM encrypted blob of the same response JSON structure above. The CID is content-addressed against the encrypted data, not the plaintext.

## Pinata Integration

### API Usage

| Operation | Trigger | Pinata API |
|-----------|---------|------------|
| Pin survey JSON | Background worker: `PUBLISH_SURVEY` job | `pinJSONToIPFS` |
| Pin response data | Background worker: `SUBMIT_RESPONSE` job | `pinJSONToIPFS` (public) or `pinFileToIPFS` (encrypted) |
| Fetch content | Verification page, CLI tool, response integrity check | Dedicated IPFS gateway |

### Configuration

**Environment variables:**
```
PINATA_API_KEY=<from Pinata dashboard>
PINATA_SECRET_KEY=<from Pinata dashboard>
PINATA_GATEWAY_URL=<dedicated gateway URL>
```

Add to `src/env.js` validation (server-side only).

### Pin Organization

- **Pin naming convention:**
  - Surveys: `survey-{surveyHash}` (e.g., `survey-0x4d2e...a7f0`)
  - Responses: `response-{surveyHash}-{blindedId}` (e.g., `response-0x4d2e-0x8f3a`)
- **Pinning groups:** group pins by survey hash for easy management, monitoring, and cleanup in the Pinata dashboard

### Dedicated Gateway

Pinata provides a dedicated IPFS gateway per account for reliable content fetching. Use this for:
- Verification page content loading
- Response integrity checks
- Any server-side IPFS reads

For the open-source verification CLI/static page, use public IPFS gateways (e.g., `dweb.link`, `w3s.link`) to maintain independence from Attestly infrastructure.

## Data Flow

### Survey Publication

```
Creator clicks Publish
    → API validates + saves to Postgres
    → PUBLISH_SURVEY job queued
    → Worker:
        1. Serialize survey to JSON (matching EIP-712 struct)
        2. Pin JSON to IPFS via Pinata → get CID
        3. Compute EIP-712 hash
        4. Submit publishSurvey(hash, creator, signature) to Base
        5. Update Survey record: contentHash, publishTxHash, ipfsCid, verificationStatus=SUBMITTED (then VERIFIED once tx is confirmed on-chain)
```

### Response Submission

```
Respondent clicks Submit
    → API validates + saves Response + Answers to Postgres
    → SUBMIT_RESPONSE job queued
    → Worker:
        1. Serialize response to JSON (with blinded ID, answers, signature)
        2. For public surveys: pin plaintext JSON to IPFS
           For private surveys: encrypt JSON, pin encrypted blob to IPFS
        3. Get CID from Pinata
        4. Submit submitResponse(surveyHash, blindedId, ipfsCid, signature) to Base
        5. Update Response record: ipfsCid, blindedId, submitTxHash, verificationStatus=SUBMITTED (then VERIFIED once tx is confirmed on-chain)
```

## Data Model Addition

Survey table needs an `ipfsCid` field for the pinned survey JSON:

| Field | Type | Notes |
|-------|------|-------|
| ipfsCid | String? | IPFS CID of the pinned survey JSON. Set by PUBLISH_SURVEY worker. |

(Response table already has `ipfsCid` from the data model spec.)

## Redundancy & Disaster Recovery

| Layer | Durability | What it guarantees |
|-------|-----------|-------------------|
| **Postgres** | Standard DB backups | Fast queries, primary data store, full application state |
| **IPFS (Pinata)** | Pinned as long as Pinata subscription is active | Decentralized availability, verifier independence |
| **On-chain (Base)** | Permanent, immutable | Hashes and CIDs can never be removed or altered |

### If Pinata goes down
- Application continues to work normally (reads from Postgres)
- New pins queue and retry when Pinata recovers
- Verification page degrades gracefully: checks 1-3 still work (on-chain reads), check 4 shows "IPFS gateway unavailable"
- Existing pins may still be served by other IPFS nodes that have cached the content

### If Attestly migrates from Pinata
- CIDs are content-addressed — the same content produces the same CID on any pinning provider
- Migration: re-pin all existing CIDs to new provider (Filebase, web3.storage, etc.)
- On-chain records remain valid — they reference CIDs, not Pinata-specific URLs

## Cost Estimates

Pinata pricing (as of 2026):
- **Free tier:** 500 pins, 100MB storage
- **Professional:** $20/mo, 50K pins, 25GB storage
- **Enterprise:** custom pricing

Each survey is 1 pin (a few KB). Each response is 1 pin (< 1KB typically). A survey with 1,000 responses = 1,001 pins, ~1MB. At scale, Professional tier covers a significant volume. Enterprise for high-throughput.
