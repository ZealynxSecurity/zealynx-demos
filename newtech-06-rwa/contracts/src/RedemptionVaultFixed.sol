// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {NavFeed} from "./NavFeed.sol";
import {RedemptionVault} from "./RedemptionVault.sol";

/// Bug #2, fixed. NAV must be at most 1 day old and within 2% of the reference.
contract RedemptionVaultFixed is RedemptionVault {
    constructor(IERC20 s, IERC20 u, NavFeed f, NavFeed r) RedemptionVault(s, u, f, r) {}

    function _nav() internal view override returns (uint256 nav) {
        nav = feed.nav();
        uint256 r = ref.nav();
        if (block.timestamp - feed.updatedAt() > 1 days) revert StaleNAV();
        if ((nav > r ? nav - r : r - nav) * 100 > r * 2) revert StaleNAV();
    }
}
