# Private Surveys Design

## Overview

Private surveys encrypt response data before pinning to IPFS, protecting response content on the decentralized/public storage layer. Attestly holds per-survey encryption keys, protected by AWS KMS envelope encryption. Verification is possible via downloadable verification bundles shared with auditors.

**Important privacy scope:** "Private" means encrypted on IPFS. Plaintext answers remain in the Postgres database for aggregation, AI insights, and results display. This means the platform operator (Attestly) can read private survey responses in the database — the encryption protects against external observers reading IPFS content (adversary C), not against a compromised or malicious platform (adversary B). The blockchain layer protects *integrity* (tamper-proof) against all adversaries including B, but *confidentiality* from B would require client-side encryption that makes aggregation impractical. This is a deliberate tradeoff documented in the threat model.

## Premium Feature

Private surveys are a premium feature. Free users see the "Private" toggle in the survey builder with a lock icon and upsell: "Make responses private and control who sees results — available on Premium."

## Encryption Architecture

### Envelope Encryption (two layers)

```
AWS KMS Master Key (never leaves HSM)
    └── encrypts → Per-Survey Key (stored in Postgres as encrypted blob)
                        └── encrypts → Individual Response (stored on IPFS)
```

1. **Master key:** lives in AWS KMS hardware security modules. Never exposed to application code. One key handles all surveys.
2. **Per-survey key:** random 256-bit AES key, generated when a private survey is published. Encrypted by the KMS master key before storage in Postgres.
3. **Per-response encryption:** each response is encrypted with the survey's key + a unique random IV using AES-256-GCM.

### Why Two Layers

- A database breach gets encrypted survey keys — useless without AWS KMS access
- KMS access is separately controlled via IAM policies
- An attacker needs to compromise both the database AND AWS IAM credentials
- KMS provides audit logs of every decrypt operation
- Master key rotation re-encrypts survey keys without touching IPFS content

## Encryption Flow

### Survey Publication (private survey)

```
Creator publishes private survey
    → PUBLISH_SURVEY worker:
        1. Generate random 256-bit AES key
        2. Call AWS KMS Encrypt(masterKeyId, surveyKey) → encryptedSurveyKey
        3. Store encryptedSurveyKey in EncryptionKey table
        4. Pin survey JSON to IPFS (survey content is NOT encrypted — questions are public)
        5. Submit to Base contract as usual
```

Note: the survey content itself (questions, options) is NOT encrypted. Only responses are encrypted. The survey needs to be publicly readable so verifiers can confirm what was asked.

### Response Submission (private survey)

```
Respondent submits response
    → API saves plaintext answers to Postgres (for queries/aggregation)
    → SUBMIT_RESPONSE worker:
        1. Serialize response JSON (blinded ID, answers, signature)
        2. Fetch encryptedSurveyKey from EncryptionKey table
        3. Call AWS KMS Decrypt(encryptedSurveyKey) → surveyKey
        4. Generate random 96-bit IV
        5. Encrypt: AES-256-GCM(surveyKey, iv, responseJSON) → ciphertext + authTag
        6. Assemble encrypted blob JSON
        7. Pin encrypted blob to IPFS → CID
        8. Store IV and CID on Response record
        9. Submit to Base contract as usual
```

## Encrypted IPFS Blob Format

```json
{
  "version": "1",
  "format": "aes-256-gcm",
  "iv": "<base64-encoded 96-bit IV>",
  "tag": "<base64-encoded 128-bit auth tag>",
  "ciphertext": "<base64-encoded encrypted response JSON>"
}
```

When decrypted, the ciphertext yields the same response JSON format as public surveys:

```json
{
  "version": "1",
  "surveyHash": "0x4d2e...a7f0",
  "respondent": "0x8f3a...b2c1",
  "answers": [
    { "questionIndex": 0, "questionType": "SINGLE_SELECT", "value": "Satisfied" }
  ],
  "signature": "0x..."
}
```

## Key Management

### AWS KMS Configuration

**Environment variables:**
```
AWS_KMS_KEY_ID=<KMS master key ARN>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<IAM credentials>
AWS_SECRET_ACCESS_KEY=<IAM credentials>
```

Add to `src/env.js` validation (server-side only).

**IAM policy:** the application's IAM role needs only `kms:Encrypt` and `kms:Decrypt` permissions on the master key. No `kms:CreateKey`, no `kms:DeleteKey`.

**Cost:** $1/mo per master key + $0.03 per 10,000 API calls. Negligible at any scale.

### Master Key Rotation

AWS KMS supports automatic annual key rotation. When rotated:
- KMS retains all previous key versions
- Existing encrypted survey keys can still be decrypted (KMS handles this transparently)
- New survey keys are encrypted with the new key version
- No re-encryption of existing data needed
- IPFS content is unaffected

### Per-Survey Key Lifecycle

| Event | Action |
|-------|--------|
| Private survey published | Generate random 256-bit key, encrypt with KMS, store in EncryptionKey table |
| Response submitted | Decrypt survey key via KMS (cache decrypted key in memory for 5 minutes to avoid repeated KMS calls under load), encrypt response |
| Verification bundle requested | Decrypt survey key via KMS, include plaintext key in bundle |
| Survey deleted (draft only) | Delete EncryptionKey record. Published surveys are never deleted. |

## Verification Bundle

### Purpose

Allows third-party auditors to independently verify private survey responses without trusting Attestly. The bundle contains everything needed: the survey content, the decryption key, and the decrypted responses.

### Structure

```typescript
interface VerificationBundle {
  version: "1"
  surveyHash: string
  survey: {
    // Full survey content JSON (same as IPFS)
    title: string
    description: string
    creator: string
    slug: string
    isPrivate: true
    questions: Question[]
  }
  encryptionKey: string           // Per-survey AES key (base64)
  responses: {
    blindedId: string
    ipfsCid: string
    iv: string                    // Per-response IV (base64)
    answers: Answer[]             // Decrypted answers
  }[]
  totalResponseCount: number
}
```

### Verification Steps

1. Recompute EIP-712 hash of `survey` → must match `surveyHash` → must match on-chain
2. Call `getResponseCount(surveyHash)` on-chain → must match `totalResponseCount` and `responses.length` (no omissions)
3. For each response:
   - Fetch encrypted blob from IPFS using `ipfsCid`
   - Decrypt with `encryptionKey` + `iv` from the bundle
   - Confirm decrypted content matches `answers` in the bundle
   - Confirm `ipfsCid` and `blindedId` exist on-chain for this survey
4. All checks pass = mathematically verified, no trust in Attestly required

### Generation

- Creator requests from the results page or dashboard: "Generate Verification Bundle" button
- Server decrypts all responses via KMS, assembles the bundle, returns as a downloadable JSON file
- Bundle is generated on-demand, not pre-computed or stored
- For large surveys, generation is async — creator receives a notification when ready

### Security of the Bundle

The verification bundle contains the encryption key and decrypted responses. It is **highly sensitive material:**
- **Permanent key exposure:** once the bundle is downloaded, the per-survey AES key is irrevocably exposed. If the bundle leaks, all IPFS-stored encrypted responses for that survey become permanently decryptable by anyone. IPFS CIDs are immutable — there is no way to re-encrypt the data.
- Creator is responsible for sharing it securely (encrypted email, secure file transfer, NDA-protected channels)
- Attestly does not store or transmit the bundle beyond the initial download
- The bundle should be treated with the same care as the raw response data
- The UI should warn the creator before generating: "This bundle contains your encryption key. Anyone who obtains this file can decrypt all responses for this survey. Share it only with trusted parties."

## Postgres Storage (Plaintext)

Even for private surveys, plaintext answers are stored in the Postgres Answer table. This is necessary for:
- Results aggregation and charts (SQL queries on Answer table)
- AI Insights (LLM needs plaintext to generate summaries)
- Creator's real-time results view

The encryption layer protects data on IPFS (the decentralized, publicly accessible layer). Postgres is protected by standard application security (auth, access control, encryption at rest).

## Public vs Private Comparison

| Aspect | Public Survey | Private Survey |
|--------|--------------|----------------|
| Survey content (IPFS) | Plaintext | Plaintext (questions are public) |
| Response data (IPFS) | Plaintext JSON | AES-256-GCM encrypted blob |
| Response data (Postgres) | Plaintext | Plaintext (for queries) |
| On-chain records | Identical | Identical |
| Verification (page) | Checks 1-3 live, check 4 verifies CIDs exist | Same |
| Verification (full) | Anyone fetches + reads IPFS content | Requires verification bundle |
| Key management | None | Per-survey key, KMS envelope encryption |
| Results access | Per `resultsVisibility` | Per `resultsVisibility` |

## Data Model Additions

### EncryptionKey table

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey, Unique | One key per private survey |
| encryptedKey | String | | Per-survey AES key, encrypted with KMS master key (base64) |
| createdAt | DateTime | | |

### Response table addition

| Field | Type | Notes |
|-------|------|-------|
| encryptionIv | String? | Base64-encoded IV. Null for public surveys. |

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `verification.generateBundle` | Mutation | Protected | Generate and download verification bundle (creator only, private surveys only) |

## Component Structure

```
ResultsPage (private survey additions)
├── GenerateBundleButton (creator only, premium)
│   └── BundleGenerationStatus (processing / ready / download)
```

The rest of the results page is identical between public and private surveys — charts and aggregations read from Postgres, not IPFS.
