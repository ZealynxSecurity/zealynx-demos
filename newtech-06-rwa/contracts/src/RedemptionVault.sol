// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {NavFeed} from "./NavFeed.sol";

/// Stand-in redemption vault (simplified): hand in fund shares, get tUSDC at NAV.
///
/// Bug #2 (vulnerable): it pays whatever the NAV feed says, however old the number is
/// and however far it is from an independent reference.
/// Fixed version: RedemptionVaultFixed.sol (staleness + deviation checks).
contract RedemptionVault {
    IERC20 public immutable shares;
    IERC20 public immutable usdc;
    NavFeed public immutable feed;
    NavFeed public immutable ref;

    error StaleNAV();

    constructor(IERC20 _shares, IERC20 _usdc, NavFeed _feed, NavFeed _ref) {
        shares = _shares; usdc = _usdc; feed = _feed; ref = _ref;
    }

    function redeem(uint256 amount) external {
        uint256 nav = _nav();
        shares.transferFrom(msg.sender, address(this), amount);
        usdc.transfer(msg.sender, amount * nav / 1e18);
    }

    /// Vulnerable: trusts the feed blindly.
    function _nav() internal view virtual returns (uint256) {
        return feed.nav();
    }
}
