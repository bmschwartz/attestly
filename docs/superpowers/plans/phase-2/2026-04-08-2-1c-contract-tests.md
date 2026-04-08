# Sub-Plan 2-1c: Contract Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write comprehensive Hardhat tests for the Attestly contract covering all functions, on-chain enforcement rules, EIP-712 signature verification, and UUPS upgradeability.

**Architecture:** Tests use Hardhat's test framework with ethers.js v6 for EIP-712 signing, Chai for assertions, and OpenZeppelin's upgrades plugin for proxy deployment. A helper module provides reusable EIP-712 signing functions and test fixtures. Tests cover all 6 on-chain enforcement rules, happy paths, and revert cases.

**Tech Stack:** Hardhat, ethers.js v6, Chai, @openzeppelin/hardhat-upgrades, TypeScript

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

---

## File Structure

- Create: `contracts/test/Attestly.test.ts` — Main test file
- Create: `contracts/test/helpers/eip712.ts` — EIP-712 signing helpers
- Create: `contracts/test/helpers/fixtures.ts` — Shared test fixtures
- Modify: `package.json` — Ensure `@openzeppelin/hardhat-upgrades` is installed

---

### Task 0: Install test dependencies

- [ ] **Step 1: Install OpenZeppelin hardhat-upgrades plugin**

```bash
npm install --save-dev @openzeppelin/hardhat-upgrades
```

- [ ] **Step 2: Add the import to `hardhat.config.ts`**

Add this import at the top of `hardhat.config.ts`:

```typescript
import "@openzeppelin/hardhat-upgrades";
```

---

### Task 1: Create EIP-712 signing helpers

**Files:**
- Create: `contracts/test/helpers/eip712.ts`

- [ ] **Step 1: Create `contracts/test/helpers/eip712.ts`**

```typescript
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * EIP-712 domain for the Attestly contract.
 * Must match the contract's __EIP712_init("Attestly", "1") parameters.
 */
export function getEIP712Domain(contractAddress: string, chainId: number) {
  return {
    name: "Attestly",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  };
}

/**
 * Sign a PublishSurvey EIP-712 message.
 *
 * Struct: PublishSurvey(bytes32 surveyHash, string ipfsCid, address creator)
 */
export async function signPublishSurvey(
  signer: HardhatEthersSigner,
  contractAddress: string,
  chainId: number,
  params: {
    surveyHash: string;
    ipfsCid: string;
    creator: string;
  }
): Promise<string> {
  const domain = getEIP712Domain(contractAddress, chainId);
  const types = {
    PublishSurvey: [
      { name: "surveyHash", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "creator", type: "address" },
    ],
  };
  const value = {
    surveyHash: params.surveyHash,
    ipfsCid: params.ipfsCid,
    creator: params.creator,
  };
  return signer.signTypedData(domain, types, value);
}

/**
 * Sign a SubmitResponse EIP-712 message.
 *
 * Struct: SubmitResponse(bytes32 surveyHash, string ipfsCid)
 * Note: the signer's address is NOT in the struct — it's recovered on-chain.
 */
export async function signSubmitResponse(
  signer: HardhatEthersSigner,
  contractAddress: string,
  chainId: number,
  params: {
    surveyHash: string;
    ipfsCid: string;
  }
): Promise<string> {
  const domain = getEIP712Domain(contractAddress, chainId);
  const types = {
    SubmitResponse: [
      { name: "surveyHash", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
    ],
  };
  const value = {
    surveyHash: params.surveyHash,
    ipfsCid: params.ipfsCid,
  };
  return signer.signTypedData(domain, types, value);
}

/**
 * Sign a CloseSurvey EIP-712 message.
 *
 * Struct: CloseSurvey(bytes32 surveyHash)
 */
export async function signCloseSurvey(
  signer: HardhatEthersSigner,
  contractAddress: string,
  chainId: number,
  params: {
    surveyHash: string;
  }
): Promise<string> {
  const domain = getEIP712Domain(contractAddress, chainId);
  const types = {
    CloseSurvey: [{ name: "surveyHash", type: "bytes32" }],
  };
  const value = {
    surveyHash: params.surveyHash,
  };
  return signer.signTypedData(domain, types, value);
}

/**
 * Compute the blinded ID for a respondent.
 * Matches the contract: keccak256(abi.encodePacked(signer, surveyHash))
 */
export function computeBlindedId(
  signerAddress: string,
  surveyHash: string
): string {
  return ethers.keccak256(
    ethers.solidityPacked(["address", "bytes32"], [signerAddress, surveyHash])
  );
}
```

---

### Task 2: Create shared test fixtures

**Files:**
- Create: `contracts/test/helpers/fixtures.ts`

- [ ] **Step 1: Create `contracts/test/helpers/fixtures.ts`**

```typescript
import { ethers, upgrades } from "hardhat";
import type { Attestly } from "../../../typechain-types";
import {
  signPublishSurvey,
  computeBlindedId,
  signSubmitResponse,
} from "./eip712";

/**
 * Deploy a fresh Attestly proxy contract.
 * Returns the contract instance, owner, and test signers.
 */
export async function deployAttestation() {
  const [owner, creator, respondent1, respondent2, stranger] =
    await ethers.getSigners();

  const AttelyFactory = await ethers.getContractFactory("Attestly");
  const attestly = (await upgrades.deployProxy(AttelyFactory, [owner!.address], {
    initializer: "initialize",
    kind: "uups",
  })) as unknown as Attestly;

  await attestly.waitForDeployment();

  const contractAddress = await attestly.getAddress();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  return {
    attestly,
    contractAddress,
    chainId,
    owner: owner!,
    creator: creator!,
    respondent1: respondent1!,
    respondent2: respondent2!,
    stranger: stranger!,
  };
}

/**
 * Deploy and publish a survey. Useful for tests that need a published survey as a prerequisite.
 */
export async function deployWithPublishedSurvey() {
  const fixture = await deployAttestation();
  const { attestly, contractAddress, chainId, creator } = fixture;

  const surveyHash = ethers.keccak256(ethers.toUtf8Bytes("test-survey-content"));
  const ipfsCid = "QmTestSurveyHash123456789012345678901234567890";

  const signature = await signPublishSurvey(creator, contractAddress, chainId, {
    surveyHash,
    ipfsCid,
    creator: creator.address,
  });

  await attestly.publishSurvey(surveyHash, ipfsCid, creator.address, signature);

  return {
    ...fixture,
    surveyHash,
    surveyIpfsCid: ipfsCid,
  };
}

/**
 * Deploy, publish a survey, and submit one response.
 */
export async function deployWithOneResponse() {
  const fixture = await deployWithPublishedSurvey();
  const { attestly, contractAddress, chainId, respondent1, surveyHash } =
    fixture;

  const responseIpfsCid = "QmTestResponseHash12345678901234567890123456789";
  const blindedId = computeBlindedId(respondent1.address, surveyHash);

  const signature = await signSubmitResponse(
    respondent1,
    contractAddress,
    chainId,
    {
      surveyHash,
      ipfsCid: responseIpfsCid,
    }
  );

  await attestly.submitResponse(surveyHash, blindedId, responseIpfsCid, signature);

  return {
    ...fixture,
    responseIpfsCid,
    blindedId,
  };
}
```

---

### Task 3: Create the main test file

**Files:**
- Create: `contracts/test/Attestly.test.ts`

- [ ] **Step 1: Create `contracts/test/Attestly.test.ts` with all test suites**

```typescript
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  signPublishSurvey,
  signSubmitResponse,
  signCloseSurvey,
  computeBlindedId,
} from "./helpers/eip712";
import {
  deployAttestation,
  deployWithPublishedSurvey,
  deployWithOneResponse,
} from "./helpers/fixtures";

describe("Attestly", function () {
  // ──────────────────────────────────────────────
  // publishSurvey
  // ──────────────────────────────────────────────

  describe("publishSurvey", function () {
    it("should publish a survey with a valid signature", async function () {
      const { attestly, contractAddress, chainId, creator } =
        await loadFixture(deployAttestation);

      const surveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("test-survey-content")
      );
      const ipfsCid = "QmTestSurveyHash123456789012345678901234567890";

      const signature = await signPublishSurvey(
        creator,
        contractAddress,
        chainId,
        {
          surveyHash,
          ipfsCid,
          creator: creator.address,
        }
      );

      await expect(
        attestly.publishSurvey(surveyHash, ipfsCid, creator.address, signature)
      )
        .to.emit(attestly, "SurveyPublished")
        .withArgs(surveyHash, ipfsCid, (ts: bigint) => ts > 0n);

      // Verify stored data
      const survey = await attestly.getSurvey(surveyHash);
      expect(survey.creator).to.equal(creator.address);
      expect(survey.publishedAt).to.be.gt(0n);
      expect(survey.closed).to.be.false;
      expect(survey.closedAt).to.equal(0n);
      expect(survey.responseCount).to.equal(0n);
    });

    it("should revert on duplicate survey hash", async function () {
      const { attestly, contractAddress, chainId, creator, surveyHash } =
        await loadFixture(deployWithPublishedSurvey);

      const signature = await signPublishSurvey(
        creator,
        contractAddress,
        chainId,
        {
          surveyHash,
          ipfsCid: "QmDifferentCid00000000000000000000000000000000",
          creator: creator.address,
        }
      );

      await expect(
        attestly.publishSurvey(
          surveyHash,
          "QmDifferentCid00000000000000000000000000000000",
          creator.address,
          signature
        )
      ).to.be.revertedWithCustomError(attestly, "SurveyAlreadyExists");
    });

    it("should revert when signature does not match creator", async function () {
      const { attestly, contractAddress, chainId, creator, stranger } =
        await loadFixture(deployAttestation);

      const surveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("forged-survey")
      );
      const ipfsCid = "QmForgedSurvey00000000000000000000000000000000";

      // Stranger signs but claims to be the creator
      const signature = await signPublishSurvey(
        stranger,
        contractAddress,
        chainId,
        {
          surveyHash,
          ipfsCid,
          creator: creator.address,
        }
      );

      await expect(
        attestly.publishSurvey(surveyHash, ipfsCid, creator.address, signature)
      ).to.be.revertedWithCustomError(attestly, "SignerMismatch");
    });
  });

  // ──────────────────────────────────────────────
  // submitResponse
  // ──────────────────────────────────────────────

  describe("submitResponse", function () {
    it("should submit a response with valid signature and blinded ID", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        respondent1,
        surveyHash,
      } = await loadFixture(deployWithPublishedSurvey);

      const ipfsCid = "QmResponseData0000000000000000000000000000000";
      const blindedId = computeBlindedId(respondent1.address, surveyHash);

      const signature = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid }
      );

      await expect(
        attestly.submitResponse(surveyHash, blindedId, ipfsCid, signature)
      )
        .to.emit(attestly, "ResponseSubmitted")
        .withArgs(
          surveyHash,
          blindedId,
          ipfsCid,
          (ts: bigint) => ts > 0n
        );

      // Verify tracking
      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId)
      ).to.be.true;
      expect(await attestly.getResponseCount(surveyHash)).to.equal(1n);
    });

    it("should revert on duplicate blinded ID (same respondent, same survey)", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        respondent1,
        surveyHash,
        blindedId,
      } = await loadFixture(deployWithOneResponse);

      const ipfsCid = "QmDuplicateResponse000000000000000000000000000";

      const signature = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid }
      );

      await expect(
        attestly.submitResponse(surveyHash, blindedId, ipfsCid, signature)
      ).to.be.revertedWithCustomError(attestly, "DuplicateResponse");
    });

    it("should revert when survey does not exist", async function () {
      const { attestly, contractAddress, chainId, respondent1 } =
        await loadFixture(deployAttestation);

      const fakeSurveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("nonexistent-survey")
      );
      const ipfsCid = "QmOrphanResponse000000000000000000000000000000";
      const blindedId = computeBlindedId(respondent1.address, fakeSurveyHash);

      const signature = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash: fakeSurveyHash, ipfsCid }
      );

      await expect(
        attestly.submitResponse(
          fakeSurveyHash,
          blindedId,
          ipfsCid,
          signature
        )
      ).to.be.revertedWithCustomError(attestly, "SurveyNotFound");
    });

    it("should revert when survey is closed", async function () {
      const { attestly, contractAddress, chainId, creator, respondent2, surveyHash } =
        await loadFixture(deployWithOneResponse);

      // Close the survey first
      const closeSig = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash }
      );
      await attestly.closeSurvey(surveyHash, closeSig);

      // Attempt to submit after closure
      const ipfsCid = "QmLateResponse00000000000000000000000000000000";
      const blindedId = computeBlindedId(respondent2.address, surveyHash);

      const signature = await signSubmitResponse(
        respondent2,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid }
      );

      await expect(
        attestly.submitResponse(surveyHash, blindedId, ipfsCid, signature)
      ).to.be.revertedWithCustomError(attestly, "SurveyAlreadyClosed");
    });

    it("should revert when blinded ID does not match signer", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        respondent1,
        respondent2,
        surveyHash,
      } = await loadFixture(deployWithPublishedSurvey);

      const ipfsCid = "QmMismatchResponse0000000000000000000000000000";

      // respondent1 signs but we pass respondent2's blinded ID
      const wrongBlindedId = computeBlindedId(respondent2.address, surveyHash);

      const signature = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid }
      );

      await expect(
        attestly.submitResponse(
          surveyHash,
          wrongBlindedId,
          ipfsCid,
          signature
        )
      ).to.be.revertedWithCustomError(attestly, "BlindedIdMismatch");
    });

    it("should allow multiple different respondents to submit", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        respondent1,
        respondent2,
        surveyHash,
      } = await loadFixture(deployWithPublishedSurvey);

      // Respondent 1
      const blindedId1 = computeBlindedId(respondent1.address, surveyHash);
      const sig1 = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResponse1_00000000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId1,
        "QmResponse1_00000000000000000000000000000000",
        sig1
      );

      // Respondent 2
      const blindedId2 = computeBlindedId(respondent2.address, surveyHash);
      const sig2 = await signSubmitResponse(
        respondent2,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResponse2_00000000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId2,
        "QmResponse2_00000000000000000000000000000000",
        sig2
      );

      expect(await attestly.getResponseCount(surveyHash)).to.equal(2n);
      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId1)
      ).to.be.true;
      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId2)
      ).to.be.true;
    });
  });

  // ──────────────────────────────────────────────
  // closeSurvey
  // ──────────────────────────────────────────────

  describe("closeSurvey", function () {
    it("should close a survey when signed by the creator", async function () {
      const { attestly, contractAddress, chainId, creator, surveyHash } =
        await loadFixture(deployWithPublishedSurvey);

      const signature = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash }
      );

      await expect(attestly.closeSurvey(surveyHash, signature))
        .to.emit(attestly, "SurveyClosed")
        .withArgs(surveyHash, (ts: bigint) => ts > 0n);

      const survey = await attestly.getSurvey(surveyHash);
      expect(survey.closed).to.be.true;
      expect(survey.closedAt).to.be.gt(0n);
    });

    it("should revert when signed by a non-creator", async function () {
      const { attestly, contractAddress, chainId, stranger, surveyHash } =
        await loadFixture(deployWithPublishedSurvey);

      const signature = await signCloseSurvey(
        stranger,
        contractAddress,
        chainId,
        { surveyHash }
      );

      await expect(
        attestly.closeSurvey(surveyHash, signature)
      ).to.be.revertedWithCustomError(attestly, "SignerMismatch");
    });

    it("should revert when survey is already closed", async function () {
      const { attestly, contractAddress, chainId, creator, surveyHash } =
        await loadFixture(deployWithPublishedSurvey);

      const signature = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash }
      );
      await attestly.closeSurvey(surveyHash, signature);

      // Attempt to close again
      const signature2 = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash }
      );
      await expect(
        attestly.closeSurvey(surveyHash, signature2)
      ).to.be.revertedWithCustomError(attestly, "SurveyAlreadyClosed");
    });

    it("should revert when survey does not exist", async function () {
      const { attestly, contractAddress, chainId, creator } =
        await loadFixture(deployAttestation);

      const fakeSurveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("nonexistent-survey")
      );

      const signature = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash: fakeSurveyHash }
      );

      await expect(
        attestly.closeSurvey(fakeSurveyHash, signature)
      ).to.be.revertedWithCustomError(attestly, "SurveyNotFound");
    });
  });

  // ──────────────────────────────────────────────
  // View functions
  // ──────────────────────────────────────────────

  describe("View functions", function () {
    it("getSurvey returns correct data after publication", async function () {
      const { attestly, creator, surveyHash } = await loadFixture(
        deployWithPublishedSurvey
      );

      const survey = await attestly.getSurvey(surveyHash);
      expect(survey.creator).to.equal(creator.address);
      expect(survey.publishedAt).to.be.gt(0n);
      expect(survey.closed).to.be.false;
      expect(survey.closedAt).to.equal(0n);
      expect(survey.responseCount).to.equal(0n);
    });

    it("getSurvey returns zeroes for nonexistent survey", async function () {
      const { attestly } = await loadFixture(deployAttestation);

      const fakeSurveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("nonexistent")
      );
      const survey = await attestly.getSurvey(fakeSurveyHash);
      expect(survey.creator).to.equal(ethers.ZeroAddress);
      expect(survey.publishedAt).to.equal(0n);
      expect(survey.closed).to.be.false;
      expect(survey.closedAt).to.equal(0n);
      expect(survey.responseCount).to.equal(0n);
    });

    it("getResponseCount increments with each response", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        respondent1,
        respondent2,
        surveyHash,
      } = await loadFixture(deployWithPublishedSurvey);

      expect(await attestly.getResponseCount(surveyHash)).to.equal(0n);

      // Submit response 1
      const blindedId1 = computeBlindedId(respondent1.address, surveyHash);
      const sig1 = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResp1_000000000000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId1,
        "QmResp1_000000000000000000000000000000000000",
        sig1
      );
      expect(await attestly.getResponseCount(surveyHash)).to.equal(1n);

      // Submit response 2
      const blindedId2 = computeBlindedId(respondent2.address, surveyHash);
      const sig2 = await signSubmitResponse(
        respondent2,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResp2_000000000000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId2,
        "QmResp2_000000000000000000000000000000000000",
        sig2
      );
      expect(await attestly.getResponseCount(surveyHash)).to.equal(2n);
    });

    it("isResponseSubmitted returns false for unsubmitted blinded IDs", async function () {
      const { attestly, respondent1, surveyHash } = await loadFixture(
        deployWithPublishedSurvey
      );

      const blindedId = computeBlindedId(respondent1.address, surveyHash);
      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId)
      ).to.be.false;
    });
  });

  // ──────────────────────────────────────────────
  // EIP-712 signature verification
  // ──────────────────────────────────────────────

  describe("EIP-712 signatures", function () {
    it("should accept signatures from ethers.js signTypedData", async function () {
      const { attestly, contractAddress, chainId, creator } =
        await loadFixture(deployAttestation);

      const surveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("eip712-test-survey")
      );
      const ipfsCid = "QmEIP712TestSurvey0000000000000000000000000000";

      // Sign using ethers.js signTypedData (this is the real EIP-712 flow)
      const signature = await creator.signTypedData(
        {
          name: "Attestly",
          version: "1",
          chainId,
          verifyingContract: contractAddress,
        },
        {
          PublishSurvey: [
            { name: "surveyHash", type: "bytes32" },
            { name: "ipfsCid", type: "string" },
            { name: "creator", type: "address" },
          ],
        },
        {
          surveyHash,
          ipfsCid,
          creator: creator.address,
        }
      );

      // Contract should accept this signature
      await expect(
        attestly.publishSurvey(surveyHash, ipfsCid, creator.address, signature)
      ).to.not.be.reverted;
    });

    it("should reject signatures with wrong domain separator", async function () {
      const { attestly, contractAddress, chainId, creator } =
        await loadFixture(deployAttestation);

      const surveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("wrong-domain-test")
      );
      const ipfsCid = "QmWrongDomainTest00000000000000000000000000000";

      // Sign with wrong domain name
      const signature = await creator.signTypedData(
        {
          name: "WrongName",
          version: "1",
          chainId,
          verifyingContract: contractAddress,
        },
        {
          PublishSurvey: [
            { name: "surveyHash", type: "bytes32" },
            { name: "ipfsCid", type: "string" },
            { name: "creator", type: "address" },
          ],
        },
        {
          surveyHash,
          ipfsCid,
          creator: creator.address,
        }
      );

      // Should revert because recovered address won't match creator
      await expect(
        attestly.publishSurvey(surveyHash, ipfsCid, creator.address, signature)
      ).to.be.revertedWithCustomError(attestly, "SignerMismatch");
    });
  });

  // ──────────────────────────────────────────────
  // UUPS upgradeability
  // ──────────────────────────────────────────────

  describe("UUPS upgradeability", function () {
    it("should allow the owner to upgrade the implementation", async function () {
      const { attestly, owner } = await loadFixture(deployAttestation);

      // Deploy a new implementation (same contract, but this tests the upgrade path)
      const AttelyV2Factory = await ethers.getContractFactory(
        "Attestly",
        owner
      );

      // This should succeed because owner is calling
      await expect(
        upgrades.upgradeProxy(await attestly.getAddress(), AttelyV2Factory, {
          kind: "uups",
        })
      ).to.not.be.reverted;
    });

    it("should reject upgrade from non-owner", async function () {
      const { attestly, stranger } = await loadFixture(deployAttestation);

      const AttelyV2Factory = await ethers.getContractFactory(
        "Attestly",
        stranger
      );

      await expect(
        upgrades.upgradeProxy(await attestly.getAddress(), AttelyV2Factory, {
          kind: "uups",
        })
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // Full lifecycle integration test
  // ──────────────────────────────────────────────

  describe("Full lifecycle", function () {
    it("publish → submit responses → close → verify state", async function () {
      const {
        attestly,
        contractAddress,
        chainId,
        creator,
        respondent1,
        respondent2,
      } = await loadFixture(deployAttestation);

      // 1. Publish
      const surveyHash = ethers.keccak256(
        ethers.toUtf8Bytes("lifecycle-test-survey")
      );
      const surveyIpfsCid = "QmLifecycleSurvey00000000000000000000000000000";

      const publishSig = await signPublishSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: surveyIpfsCid, creator: creator.address }
      );
      await attestly.publishSurvey(
        surveyHash,
        surveyIpfsCid,
        creator.address,
        publishSig
      );

      // 2. Submit response from respondent1
      const blindedId1 = computeBlindedId(respondent1.address, surveyHash);
      const resp1Sig = await signSubmitResponse(
        respondent1,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResp1Lifecycle000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId1,
        "QmResp1Lifecycle000000000000000000000000000",
        resp1Sig
      );

      // 3. Submit response from respondent2
      const blindedId2 = computeBlindedId(respondent2.address, surveyHash);
      const resp2Sig = await signSubmitResponse(
        respondent2,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmResp2Lifecycle000000000000000000000000000" }
      );
      await attestly.submitResponse(
        surveyHash,
        blindedId2,
        "QmResp2Lifecycle000000000000000000000000000",
        resp2Sig
      );

      // 4. Close
      const closeSig = await signCloseSurvey(
        creator,
        contractAddress,
        chainId,
        { surveyHash }
      );
      await attestly.closeSurvey(surveyHash, closeSig);

      // 5. Verify final state
      const survey = await attestly.getSurvey(surveyHash);
      expect(survey.creator).to.equal(creator.address);
      expect(survey.closed).to.be.true;
      expect(survey.closedAt).to.be.gt(0n);
      expect(survey.responseCount).to.equal(2n);

      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId1)
      ).to.be.true;
      expect(
        await attestly.isResponseSubmitted(surveyHash, blindedId2)
      ).to.be.true;
      expect(await attestly.getResponseCount(surveyHash)).to.equal(2n);

      // 6. Verify no more responses can be submitted after closure
      const lateBlindedId = computeBlindedId(creator.address, surveyHash);
      const lateSig = await signSubmitResponse(
        creator,
        contractAddress,
        chainId,
        { surveyHash, ipfsCid: "QmLateResponse0000000000000000000000000000000" }
      );
      await expect(
        attestly.submitResponse(
          surveyHash,
          lateBlindedId,
          "QmLateResponse0000000000000000000000000000000",
          lateSig
        )
      ).to.be.revertedWithCustomError(attestly, "SurveyAlreadyClosed");
    });
  });
});
```

---

### Task 4: Run the tests

- [ ] **Step 1: Run all contract tests and verify they pass**

```bash
npx hardhat test
```

Expected output:
```
  Attestly
    publishSurvey
      ✓ should publish a survey with a valid signature
      ✓ should revert on duplicate survey hash
      ✓ should revert when signature does not match creator
    submitResponse
      ✓ should submit a response with valid signature and blinded ID
      ✓ should revert on duplicate blinded ID (same respondent, same survey)
      ✓ should revert when survey does not exist
      ✓ should revert when survey is closed
      ✓ should revert when blinded ID does not match signer
      ✓ should allow multiple different respondents to submit
    closeSurvey
      ✓ should close a survey when signed by the creator
      ✓ should revert when signed by a non-creator
      ✓ should revert when survey is already closed
      ✓ should revert when survey does not exist
    View functions
      ✓ getSurvey returns correct data after publication
      ✓ getSurvey returns zeroes for nonexistent survey
      ✓ getResponseCount increments with each response
      ✓ isResponseSubmitted returns false for unsubmitted blinded IDs
    EIP-712 signatures
      ✓ should accept signatures from ethers.js signTypedData
      ✓ should reject signatures with wrong domain separator
    UUPS upgradeability
      ✓ should allow the owner to upgrade the implementation
      ✓ should reject upgrade from non-owner
    Full lifecycle
      ✓ publish → submit responses → close → verify state

  22 passing
```

If any tests fail, debug by checking:
1. EIP-712 type hashes match between helpers and contract
2. `solidityPacked` call matches `abi.encodePacked` in contract for blinded ID
3. OpenZeppelin v5 API differences (e.g., `OwnableUnauthorizedAccount` error name)
4. Proxy deployment uses correct initializer function name

---

## Verification Checklist

- [ ] `npx hardhat test` passes all 22 tests
- [ ] `publishSurvey` tests: valid signature, duplicate hash revert, wrong creator revert
- [ ] `submitResponse` tests: valid, duplicate blinded ID revert, survey not found, survey closed, blinded ID mismatch, multiple respondents
- [ ] `closeSurvey` tests: valid creator, non-creator revert, already closed revert, not found revert
- [ ] View function tests: getSurvey data, zeroes for nonexistent, count increments, isResponseSubmitted
- [ ] EIP-712 tests: ethers.js signTypedData works, wrong domain rejects
- [ ] UUPS tests: owner can upgrade, non-owner cannot
- [ ] Full lifecycle integration test passes end-to-end
