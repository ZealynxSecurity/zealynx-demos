// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #5, fixed. The tx.origin check is gone. The limit is enforced per address,
/// so batching 50 calls from one delegated EOA still only mints once.
contract MintFixed {
    uint256 public constant LIMIT = 1;
    mapping(address => uint256) public minted;
    function mint() external {
        require(minted[msg.sender]++ < LIMIT, "limit reached");
    }
}
