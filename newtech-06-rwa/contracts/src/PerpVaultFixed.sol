// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PerpVault} from "./PerpVault.sol";

/// Bug #1, fixed. A report must not come from the future and must be at most MAX_AGE old.
contract PerpVaultFixed is PerpVault {
    uint256 public constant MAX_AGE = 60; // seconds

    error FutureReport();

    constructor(IERC20 _usdc, address _reporter) PerpVault(_usdc, _reporter) {}

    function _checkTime(uint64 ts) internal view override {
        if (ts > block.timestamp || block.timestamp - ts > MAX_AGE) revert FutureReport();
    }
}
