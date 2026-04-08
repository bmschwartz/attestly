// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../../Attestly.sol";

/// @dev Wrapper so Hardhat emits an artifact we can deploy in tests.
contract TestERC1967Proxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory _data
    ) ERC1967Proxy(implementation, _data) {}
}

/// @dev Minimal V2 contract for UUPS upgrade tests.
contract AttestlyV2 is Attestly {
    function version() external pure returns (uint256) {
        return 2;
    }
}
