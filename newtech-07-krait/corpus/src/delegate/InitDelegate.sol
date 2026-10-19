// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract InitDelegate {
    address public owner;
    bool public initialized;
    function initialize(address newOwner) external {
        require(!initialized, "already init");
        initialized = true;
        owner = newOwner;
    }
}
