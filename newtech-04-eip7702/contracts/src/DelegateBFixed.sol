// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #4, fixed. Same delegate, but `guardian` lives in an ERC-7201 namespaced
/// slot derived from a unique string, not slot 0. Delegate A never wrote there, so a
/// fresh account reads guardian == address(0).
contract DelegateBFixed {
    // keccak256(abi.encode(uint256(keccak256("zealynx.b")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant GUARDIAN_SLOT =
        keccak256(abi.encode(uint256(keccak256("zealynx.b")) - 1)) & ~bytes32(uint256(0xff));
    function guardian() external view returns (address g) {
        bytes32 slot = GUARDIAN_SLOT;
        assembly { g := sload(slot) }
    }
}
