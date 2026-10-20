// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseHook, MiniPoolManager, PoolKey, SwapParams, Hooks} from "./MiniPoolManager.sol";

/// Pays every swapper a 1% rebate in tUSDC from its own budget, after the swap.
/// The recipient comes from hookData. afterSwap has no caller check.
contract RebateHook is BaseHook {
    IERC20 public immutable rewardToken;

    constructor(MiniPoolManager m, IERC20 reward) BaseHook(m) { rewardToken = reward; }

    function flags() external pure returns (uint8) { return Hooks.AFTER_SWAP; }

    function afterSwap(address, PoolKey calldata, SwapParams calldata params, uint256, bytes calldata hookData)
        external virtual override returns (bytes4)
    {
        return _rebate(params, hookData);
    }

    function _rebate(SwapParams calldata params, bytes calldata hookData) internal returns (bytes4) {
        address to = abi.decode(hookData, (address));
        uint256 budget = rewardToken.balanceOf(address(this));
        uint256 r = params.amountIn / 100;
        rewardToken.transfer(to, r < budget ? r : budget);
        return this.afterSwap.selector;
    }
}

/// Fix #1: only the pool manager may call the callback.
contract RebateHookFixed is RebateHook {
    constructor(MiniPoolManager m, IERC20 reward) RebateHook(m, reward) {}

    function afterSwap(address, PoolKey calldata, SwapParams calldata params, uint256, bytes calldata hookData)
        external override onlyPoolManager returns (bytes4)
    {
        return _rebate(params, hookData);
    }
}
