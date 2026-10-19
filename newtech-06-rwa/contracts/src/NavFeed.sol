// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Stand-in NAV feed (simplified): the fund administrator posts NAV per share (18 decimals).
contract NavFeed {
    address public immutable owner = msg.sender;
    uint256 public nav;
    uint256 public updatedAt;

    function set(uint256 _nav) external {
        require(msg.sender == owner, "not owner");
        nav = _nav;
        updatedAt = block.timestamp;
    }
}
