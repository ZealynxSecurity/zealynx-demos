// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// A mock proof-of-reserve feed: the attested USD reserve behind zUSD (6 decimals)
/// and when it was last attested. In production this is an auditor or oracle feed.
contract MockReserveFeed {
    uint256 public reserve;
    uint256 public updatedAt;

    function attest(uint256 newReserve) external {
        reserve = newReserve;
        updatedAt = block.timestamp;
    }
}
