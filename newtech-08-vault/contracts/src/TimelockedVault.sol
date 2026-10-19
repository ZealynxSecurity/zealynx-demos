// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CuratorVault, IERC20} from "./CuratorVault.sol";

/// Fix #5: a cap increase waits behind a timelock, so depositors see it coming and can leave.
/// Cuts still apply at once.
contract TimelockedVault is CuratorVault {
    struct Pending { uint256 cap; uint256 validAt; }
    uint256 public constant TIMELOCK = 3 days;
    mapping(address => Pending) public pendingCap;

    constructor(IERC20 a, address c) CuratorVault(a, c) {}

    function setCap(address market, uint256 newCap) public override onlyCurator {
        if (newCap <= cap[market]) { cap[market] = newCap; return; }
        pendingCap[market] = Pending(newCap, block.timestamp + TIMELOCK);
    }

    function acceptCap(address market) external {
        Pending memory p = pendingCap[market];
        require(p.validAt != 0 && block.timestamp >= p.validAt, "timelocked");
        cap[market] = p.cap;
        delete pendingCap[market];
    }
}
