// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Tier {
    IERC20 public immutable token;
    IERC721 public immutable badge;

    uint256 public constant BASE = 10e6;
    uint256 public constant ELEVATED = 10_000e6;

    error OverLimit(uint256 limit, uint256 requested);

    constructor(address _token, address _badge) {
        token = IERC20(_token);
        badge = IERC721(_badge);
    }

    function dailyLimit(address agent) public view returns (uint256) {
        return badge.balanceOf(agent) > 0 ? ELEVATED : BASE;
    }

    function spend(address to, uint256 amount) external {
        uint256 limit = dailyLimit(msg.sender);
        if (amount > limit) revert OverLimit(limit, amount);
        token.transfer(to, amount);
    }
}
