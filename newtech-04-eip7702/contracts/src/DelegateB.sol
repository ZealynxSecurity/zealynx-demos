// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #4, vulnerable. A different delegate the account switches to. Its first
/// variable, `guardian`, also lands in slot 0 — so it reads back the value delegate A
/// left there, with no one ever having set guardian on this code.
contract DelegateB {
    address public guardian; // slot 0 — collides with DelegateA.owner
}
