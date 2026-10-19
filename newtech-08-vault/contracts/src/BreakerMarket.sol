// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LendingMarket, IOracle, IERC20} from "./LendingMarket.sol";

/// Fix #4: a depeg circuit breaker. New borrows stop when the collateral drifts more than 3%
/// from its peg. Repayments and liquidations are untouched.
contract BreakerMarket is LendingMarket {
    uint256 public constant PEG = 1e18;
    uint256 public constant MAX_DEV = 0.03e18; // 3%

    constructor(IERC20 c, IERC20 l, IOracle o) LendingMarket(c, l, o) {}

    function borrowPaused() public view returns (bool) {
        uint256 p = oracle.price();
        uint256 dev = p > PEG ? p - PEG : PEG - p;
        return dev * 1e18 / PEG > MAX_DEV;
    }

    function _beforeBorrow() internal view override {
        if (borrowPaused()) revert("borrow paused: depeg");
    }
}
