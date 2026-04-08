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
        string calldata title,
        string calldata slug,
        uint8 questionCount,
        bytes calldata signature
    ) external override {
        revert("Not implemented");
    }

    function submitResponse(
        bytes32 surveyHash,
        bytes32 blindedId,
        string calldata ipfsCid,
        uint8 answerCount,
        bytes32 answersHash,
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
