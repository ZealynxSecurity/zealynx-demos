// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Attack #4, the first delegate. It keeps `owner` in storage slot 0. Storage belongs
/// to the account, not the code — so whatever this writes to slot 0 stays there after
/// the account re-delegates to different code.
contract DelegateA {
    address public owner; // slot 0
    function setOwner(address newOwner) external { owner = newOwner; }
}
