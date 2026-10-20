// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseHook, MiniPoolManager, PoolKey, SwapParams, Hooks} from "./MiniPoolManager.sol";

/// A vault that sells its tUSDC rewards for tETH. Anyone can trigger the harvest, and the caller
/// picks the pool. No hook check, no minimum out.
contract HarvestVault {
    MiniPoolManager public immutable manager;
    IERC20 public immutable reward;
    IERC20 public immutable want;
    address public immutable admin = msg.sender;
    mapping(address => bool) public allowedHook;
    error HookNotAllowed(address hook);

    constructor(MiniPoolManager m, IERC20 r, IERC20 w) { manager = m; reward = r; want = w; }

    function allowHook(address h) external { require(msg.sender == admin); allowedHook[h] = true; }

    function harvest(PoolKey calldata key) external virtual returns (uint256 out) {
        return _swap(key, 0);
    }

    function _swap(PoolKey calldata key, uint256 minOut) internal returns (uint256 out) {
        require(key.currency0 == address(reward) && key.currency1 == address(want), "pair");
        uint256 amt = reward.balanceOf(address(this));
        reward.approve(address(manager), amt);
        out = manager.swap(key, SwapParams(true, amt), "");
        require(out >= minOut, "min out");
    }
}

/// Fix #5: only allowlisted hooks, and a minimum amount out.
contract HarvestVaultFixed is HarvestVault {
    uint256 public constant MIN_OUT_BPS = 9_500; // at least 95% of the expected amount

    constructor(MiniPoolManager m, IERC20 r, IERC20 w) HarvestVault(m, r, w) {}

    function harvest(PoolKey calldata key) external override returns (uint256 out) {
        if (!allowedHook[key.hooks]) revert HookNotAllowed(key.hooks);
        return _swap(key, expectedOut() * MIN_OUT_BPS / 10_000);
    }

    uint256 public expected;
    function setExpected(uint256 e) external { require(msg.sender == admin); expected = e; }
    function expectedOut() public view returns (uint256) { return expected; }
}

/// The attacker's hook: takes the whole input and gives nothing back.
contract AttackerHook is BaseHook {
    constructor(MiniPoolManager m) BaseHook(m) {}
    function flags() external pure returns (uint8) { return Hooks.BEFORE_SWAP | Hooks.BEFORE_SWAP_RETURNS_DELTA; }
    function beforeSwap(address, PoolKey calldata, SwapParams calldata params, bytes calldata)
        external override onlyPoolManager returns (bytes4, uint256, uint256)
    {
        return (this.beforeSwap.selector, params.amountIn, 0);
    }
}

/// A plain no-op hook for the legitimate pool.
contract NoopHook is BaseHook {
    constructor(MiniPoolManager m) BaseHook(m) {}
    function flags() external pure returns (uint8) { return 0; }
}
