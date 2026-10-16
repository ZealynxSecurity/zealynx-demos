// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Attack #2, fixed: the elevated tier comes ONLY from an action the owner signs
/// (`grant`), never from what arrives in the wallet. An airdrop changes nothing.
contract TierFixed {
    IERC20 public immutable token;
    address public immutable owner;

    uint256 public constant BASE = 10e6; //       10 tUSDC/day
    uint256 public constant ELEVATED = 10_000e6; // 10,000 tUSDC/day

    mapping(address => address) public grantedBy;

    error OverLimit(uint256 limit, uint256 requested);

    constructor(address _token) {
        token = IERC20(_token);
        owner = msg.sender;
    }

    function grant(address agent) external {
        require(msg.sender == owner, "owner");
        grantedBy[agent] = owner;
    }

    /// The fix: the tier is owner-granted, not wallet-derived.
    function dailyLimit(address agent) public view returns (uint256) {
        require(grantedBy[agent] == owner, "tier"); // base tier unless the owner granted more
        return ELEVATED;
    }

    function spend(address to, uint256 amount) external {
        uint256 limit = grantedBy[msg.sender] == owner ? ELEVATED : BASE;
        if (amount > limit) revert OverLimit(limit, amount);
        token.transfer(to, amount);
    }
}
