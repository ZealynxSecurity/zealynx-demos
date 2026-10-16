// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #3, vulnerable. A delegate that needs a one-time initialize(owner). There is
/// a gap between the delegation landing and the account calling initialize — and the
/// only guard is "not yet initialized". An attacker front-runs and takes ownership.
contract InitDelegate {
    address public owner;
    bool public initialized;
    function initialize(address newOwner) external {
        require(!initialized, "already init");
        initialized = true;
        owner = newOwner;
    }
}
