# Sub-Plan 2-1a: Hardhat Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a Hardhat project for Solidity smart contract development within the existing Attestly monorepo.

**Architecture:** Hardhat is configured at the project root alongside the existing Next.js app. Solidity contracts live in `contracts/` with a TypeScript-based Hardhat config. The contract interface (`IAttestly.sol`) defines all events and function signatures from the blockchain spec. An empty `Attestly.sol` imports the interface as a scaffold for the next sub-plan.

**Tech Stack:** Hardhat, Solidity 0.8.24, TypeScript, OpenZeppelin Contracts (upgradeable), Base/Base Sepolia

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

---

## File Structure

- Create: `hardhat.config.ts` — Hardhat configuration (root)
- Create: `contracts/interfaces/IAttestly.sol` — Contract interface
- Create: `contracts/Attestly.sol` — Empty contract scaffold
- Create: `contracts/test/` — Directory for test helper contracts
- Modify: `package.json` — Add Hardhat scripts
- Modify: `.gitignore` — Add Hardhat artifacts

---

### Task 1: Install Hardhat and dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Hardhat and all required dependencies**

Run the following command from the project root:

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts @openzeppelin/contracts-upgradeable dotenv
```

These packages provide:
- `hardhat` — Solidity development framework
- `@nomicfoundation/hardhat-toolbox` — Bundled plugins (ethers, chai, coverage, gas reporter, etc.)
- `@openzeppelin/contracts` — Standard contract library (ECDSA, EIP712, etc.)
- `@openzeppelin/contracts-upgradeable` — Upgradeable variants for UUPS proxy pattern
- `dotenv` — Environment variable loading for deployment keys

---

### Task 2: Create Hardhat configuration

**Files:**
- Create: `hardhat.config.ts`

- [ ] **Step 1: Create `hardhat.config.ts` at project root**

```typescript
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

// Two separate wallets for different roles:
// - ADMIN_PRIVATE_KEY: Owns the UUPS proxy (upgrade authority). Cold storage in production.
// - RELAYER_PRIVATE_KEY: Submits transactions (publishSurvey, submitResponse, etc.). Hot wallet.
//   In production, the relayer uses AWS KMS instead of a raw private key.
// Deploy scripts use the admin wallet. The relayer uses the relayer wallet at runtime.
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY ?? "";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY ?? "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      // Admin wallet first (used by deploy scripts), relayer wallet second
      accounts: [ADMIN_PRIVATE_KEY, RELAYER_PRIVATE_KEY].filter(Boolean),
    },
    base: {
      url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      chainId: 8453,
      accounts: [ADMIN_PRIVATE_KEY, RELAYER_PRIVATE_KEY].filter(Boolean),
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: BASESCAN_API_KEY,
      base: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
};

export default config;
```

Key decisions:
- `optimizer.runs: 200` — standard for contracts that are called often but deployed once
- `evmVersion: "paris"` — compatible with Base L2
- `paths.sources` points to `contracts/` at project root
- `paths.tests` points to `contracts/test/` for contract-specific tests
- `cache_hardhat` avoids collision with any Next.js cache directory
- Two separate wallets: `ADMIN_PRIVATE_KEY` (cold, owns proxy, used by deploy scripts) and `RELAYER_PRIVATE_KEY` (hot, submits transactions at runtime). Admin is accounts[0], relayer is accounts[1]. In production, admin is cold storage and relayer uses AWS KMS.

---

### Task 3: Create directory structure

**Files:**
- Create: `contracts/interfaces/` directory
- Create: `contracts/test/` directory

- [ ] **Step 1: Create the contract directory structure**

```bash
mkdir -p contracts/interfaces contracts/test
```

The structure will be:
```
contracts/
├── Attestly.sol
├── interfaces/
│   └── IAttestly.sol
└── test/
    └── (test helper contracts go here)
```

---

### Task 4: Create the IAttestly.sol interface

**Files:**
- Create: `contracts/interfaces/IAttestly.sol`

- [ ] **Step 1: Create `contracts/interfaces/IAttestly.sol` with all events and function signatures**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAttestly
 * @notice Interface for the Attestly survey verification contract.
 * @dev Records survey lifecycle events on Base L2 with EIP-712 signature verification.
 *      The contract enforces:
 *      - Survey hash uniqueness (no duplicate publications)
 *      - EIP-712 signature verification (relayer cannot forge)
 *      - Blinded ID uniqueness per survey (no duplicate responses)
 *      - State transitions (no responses after closure)
 *      - Creator-only closure (only the original creator can close)
 */
interface IAttestly {
    // ──────────────────────────────────────────────
    // Events (the public audit trail)
    // ──────────────────────────────────────────────

    /**
     * @notice Emitted when a survey is published on-chain.
     * @param surveyHash EIP-712 hash of the survey content
     * @param ipfsCid IPFS content identifier for the pinned survey JSON
     * @param timestamp Block timestamp of publication
     */
    event SurveyPublished(
        bytes32 indexed surveyHash,
        string ipfsCid,
        uint256 timestamp
    );

    /**
     * @notice Emitted when a response is submitted on-chain.
     * @param surveyHash The survey this response belongs to
     * @param blindedId keccak256(abi.encodePacked(signer, surveyHash)) — privacy-preserving respondent ID
     * @param ipfsCid IPFS content identifier for the pinned response data
     * @param timestamp Block timestamp of submission
     */
    event ResponseSubmitted(
        bytes32 indexed surveyHash,
        bytes32 indexed blindedId,
        string ipfsCid,
        uint256 timestamp
    );

    /**
     * @notice Emitted when a survey is closed by its creator.
     * @param surveyHash The closed survey
     * @param timestamp Block timestamp of closure
     */
    event SurveyClosed(
        bytes32 indexed surveyHash,
        uint256 timestamp
    );

    // ──────────────────────────────────────────────
    // State-changing functions
    // ──────────────────────────────────────────────

    /**
     * @notice Publish a survey on-chain. Verifies EIP-712 signature matches the creator.
     * @param surveyHash EIP-712 hash of the survey content
     * @param ipfsCid IPFS CID of the pinned survey JSON
     * @param creator Address of the survey creator (recovered from signature)
     * @param signature EIP-712 signature from the creator
     */
    function publishSurvey(
        bytes32 surveyHash,
        string calldata ipfsCid,
        address creator,
        bytes calldata signature
    ) external;

    /**
     * @notice Submit a response on-chain. Verifies EIP-712 signature, computes blinded ID,
     *         and enforces uniqueness.
     * @param surveyHash The target survey
     * @param blindedId Expected blinded identifier (verified against computed value)
     * @param ipfsCid IPFS CID of the pinned response data
     * @param signature EIP-712 signature from the respondent
     */
    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        bytes calldata signature
    ) external;

    /**
     * @notice Close a survey. Only the original creator can close (verified via signature).
     * @param surveyHash The survey to close
     * @param signature EIP-712 signature from the creator
     */
    function closeSurvey(
        bytes32 surveyHash,
        bytes calldata signature
    ) external;

    // ──────────────────────────────────────────────
    // View functions (for verifiers)
    // ──────────────────────────────────────────────

    /**
     * @notice Get survey data stored on-chain.
     * @param surveyHash The survey to query
     * @return creator Address of the survey creator
     * @return publishedAt Block timestamp of publication
     * @return closed Whether the survey has been closed
     * @return closedAt Block timestamp of closure (0 if not closed)
     * @return responseCount Number of responses recorded on-chain
     */
    function getSurvey(
        bytes32 surveyHash
    ) external view returns (
        address creator,
        uint256 publishedAt,
        bool closed,
        uint256 closedAt,
        uint256 responseCount
    );

    /**
     * @notice Check if a blinded ID has already submitted a response for a survey.
     * @param surveyHash The survey to check
     * @param blindedId The blinded identifier to check
     * @return True if a response with this blinded ID exists
     */
    function isResponseSubmitted(
        bytes32 surveyHash,
        bytes32 blindedId
    ) external view returns (bool);

    /**
     * @notice Get the number of on-chain responses for a survey.
     * @param surveyHash The survey to query
     * @return The response count
     */
    function getResponseCount(
        bytes32 surveyHash
    ) external view returns (uint256);
}
```

---

### Task 5: Create the empty Attestly.sol scaffold

**Files:**
- Create: `contracts/Attestly.sol`

- [ ] **Step 1: Create `contracts/Attestly.sol` with interface import and empty implementation**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "./interfaces/IAttestly.sol";

/**
 * @title Attestly
 * @notice On-chain survey verification contract for the Attestly platform.
 * @dev UUPS upgradeable proxy. Implements IAttestly interface.
 *      EIP-712 domain: name="Attestly", version="1"
 *
 *      Implementation will be added in sub-plan 2-1b.
 */
contract Attestly is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    EIP712Upgradeable,
    IAttestly
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __EIP712_init("Attestly", "1");
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ──────────────────────────────────────────────
    // IAttestly implementation stubs (to be filled in 2-1b)
    // ──────────────────────────────────────────────

    function publishSurvey(
        bytes32 surveyHash,
        string calldata ipfsCid,
        address creator,
        bytes calldata signature
    ) external override {
        revert("Not implemented");
    }

    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        bytes calldata signature
    ) external override {
        revert("Not implemented");
    }

    function closeSurvey(
        bytes32 surveyHash,
        bytes calldata signature
    ) external override {
        revert("Not implemented");
    }

    function getSurvey(
        bytes32 surveyHash
    ) external view override returns (
        address creator,
        uint256 publishedAt,
        bool closed,
        uint256 closedAt,
        uint256 responseCount
    ) {
        revert("Not implemented");
    }

    function isResponseSubmitted(
        bytes32 surveyHash,
        bytes32 blindedId
    ) external view override returns (bool) {
        revert("Not implemented");
    }

    function getResponseCount(
        bytes32 surveyHash
    ) external view override returns (uint256) {
        revert("Not implemented");
    }
}
```

---

### Task 6: Verify compilation

- [ ] **Step 1: Run Hardhat compilation and verify zero errors**

```bash
npx hardhat compile
```

Expected output:
```
Compiled N Solidity files successfully
```

If compilation fails, fix any import path issues or Solidity version mismatches before proceeding.

---

### Task 7: Add Hardhat scripts to package.json and update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add Hardhat scripts to package.json**

Add these entries to the `"scripts"` section of `package.json`:

```json
"compile": "hardhat compile",
"hardhat:test": "hardhat test"
```

- [ ] **Step 2: Add Hardhat artifacts to .gitignore**

Append the following to `.gitignore`:

```gitignore
# Hardhat
cache_hardhat/
artifacts/
typechain-types/
```

---

## Verification Checklist

- [ ] `npx hardhat compile` succeeds with zero errors
- [ ] `contracts/interfaces/IAttestly.sol` contains all 3 events and 6 functions from the spec
- [ ] `contracts/Attestly.sol` imports the interface and compiles (stub implementations)
- [ ] `hardhat.config.ts` has Base Sepolia (84532) and Base mainnet (8453) network configs
- [ ] `package.json` has `compile` and `hardhat:test` scripts
- [ ] `.gitignore` excludes `cache_hardhat/`, `artifacts/`, `typechain-types/`
