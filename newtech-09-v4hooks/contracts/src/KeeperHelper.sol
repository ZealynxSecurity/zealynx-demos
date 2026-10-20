// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Our own minimal smart wallet (not Safe code): the owner enables modules, and a module can
/// move the wallet's tokens.
contract MiniWallet {
    address public immutable owner = msg.sender;
    mapping(address => bool) public isModule;

    function enableModule(address m) external { require(msg.sender == owner, "owner"); isModule[m] = true; }

    function execFromModule(IERC20 token, address to, uint256 amount) external {
        require(isModule[msg.sender], "not module");
        token.transfer(to, amount);
    }
}

/// A liquidity module: moves the wallet's position to a new pool. Only its helper may call it.
contract LPModule {
    MiniWallet public immutable wallet;
    IERC20 public immutable token;
    address public immutable helper;

    constructor(MiniWallet w, IERC20 t, address h) { wallet = w; token = t; helper = h; }

    /// Move the whole position to `newPool` (a rebalance, in the real design).
    function moveLiquidity(address newPool) external {
        require(msg.sender == helper, "not helper");
        wallet.execFromModule(token, newPool, token.balanceOf(address(wallet)));
    }
}

/// A public multicall for keeper bots, authorized on the module. It checks the call target,
/// not the caller, so anyone can drive the module through it.
contract KeeperHelper {
    struct Call { address target; bytes data; }
    address public immutable owner = msg.sender;
    mapping(address => bool) public approvedTarget;
    mapping(address => bool) public isKeeper;
    error NotKeeper();

    function approveTarget(address t) external { require(msg.sender == owner); approvedTarget[t] = true; }
    function addKeeper(address k) external { require(msg.sender == owner); isKeeper[k] = true; }

    function multicall(Call[] calldata calls) external virtual {
        _run(calls);
    }

    function _run(Call[] calldata calls) internal {
        for (uint256 i; i < calls.length; i++) {
            require(approvedTarget[calls[i].target], "target");
            (bool ok,) = calls[i].target.call(calls[i].data);
            require(ok, "call failed");
        }
    }
}

/// Fix #4: check the caller, not just the target.
contract KeeperHelperFixed is KeeperHelper {
    function multicall(Call[] calldata calls) external override {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _run(calls);
    }
}
