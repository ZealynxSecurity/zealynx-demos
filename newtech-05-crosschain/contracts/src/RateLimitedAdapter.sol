// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Adapter, Message} from "./Adapter.sol";

/// Bug #5, fixed. The same adapter (with the same weak verifier set), plus a limit on
/// how much a route can release per hour. Anything above the limit is held, and the
/// route pauses until a guardian reviews it.
contract RateLimitedAdapter is Adapter {
    uint256 public immutable maxPerHour;
    uint256 public windowStart;
    uint256 public outInWindow;
    bool public paused;
    mapping(address => uint256) public held;

    constructor(IERC20 t, uint256 src, address[] memory v, uint256 th, uint256 _maxPerHour)
        Adapter(t, src, v, th) { maxPerHour = _maxPerHour; }

    function _pay(address to, uint256 amount) internal override {
        require(!paused, "route paused");
        if (block.timestamp >= windowStart + 1 hours) (windowStart, outInWindow) = (block.timestamp, 0);
        uint256 room = maxPerHour - outInWindow;
        uint256 now_ = amount < room ? amount : room;
        outInWindow += now_;
        if (amount > now_) { held[to] += amount - now_; paused = true; }
        token.transfer(to, now_);
    }
}
