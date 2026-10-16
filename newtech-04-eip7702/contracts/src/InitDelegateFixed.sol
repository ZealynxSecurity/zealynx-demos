// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Attack #3, fixed. initialize() is bound to a signature from the account itself.
/// Whoever sends the transaction, the owner only changes if the account (address(this))
/// signed off on it. A front-runner has no such signature, so their init reverts.
contract InitDelegateFixed {
    using ECDSA for bytes32;
    address public owner;
    bool public initialized;
    function initialize(address newOwner, bytes calldata sig) external {
        require(!initialized, "already init");
        bytes32 initHash = keccak256(abi.encodePacked(address(this), newOwner));
        require(initHash.recover(sig) == address(this), "init sig");
        initialized = true;
        owner = newOwner;
    }
}
