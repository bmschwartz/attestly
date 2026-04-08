# Sub-Plan 2-1b: Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Attestly smart contract with all functions, events, EIP-712 signature verification, and on-chain enforcement rules.

**Architecture:** The Attestly contract is a UUPS upgradeable proxy that stores survey lifecycle data on-chain. Each state-changing function verifies an EIP-712 signature using OpenZeppelin's ECDSA and EIP712 libraries, then enforces integrity rules (uniqueness, state transitions, creator-only closure). The contract computes blinded IDs on-chain from recovered signer addresses to ensure correctness. A relayer submits transactions on behalf of users, but the contract verifies signatures so the relayer cannot forge actions.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin Contracts Upgradeable (UUPS, EIP712, ECDSA, Ownable), Hardhat

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

---

## File Structure

- Modify: `contracts/Attestly.sol` — Full implementation replacing stubs from 2-1a

---

### Task 1: Implement Attestly.sol with storage, EIP-712, and all functions

**Files:**
- Modify: `contracts/Attestly.sol`

- [ ] **Step 1: Replace the stub `contracts/Attestly.sol` with the full implementation**

Replace the entire contents of `contracts/Attestly.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAttestly.sol";

/**
 * @title Attestly
 * @notice On-chain survey verification contract for the Attestly platform.
 * @dev UUPS upgradeable proxy with EIP-712 signature verification.
 *
 *      On-chain enforcement rules:
 *      1. Survey hash must be unique (no duplicate publications)
 *      2. Signature verified against creator address (relayer cannot forge)
 *      3. Survey must exist and not be closed to accept responses
 *      4. Blinded ID unique per survey (no duplicate responses)
 *      5. Response signature verified on-chain (needs respondent's private key)
 *      6. Only creator can close (verified via signature recovery)
 *
 *      EIP-712 domain: name="Attestly", version="1"
 */
contract Attestly is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    EIP712Upgradeable,
    IAttestly
{
    using ECDSA for bytes32;

    // ──────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────

    struct SurveyData {
        address creator;
        uint256 publishedAt;
        bool closed;
        uint256 closedAt;
        uint256 responseCount;
        string ipfsCid;
    }

    /// @notice Survey data indexed by survey content hash
    mapping(bytes32 => SurveyData) private _surveys;

    /// @notice Response tracking: surveyHash => blindedId => submitted
    mapping(bytes32 => mapping(bytes32 => bool)) private _responses;

    // ──────────────────────────────────────────────
    // EIP-712 Type Hashes (compact signing payloads)
    // ──────────────────────────────────────────────

    /// @dev Users sign a COMPACT summary struct, not the full survey data.
    ///      The surveyHash is a precomputed deterministic hash of the full content.
    ///      The contract verifies the signature over this compact struct.
    ///
    /// keccak256("PublishSurvey(bytes32 surveyHash,string title,string slug,uint8 questionCount,address creator)")
    bytes32 public constant PUBLISH_SURVEY_TYPEHASH =
        keccak256("PublishSurvey(bytes32 surveyHash,string title,string slug,uint8 questionCount,address creator)");

    /// @dev Users sign a COMPACT summary struct for responses.
    ///      The surveyHash and answersHash are precomputed deterministic hashes.
    ///
    /// keccak256("SubmitResponse(bytes32 surveyHash,bytes32 blindedId,uint8 answerCount,bytes32 answersHash)")
    bytes32 public constant SUBMIT_RESPONSE_TYPEHASH =
        keccak256("SubmitResponse(bytes32 surveyHash,bytes32 blindedId,uint8 answerCount,bytes32 answersHash)");

    /// @dev keccak256("CloseSurvey(bytes32 surveyHash)")
    bytes32 public constant CLOSE_SURVEY_TYPEHASH =
        keccak256("CloseSurvey(bytes32 surveyHash)");

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error SurveyAlreadyExists(bytes32 surveyHash);
    error SurveyNotFound(bytes32 surveyHash);
    error SurveyAlreadyClosed(bytes32 surveyHash);
    error InvalidSignature();
    error SignerMismatch(address expected, address recovered);
    error DuplicateResponse(bytes32 surveyHash, bytes32 blindedId);
    error BlindedIdMismatch(bytes32 expected, bytes32 computed);

    // ──────────────────────────────────────────────
    // Initializer
    // ──────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (called once via proxy).
     * @param initialOwner Address that owns the proxy (can authorize upgrades)
     */
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __EIP712_init("Attestly", "1");
    }

    // ──────────────────────────────────────────────
    // UUPS
    // ──────────────────────────────────────────────

    /**
     * @dev Only the owner can authorize upgrades.
     *      After Phase 4, ownership will be renounced to make the contract immutable.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ──────────────────────────────────────────────
    // State-changing functions
    // ──────────────────────────────────────────────

    /**
     * @notice Publish a survey on-chain.
     * @dev Verifies EIP-712 signature over a COMPACT summary struct:
     *      PublishSurvey(bytes32 surveyHash, string title, string slug, uint8 questionCount, address creator)
     *
     *      The surveyHash is a precomputed deterministic hash of the full survey content.
     *      The compact struct gives the user a human-readable signing prompt while the
     *      contract verifies the signature without needing full survey data on-chain.
     *
     * @param surveyHash Deterministic hash of the full survey content
     * @param ipfsCid IPFS CID of the pinned survey JSON
     * @param creator Address of the survey creator
     * @param title Survey title (included in compact signing payload)
     * @param slug Survey slug (included in compact signing payload)
     * @param questionCount Number of questions (included in compact signing payload)
     * @param signature EIP-712 signature from the creator over the compact struct
     */
    function publishSurvey(
        bytes32 surveyHash,
        string calldata ipfsCid,
        address creator,
        string calldata title,
        string calldata slug,
        uint8 questionCount,
        bytes calldata signature
    ) external override {
        // Survey must not already exist
        if (_surveys[surveyHash].publishedAt != 0) {
            revert SurveyAlreadyExists(surveyHash);
        }

        // Verify EIP-712 signature over the compact struct
        bytes32 structHash = keccak256(
            abi.encode(
                PUBLISH_SURVEY_TYPEHASH,
                surveyHash,
                keccak256(bytes(title)),
                keccak256(bytes(slug)),
                questionCount,
                creator
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);

        if (recovered != creator) {
            revert SignerMismatch(creator, recovered);
        }

        // Store survey data
        _surveys[surveyHash] = SurveyData({
            creator: creator,
            publishedAt: block.timestamp,
            closed: false,
            closedAt: 0,
            responseCount: 0,
            ipfsCid: ipfsCid
        });

        emit SurveyPublished(surveyHash, ipfsCid, block.timestamp);
    }

    /**
     * @notice Submit a response on-chain.
     * @dev Recovers the signer from the EIP-712 signature over a COMPACT summary struct:
     *      SubmitResponse(bytes32 surveyHash, bytes32 blindedId, uint8 answerCount, bytes32 answersHash)
     *
     *      The answersHash is a precomputed deterministic hash of the full answer content.
     *      The contract computes the blinded ID on-chain from the recovered signer and
     *      verifies it matches the provided blindedId. Enforces uniqueness per blinded ID per survey.
     *
     * @param surveyHash The target survey
     * @param blindedId Expected blinded identifier
     * @param ipfsCid IPFS CID of the pinned response data
     * @param answerCount Number of answers (included in compact signing payload)
     * @param answersHash Deterministic hash of the full answer content
     * @param signature EIP-712 signature from the respondent over the compact struct
     */
    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        uint8 answerCount,
        bytes32 answersHash,
        bytes calldata signature
    ) external override {
        // Survey must exist
        SurveyData storage survey = _surveys[surveyHash];
        if (survey.publishedAt == 0) {
            revert SurveyNotFound(surveyHash);
        }

        // Survey must not be closed
        if (survey.closed) {
            revert SurveyAlreadyClosed(surveyHash);
        }

        // Verify EIP-712 signature over the compact struct and recover signer
        bytes32 structHash = keccak256(
            abi.encode(
                SUBMIT_RESPONSE_TYPEHASH,
                surveyHash,
                blindedId,
                answerCount,
                answersHash
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        // Compute blinded ID and verify it matches the provided one
        bytes32 computedBlindedId = keccak256(
            abi.encodePacked(signer, surveyHash)
        );
        if (computedBlindedId != blindedId) {
            revert BlindedIdMismatch(blindedId, computedBlindedId);
        }

        // Enforce uniqueness: one response per blinded ID per survey
        if (_responses[surveyHash][blindedId]) {
            revert DuplicateResponse(surveyHash, blindedId);
        }

        // Store response
        _responses[surveyHash][blindedId] = true;
        survey.responseCount += 1;

        emit ResponseSubmitted(surveyHash, blindedId, ipfsCid, block.timestamp);
    }

    /**
     * @notice Close a survey. Only the original creator can close.
     * @dev Recovers the signer from the EIP-712 signature and verifies it matches
     *      the stored creator address for the given surveyHash.
     *
     *      EIP-712 struct: CloseSurvey(bytes32 surveyHash)
     *
     * @param surveyHash The survey to close
     * @param signature EIP-712 signature from the creator
     */
    function closeSurvey(
        bytes32 surveyHash,
        bytes calldata signature
    ) external override {
        // Survey must exist
        SurveyData storage survey = _surveys[surveyHash];
        if (survey.publishedAt == 0) {
            revert SurveyNotFound(surveyHash);
        }

        // Survey must not already be closed
        if (survey.closed) {
            revert SurveyAlreadyClosed(surveyHash);
        }

        // Verify EIP-712 signature recovers to the stored creator
        bytes32 structHash = keccak256(
            abi.encode(CLOSE_SURVEY_TYPEHASH, surveyHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);

        if (recovered != survey.creator) {
            revert SignerMismatch(survey.creator, recovered);
        }

        // Close the survey
        survey.closed = true;
        survey.closedAt = block.timestamp;

        emit SurveyClosed(surveyHash, block.timestamp);
    }

    // ──────────────────────────────────────────────
    // View functions
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
    ) external view override returns (
        address creator,
        uint256 publishedAt,
        bool closed,
        uint256 closedAt,
        uint256 responseCount
    ) {
        SurveyData storage survey = _surveys[surveyHash];
        return (
            survey.creator,
            survey.publishedAt,
            survey.closed,
            survey.closedAt,
            survey.responseCount
        );
    }

    /**
     * @notice Check if a blinded ID has already submitted a response.
     * @param surveyHash The survey to check
     * @param blindedId The blinded identifier to check
     * @return True if a response with this blinded ID exists
     */
    function isResponseSubmitted(
        bytes32 surveyHash,
        bytes32 blindedId
    ) external view override returns (bool) {
        return _responses[surveyHash][blindedId];
    }

    /**
     * @notice Get the number of on-chain responses for a survey.
     * @param surveyHash The survey to query
     * @return The response count
     */
    function getResponseCount(
        bytes32 surveyHash
    ) external view override returns (uint256) {
        return _surveys[surveyHash].responseCount;
    }
}
```

---

### Task 2: Verify the EIP-712 type hashes are correct

- [ ] **Step 1: Verify that the PUBLISH_SURVEY_TYPEHASH, SUBMIT_RESPONSE_TYPEHASH, and CLOSE_SURVEY_TYPEHASH constants match the struct definitions**

The type hashes must exactly match the EIP-712 compact struct encoding:

- `PUBLISH_SURVEY_TYPEHASH` = `keccak256("PublishSurvey(bytes32 surveyHash,string title,string slug,uint8 questionCount,address creator)")` — compact summary struct; `string` fields are hashed with `keccak256(bytes(value))` in the struct encoding; `surveyHash` is a precomputed hash of the full survey content
- `SUBMIT_RESPONSE_TYPEHASH` = `keccak256("SubmitResponse(bytes32 surveyHash,bytes32 blindedId,uint8 answerCount,bytes32 answersHash)")` — compact summary struct; signer is recovered, not included in the signed struct; `answersHash` is a precomputed hash of the full answer content
- `CLOSE_SURVEY_TYPEHASH` = `keccak256("CloseSurvey(bytes32 surveyHash)")` — minimal struct, signer is recovered

Verify by checking that the `abi.encode` calls in each function match the type hash field order and types.

---

### Task 3: Verify UUPS upgrade authorization

- [ ] **Step 1: Confirm `_authorizeUpgrade` is restricted to `onlyOwner`**

The `_authorizeUpgrade` function override uses the `onlyOwner` modifier from `OwnableUpgradeable`. This means:
- Only the contract owner (set during `initialize`) can authorize upgrades
- After Phase 4, ownership can be renounced via `renounceOwnership()` to make the contract permanently immutable
- The `constructor` calls `_disableInitializers()` to prevent initialization of the implementation contract directly

---

### Task 4: Verify compilation

- [ ] **Step 1: Run Hardhat compilation and verify zero errors**

```bash
npx hardhat compile
```

Expected output:
```
Compiled N Solidity files successfully
```

If compilation fails, check:
1. OpenZeppelin import paths match the installed version (v5.x uses different paths than v4.x)
2. `OwnableUpgradeable.sol` in v5 requires `initialOwner` parameter in `__Ownable_init`
3. `ECDSA.recover` is called on `bytes32` via `using ECDSA for bytes32`
4. All Solidity version pragmas match `^0.8.24`

---

## Verification Checklist

- [ ] `npx hardhat compile` succeeds with zero errors
- [ ] `publishSurvey` verifies EIP-712 signature, checks uniqueness, stores data, emits event
- [ ] `submitResponse` recovers signer, computes blinded ID, verifies match, checks uniqueness, emits event
- [ ] `closeSurvey` recovers signer, verifies against stored creator, marks closed, emits event
- [ ] All 6 on-chain enforcement rules from the spec are implemented
- [ ] UUPS `_authorizeUpgrade` is `onlyOwner`
- [ ] Custom errors provide descriptive revert reasons
- [ ] View functions return correct data from storage
