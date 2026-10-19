// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Our own constant-product pool (x * y = k, no fee), base token against test USDC. Local only.
/// Its spot price is what "the market" says a token is worth.
contract MockAMM {
    IERC20 public immutable base;
    IERC20 public immutable quote;
    uint256 public reserveBase;
    uint256 public reserveQuote;

    constructor(IERC20 base_, IERC20 quote_) { base = base_; quote = quote_; }

    function addLiquidity(uint256 b, uint256 q) external {
        base.transferFrom(msg.sender, address(this), b);
        quote.transferFrom(msg.sender, address(this), q);
        sync();
    }

    /// Reserves follow balances, so a direct transfer (a donation) moves the price.
    function sync() public {
        reserveBase = base.balanceOf(address(this));
        reserveQuote = quote.balanceOf(address(this));
    }

    function getAmountOut(IERC20 tokenIn, uint256 amountIn) public view returns (uint256) {
        (uint256 rIn, uint256 rOut) = tokenIn == base ? (reserveBase, reserveQuote) : (reserveQuote, reserveBase);
        return amountIn * rOut / (rIn + amountIn);
    }

    function swap(IERC20 tokenIn, uint256 amountIn, address to) external returns (uint256 out) {
        out = getAmountOut(tokenIn, amountIn);
        tokenIn.transferFrom(msg.sender, address(this), amountIn);
        (tokenIn == base ? quote : base).transfer(to, out);
        sync();
    }

    /// Price of one base token in test USDC, 18 decimals.
    function spotPrice() external view returns (uint256) { return reserveQuote * 1e18 / reserveBase; }
}
