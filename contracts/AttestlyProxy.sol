// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Production ERC1967 proxy for the Attestly UUPS contract.
contract AttestlyProxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory _data
    ) ERC1967Proxy(implementation, _data) {}
}
