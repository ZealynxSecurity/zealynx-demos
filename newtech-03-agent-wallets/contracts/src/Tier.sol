// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// Attack #2, vulnerable: the daily spend limit is read from what is IN the wallet.
/// Hold a badge NFT and the limit jumps 1,000x — so anyone can airdrop you a badge and
/// your agent will happily spend past its real cap.
contract Tier {
    IERC20 public immutable token;
    IERC721 public immutable badge;

    uint256 public constant BASE = 10e6; //       10 tUSDC/day
    uint256 public constant ELEVATED = 10_000e6; // 10,000 tUSDC/day

    error OverLimit(uint256 limit, uint256 requested);

    constructor(address _token, address _badge) {
        token = IERC20(_token);
        badge = IERC721(_badge);
    }

    /// The bug: the limit is a function of the badge balance, which anyone can change.
    function dailyLimit(address agent) public view returns (uint256) {
        return badge.balanceOf(agent) > 0 ? ELEVATED : BASE;
    }

    function spend(address to, uint256 amount) external {
        uint256 limit = dailyLimit(msg.sender);
        if (amount > limit) revert OverLimit(limit, amount);
        token.transfer(to, amount);
    }
}
