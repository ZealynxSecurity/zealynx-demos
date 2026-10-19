// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Stand-in for an ERC-3643 identity registry: the issuer marks which wallets passed KYC.
/// Simplified: one owner, one flag per wallet. Not real ERC-3643 / ONCHAINID code.
contract IdentityRegistry {
    address public immutable owner = msg.sender;
    mapping(address => bool) public isVerified;

    function register(address who, bool ok) external {
        require(msg.sender == owner, "not owner");
        isVerified[who] = ok;
    }
}
