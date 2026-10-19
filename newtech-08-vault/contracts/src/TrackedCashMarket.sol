// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LendingMarket, IOracle, IERC20} from "./LendingMarket.sol";

/// Fix #3: the exchange rate comes from cash the market tracked itself, not from balanceOf.
contract TrackedCashMarket is LendingMarket {
    uint256 public cash;

    constructor(IERC20 c, IERC20 l, IOracle o) LendingMarket(c, l, o) {}

    function exchangeRate() public view override returns (uint256) {
        if (totalShares == 0) return 1e18;
        return cash * 1e18 / totalShares; // a donation changes the balance, not cash
    }

    function _afterSupply(uint256 amt) internal override { cash += amt; }
    function _afterSeize(uint256 amt) internal override { cash -= amt; }
}
