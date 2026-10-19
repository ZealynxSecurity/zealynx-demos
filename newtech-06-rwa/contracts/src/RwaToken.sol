// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";

/// Stand-in for an ERC-3643-style permissioned token (simplified, not real T-REX code).
/// Every holder-to-holder transfer asks compliance: is the receiver verified?
///
/// Bug #4 (vulnerable): forcedTransfer is gated by ONE agent key, with no delay and no cap.
/// batchForcedTransfer lets that key move every holder's balance in a single transaction.
/// Fixed version: RwaTokenFixed.sol (timelock role + per-operation cap).
contract RwaToken is ERC20 {
    IdentityRegistry public immutable registry;
    address public immutable agent;

    error NotEligible();
    error NotAgent();

    constructor(string memory name, string memory symbol, IdentityRegistry _registry, address _agent)
        ERC20(name, symbol) { registry = _registry; agent = _agent; }

    /// Compliance check (simplified): the receiver must be a verified identity.
    function canTransfer(address, address to) public view returns (bool) {
        return registry.isVerified(to);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!canTransfer(msg.sender, to)) revert NotEligible();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!canTransfer(from, to)) revert NotEligible();
        return super.transferFrom(from, to, amount);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != agent) revert NotAgent();
        if (!registry.isVerified(to)) revert NotEligible();
        _mint(to, amount);
    }

    /// Recovery tool (lost keys, court orders). Vulnerable: one key, instant, unlimited.
    function forcedTransfer(address from, address to, uint256 amount) public virtual {
        if (msg.sender != agent) revert NotAgent();
        _transfer(from, to, amount);
    }

    function batchForcedTransfer(address[] calldata from, address[] calldata to, uint256[] calldata amounts) external {
        for (uint256 i; i < from.length; i++) forcedTransfer(from[i], to[i], amounts[i]);
    }
}
