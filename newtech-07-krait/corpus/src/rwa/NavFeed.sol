// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

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
