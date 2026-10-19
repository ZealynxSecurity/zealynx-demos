// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LendingMarket, IOracle, IERC20} from "./LendingMarket.sol";

/// Fix #2: a supply cap on the collateral, sized to what could be sold in a crash.
contract CappedMarket is LendingMarket {
    uint256 public immutable supplyCap;
    uint256 public totalSupplied;

    constructor(IERC20 c, IERC20 l, IOracle o, uint256 cap) LendingMarket(c, l, o) { supplyCap = cap; }

    function _beforeSupply(uint256 amt) internal view override {
        require(totalSupplied + amt <= supplyCap, "supply cap");
    }

    function _afterSupply(uint256 amt) internal override { totalSupplied += amt; }
    function _afterSeize(uint256 amt) internal override { totalSupplied -= amt; }
}
