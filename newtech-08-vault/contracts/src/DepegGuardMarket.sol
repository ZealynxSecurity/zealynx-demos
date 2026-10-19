// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LendingMarket, IOracle, IERC20} from "./LendingMarket.sol";
import {IAMMPrice} from "./PriceFeed.sol";

/// Fix #1: keep the reference price, but check it against a live market price.
contract DepegGuardMarket is LendingMarket {
    IAMMPrice public immutable market;
    uint256 public constant MAX_DEV = 0.02e18; // 2%

    constructor(IERC20 c, IERC20 l, IOracle o, IAMMPrice m) LendingMarket(c, l, o) { market = m; }

    function _beforeBorrow() internal view override {
        uint256 fundamental = oracle.price();
        uint256 live = market.spotPrice();
        uint256 diff = fundamental > live ? fundamental - live : live - fundamental;
        require(diff * 1e18 / fundamental <= MAX_DEV, "price deviation");
    }
}
