# Sub-Plan 2-6: Open-Source Verification Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone verification CLI and static verification page for fully independent, trustless survey verification. This plan can be deferred to post-launch --- it is independent of the rest of Phase 2.

**Architecture:** A separate `packages/verify/` package within the monorepo. The CLI connects directly to a Base RPC endpoint and public IPFS gateways --- no Attestly server involved. The static HTML page does the same verification entirely client-side using ethers.js from CDN. The CLI uses survey HASH only (not slug) for trustless verification; slug-to-hash requires Attestly's API.

**Tech Stack:** TypeScript, ethers.js, Node.js CLI (tsx), static HTML + vanilla JS

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

**Note:** This plan is independent of Sub-Plans 2-5a and 2-5b. It can be implemented at any time.

---

## File Structure

- Create: `packages/verify/package.json` — package manifest with bin entry
- Create: `packages/verify/tsconfig.json` — TypeScript config
- Create: `packages/verify/src/index.ts` — CLI entry point
- Create: `packages/verify/src/checks.ts` — pure verification check functions
- Create: `packages/verify/src/contract.ts` — contract ABI and connection helpers
- Create: `packages/verify/src/eip712.ts` — EIP-712 hash recomputation logic
- Create: `packages/verify/src/ipfs.ts` — IPFS gateway fetching utilities
- Create: `packages/verify/src/types.ts` — shared type definitions
- Create: `packages/verify/static/index.html` — static client-side verification page
- Create: `packages/verify/README.md` — usage instructions

---

### Task 1: Set up the package

**Files:**
- Create: `packages/verify/package.json`
- Create: `packages/verify/tsconfig.json`

- [ ] **Step 1: Create `packages/verify/package.json`** with:
  - `name`: `@attestly/verify`
  - `version`: `0.1.0`
  - `bin`: `{ "attestly-verify": "./dist/index.js" }`
  - `type`: `module`
  - Dependencies: `ethers` (v6), `commander` (CLI framework)
  - Dev dependencies: `typescript`, `tsx`, `vitest`
  - Scripts: `build`, `dev`, `test`
- [ ] **Step 2: Create `packages/verify/tsconfig.json`** targeting ES2022, module NodeNext, outDir `./dist`
- [ ] **Step 3: Verify the package installs** with `npm install` from the package directory

---

### Task 2: Implement contract connection helpers

**Files:**
- Create: `packages/verify/src/contract.ts`
- Create: `packages/verify/src/types.ts`

- [ ] **Step 1: Create `types.ts`** with type definitions:
  - `CheckResult`: `{ name: string, status: 'pass' | 'fail' | 'error', details: string, blockNumber?: number, timestamp?: number }`
  - `VerificationReport`: `{ surveyHash: string, checks: CheckResult[], overallStatus: 'pass' | 'fail' | 'error' }`
  - `SurveyOnChainData`: matches the return type of `getSurvey()` from the contract
- [ ] **Step 2: Create `contract.ts`** with:
  - The Attestly contract ABI (only the view functions and events needed for verification)
  - `createProvider(rpcUrl: string)` — create an ethers.js provider
  - `createContract(provider, contractAddress)` — create a contract instance
  - Default RPC URL: Base mainnet public RPC (`https://mainnet.base.org`)
  - Default contract address: configurable via environment variable or CLI flag

---

### Task 3: Implement pure verification check functions

**Files:**
- Create: `packages/verify/src/checks.ts`
- Create: `packages/verify/src/eip712.ts`
- Create: `packages/verify/src/ipfs.ts`

- [ ] **Step 1: Create `eip712.ts`** with:
  - The EIP-712 domain and type definitions matching the contract spec
  - `computeSurveyHash(surveyData)` — recompute the EIP-712 typed data hash from survey JSON
  - Use ethers.js `TypedDataEncoder` for hash computation
- [ ] **Step 2: Create `ipfs.ts`** with:
  - `fetchFromIPFS(cid: string, gateway?: string)` — fetch content from a public IPFS gateway
  - Default gateway: `https://gateway.pinata.cloud/ipfs/` (or similar public gateway)
  - Fallback gateways: `https://ipfs.io/ipfs/`, `https://cloudflare-ipfs.com/ipfs/`
  - Retry logic across gateways if one fails
- [ ] **Step 3: Create `checks.ts`** with four check functions:
  - `checkSurveyContentIntegrity(contract, surveyHash)`:
    - Fetch survey data from IPFS (get CID from `SurveyPublished` event)
    - Recompute EIP-712 hash from the IPFS content
    - Compare to the on-chain survey hash
    - Return `CheckResult`
  - `checkResponseCount(contract, surveyHash)`:
    - Call `getResponseCount(surveyHash)` on contract
    - Query `ResponseSubmitted` events to independently count
    - Compare the two counts
    - Return `CheckResult`
  - `checkSurveyClosure(contract, surveyHash)`:
    - Query for `SurveyClosed` event with the given survey hash
    - Verify the event exists and extract block number / timestamp
    - Return `CheckResult`
  - `checkResponseIntegrity(contract, surveyHash)`:
    - Query all `ResponseSubmitted` events for this survey
    - For each: verify IPFS CID is fetchable, verify blinded ID uniqueness
    - Compare total count to `getResponseCount()`
    - Return `CheckResult` with summary (N responses verified, any failures)
- [ ] **Step 4: Create `runAllChecks(contract, surveyHash)` orchestrator** that runs all 4 checks and returns a `VerificationReport`

---

### Task 4: Build the CLI entry point

**Files:**
- Create: `packages/verify/src/index.ts`

- [ ] **Step 1: Set up the CLI** using `commander`:
  - Command: `attestly-verify <survey-hash>`
  - Options:
    - `--rpc <url>` — custom RPC endpoint (default: Base mainnet)
    - `--contract <address>` — custom contract address
    - `--verbose` — show detailed output for each check
    - `--json` — output results as JSON
- [ ] **Step 2: Implement the main flow:**
  - Parse CLI args
  - Create provider and contract instance
  - Call `runAllChecks(contract, surveyHash)`
  - Print results in a human-readable table format (or JSON if `--json`)
- [ ] **Step 3: Add colored output:**
  - Green for pass, red for fail, yellow for error/warning
  - Summary line: "X/4 checks passed" with overall status
- [ ] **Step 4: Add the hashbang** `#!/usr/bin/env node` at the top for `npx` execution
- [ ] **Step 5: Test the CLI** by running `npx tsx src/index.ts <test-hash>` locally

---

### Task 5: Build the static verification page

**Files:**
- Create: `packages/verify/static/index.html`

- [ ] **Step 1: Create a single-file HTML page** with embedded CSS and JavaScript
- [ ] **Step 2: Include ethers.js via CDN** (`<script src="https://cdn.ethers.io/lib/ethers-6.min.js">`)
- [ ] **Step 3: Build the UI:**
  - Input field for survey hash
  - "Verify" button
  - Optional: RPC endpoint field (default: Base mainnet public RPC)
  - Results section showing 4 checks with pass/fail indicators
  - Block numbers, timestamps, and Basescan links for each check
- [ ] **Step 4: Implement client-side verification logic:**
  - On button click: create ethers provider, instantiate contract, run all 4 checks
  - Display results progressively as each check completes
  - Show errors gracefully (RPC unreachable, invalid hash, etc.)
- [ ] **Step 5: Style the page** — clean, minimal design. Include Attestly branding but emphasize independence:
  - Header: "Independent Attestly Verification"
  - Note: "This page runs entirely in your browser. No data is sent to Attestly servers."
  - Link to source code on GitHub
- [ ] **Step 6: Ensure the page works offline** once loaded (all JS is inlined or from CDN, no server calls except RPC and IPFS)

---

### Task 6: Write README

**Files:**
- Create: `packages/verify/README.md`

- [ ] **Step 1: Write usage instructions** covering:
  - What the tool does and why it exists
  - CLI installation: `npx @attestly/verify <survey-hash>`
  - CLI options (RPC, contract address, verbose, JSON output)
  - Static page: how to open `index.html` locally or via GitHub Pages
  - Important: the CLI uses survey HASH, not slug. To get a hash from a slug, visit the survey's verification page on attestly.com or use the Attestly API.
- [ ] **Step 2: Add a "How Verification Works" section** explaining the 4 checks
- [ ] **Step 3: Add a "Trust Model" section** explaining why this tool exists (verify without trusting Attestly's servers)

---

### Task 7: Typecheck and build

- [ ] **Step 1: Run `npx tsc --noEmit`** from `packages/verify/` and fix any type errors
- [ ] **Step 2: Run the build script** to produce `dist/` output
- [ ] **Step 3: Verify `npx tsx src/index.ts --help`** prints the CLI help text
