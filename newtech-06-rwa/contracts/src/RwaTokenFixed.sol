// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RwaToken} from "./RwaToken.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";

/// Bug #4, fixed. The agent's forcedTransfer no longer moves tokens: it is capped per
/// operation and queued behind a 48h delay, with an event anyone can watch. A guardian can
/// cancel during the delay; after it, anyone can execute. A stolen key alone moves nothing now.
contract RwaTokenFixed is RwaToken {
    struct Op { address from; address to; uint256 amount; uint256 eta; bool done; }

    uint256 public constant DELAY = 48 hours;
    uint256 public immutable maxForced;
    address public immutable guardian;
    Op[] public ops;

    event ForcedTransferQueued(uint256 indexed id, address from, address to, uint256 amount, uint256 eta);
    error OverCap();
    error NotReady();

    constructor(string memory name, string memory symbol, IdentityRegistry r, address _agent, uint256 _cap, address _guardian)
        RwaToken(name, symbol, r, _agent) { maxForced = _cap; guardian = _guardian; }

    function forcedTransfer(address from, address to, uint256 amount) public override {
        if (msg.sender != agent) revert NotAgent();
        if (amount > maxForced) revert OverCap();                        // capped
        ops.push(Op(from, to, amount, block.timestamp + DELAY, false));  // queued
        emit ForcedTransferQueued(ops.length - 1, from, to, amount, block.timestamp + DELAY); // visible
    }

    function executeForced(uint256 id) external {
        Op storage op = ops[id];
        if (op.done || block.timestamp < op.eta) revert NotReady();
        op.done = true;
        _transfer(op.from, op.to, op.amount);
    }

    function cancelForced(uint256 id) external {
        require(msg.sender == guardian, "not guardian");
        ops[id].done = true;
    }

    function opsCount() external view returns (uint256) { return ops.length; }
}
