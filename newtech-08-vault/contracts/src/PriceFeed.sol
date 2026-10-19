// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Our own oracle: a price the owner sets (18 decimals, in test USDC).
/// Left alone, it is a hardcoded "fundamental" price. Updated by a keeper, it tracks the market.
contract PriceFeed {
    address public immutable owner = msg.sender;
    uint256 public price;

    constructor(uint256 price_) { price = price_; }

    function setPrice(uint256 p) external {
        require(msg.sender == owner, "not owner");
        price = p;
    }
}

interface IAMMPrice { function spotPrice() external view returns (uint256); }

/// An oracle that reads the pool's spot price directly.
contract SpotOracle {
    IAMMPrice public immutable amm;
    constructor(IAMMPrice amm_) { amm = amm_; }
    function price() external view returns (uint256) { return amm.spotPrice(); }
}
