// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// A pool is identified by its two tokens, its fee and its hook, as in Uniswap v4.
struct PoolKey { address currency0; address currency1; uint24 fee; address hooks; }
struct SwapParams { bool zeroForOne; uint256 amountIn; }

library Hooks {
    uint8 constant BEFORE_SWAP = 1;
    uint8 constant AFTER_SWAP = 2;
    uint8 constant BEFORE_SWAP_RETURNS_DELTA = 4;
}

interface IHooks {
    /// Which callbacks this hook wants (v4 reads them from the hook address's low bits).
    function flags() external view returns (uint8);
    /// Returns how much of the input the hook takes, and how much output it gives (its "delta").
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external returns (bytes4, uint256 takeIn, uint256 giveOut);
    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, uint256 amountOut, bytes calldata hookData)
        external returns (bytes4);
}

/// Our own minimal stand-in for the v4 PoolManager (not Uniswap code): one contract holds every
/// pool, anyone can create a pool with any hook, and hooks run around every swap.
/// Simplified: each swap settles immediately (no unlock / flash accounting), constant product, no fee.
contract MiniPoolManager {
    struct Pool { uint256 reserve0; uint256 reserve1; bool initialized; }
    mapping(bytes32 => Pool) public pools;
    uint256 public swapCount;

    event Initialize(bytes32 indexed id, address hooks);
    event Swap(bytes32 indexed id, address sender, uint256 amountIn, uint256 amountOut);

    function toId(PoolKey calldata key) public pure returns (bytes32) { return keccak256(abi.encode(key)); }

    /// Permissionless, as in v4: anyone can create a pool with any hook.
    function initialize(PoolKey calldata key) external {
        bytes32 id = toId(key);
        require(!pools[id].initialized, "exists");
        pools[id].initialized = true;
        emit Initialize(id, key.hooks);
    }

    function addLiquidity(PoolKey calldata key, uint256 a0, uint256 a1) external {
        Pool storage p = pools[toId(key)];
        require(p.initialized, "no pool");
        IERC20(key.currency0).transferFrom(msg.sender, address(this), a0);
        IERC20(key.currency1).transferFrom(msg.sender, address(this), a1);
        p.reserve0 += a0; p.reserve1 += a1;
    }

    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData) external returns (uint256 amountOut) {
        bytes32 id = toId(key);
        Pool storage p = pools[id];
        require(p.initialized, "no pool");
        (IERC20 tIn, IERC20 tOut) = params.zeroForOne
            ? (IERC20(key.currency0), IERC20(key.currency1)) : (IERC20(key.currency1), IERC20(key.currency0));
        tIn.transferFrom(msg.sender, address(this), params.amountIn);
        uint8 f = key.hooks == address(0) ? 0 : IHooks(key.hooks).flags();

        uint256 rest = params.amountIn;
        if (f & Hooks.BEFORE_SWAP != 0) {
            (, uint256 takeIn, uint256 giveOut) = IHooks(key.hooks).beforeSwap(msg.sender, key, params, hookData);
            if (f & Hooks.BEFORE_SWAP_RETURNS_DELTA != 0) {
                tIn.transfer(key.hooks, takeIn);                    // the hook keeps what it took
                tOut.transferFrom(key.hooks, address(this), giveOut); // and pays what it gives
                rest -= takeIn;
                amountOut += giveOut;
            }
        }
        if (rest > 0) {
            (uint256 rIn, uint256 rOut) = params.zeroForOne ? (p.reserve0, p.reserve1) : (p.reserve1, p.reserve0);
            uint256 out = rest * rOut / (rIn + rest);
            if (params.zeroForOne) { p.reserve0 += rest; p.reserve1 -= out; } else { p.reserve1 += rest; p.reserve0 -= out; }
            amountOut += out;
        }
        tOut.transfer(msg.sender, amountOut);
        if (f & Hooks.AFTER_SWAP != 0) IHooks(key.hooks).afterSwap(msg.sender, key, params, amountOut, hookData);
        swapCount++;
        emit Swap(id, msg.sender, params.amountIn, amountOut);
    }
}

/// A router: users call it, it calls the pool manager. So every hook sees sender = the router.
/// Like v4-periphery, it exposes msgSender(): the user who called it.
contract MiniRouter {
    MiniPoolManager public immutable manager;
    address private _user;

    constructor(MiniPoolManager m) { manager = m; }

    function msgSender() external view returns (address) { return _user; }

    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, bytes calldata hookData) external returns (uint256 out) {
        (IERC20 tIn, IERC20 tOut) = zeroForOne
            ? (IERC20(key.currency0), IERC20(key.currency1)) : (IERC20(key.currency1), IERC20(key.currency0));
        tIn.transferFrom(msg.sender, address(this), amountIn);
        tIn.approve(address(manager), amountIn);
        _user = msg.sender;
        out = manager.swap(key, SwapParams(zeroForOne, amountIn), hookData);
        _user = address(0);
        tOut.transfer(msg.sender, out);
    }
}

/// Shared base for our hooks. Callbacks a hook doesn't use revert.
abstract contract BaseHook is IHooks {
    MiniPoolManager public immutable poolManager;
    error NotPoolManager();
    constructor(MiniPoolManager m) { poolManager = m; }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external virtual returns (bytes4, uint256, uint256) { revert("unused"); }
    function afterSwap(address, PoolKey calldata, SwapParams calldata, uint256, bytes calldata)
        external virtual returns (bytes4) { revert("unused"); }
}

library FullMath {
    function mulDiv(uint256 a, uint256 b, uint256 d) internal pure returns (uint256) { return a * b / d; }
    function mulDivRoundingUp(uint256 a, uint256 b, uint256 d) internal pure returns (uint256) { return (a * b + d - 1) / d; }
}
