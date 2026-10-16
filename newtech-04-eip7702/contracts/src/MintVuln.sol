// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #5, vulnerable. A mint that trusts `tx.origin == msg.sender` to mean
/// "a human called this directly, one at a time". EIP-7702 lets an EOA run delegate
/// code, so the EOA can call this in a loop from a single transaction — and
/// tx.origin still equals msg.sender on every call.
contract MintVuln {
    mapping(address => uint256) public minted;
    function mint() external {
        require(tx.origin == msg.sender, "humans only");
        minted[msg.sender] += 1;
    }
}
