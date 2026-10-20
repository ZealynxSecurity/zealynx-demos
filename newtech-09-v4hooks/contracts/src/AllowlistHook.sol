// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook, MiniPoolManager, PoolKey, SwapParams, Hooks} from "./MiniPoolManager.sol";

interface IMsgSender { function msgSender() external view returns (address); }

/// A permissioned pool: only allowlisted addresses may swap. It checks `sender`,
/// which is whoever called the pool manager: the router, not the user.
contract AllowlistHook is BaseHook {
    address public immutable admin = msg.sender;
    mapping(address => bool) public allowed;
    address public lastSeen;
    error NotAllowed(address who);

    constructor(MiniPoolManager m) BaseHook(m) {}

    function flags() external pure returns (uint8) { return Hooks.BEFORE_SWAP; }
    function allow(address who) external { require(msg.sender == admin); allowed[who] = true; }

    function beforeSwap(address sender, PoolKey calldata, SwapParams calldata, bytes calldata)
        external virtual override onlyPoolManager returns (bytes4, uint256, uint256)
    {
        lastSeen = sender;
        if (!allowed[sender]) revert NotAllowed(sender);
        return (this.beforeSwap.selector, 0, 0);
    }
}

/// Fix #2: ask a router you trust who the real user is.
contract AllowlistHookFixed is AllowlistHook {
    mapping(address => bool) public trustedRouter;

    constructor(MiniPoolManager m) AllowlistHook(m) {}

    function trustRouter(address r) external { require(msg.sender == admin); trustedRouter[r] = true; }

    function beforeSwap(address sender, PoolKey calldata, SwapParams calldata, bytes calldata)
        external override onlyPoolManager returns (bytes4, uint256, uint256)
    {
        address user = trustedRouter[sender] ? IMsgSender(sender).msgSender() : sender;
        lastSeen = user;
        if (!allowed[user]) revert NotAllowed(user);
        return (this.beforeSwap.selector, 0, 0);
    }
}
