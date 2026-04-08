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
     * @notice Publish a survey on-chain. Verifies EIP-712 signature over compact struct.
     * @param surveyHash Deterministic content hash of the survey (chain-independent keccak256)
     * @param ipfsCid IPFS CID of the pinned survey JSON
     * @param creator Address of the survey creator
     * @param title Survey title (compact signing payload)
     * @param slug Survey slug (compact signing payload)
     * @param questionCount Number of questions (compact signing payload)
     * @param signature EIP-712 signature from the creator over the compact PublishSurvey struct
     */
    function publishSurvey(
        bytes32 surveyHash,
        string calldata ipfsCid,
        address creator,
        string calldata title,
        string calldata slug,
        uint8 questionCount,
        bytes calldata signature
    ) external;

    /**
     * @notice Submit a response on-chain. Verifies EIP-712 signature, computes blinded ID,
     *         and enforces uniqueness.
     * @param surveyHash The target survey
     * @param blindedId Expected blinded identifier (verified against computed value)
     * @param ipfsCid IPFS CID of the pinned response data
     * @param answerCount Number of answers (compact signing payload)
     * @param answersHash Deterministic hash of full answer content (compact signing payload)
     * @param signature EIP-712 signature from the respondent over the compact SubmitResponse struct
     */
    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        uint8 answerCount,
        bytes32 answersHash,
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
