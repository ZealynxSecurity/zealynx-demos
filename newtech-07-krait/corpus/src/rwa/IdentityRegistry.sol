// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract IdentityRegistry {
    address public immutable owner = msg.sender;
    mapping(address => bool) public isVerified;

    function register(address who, bool ok) external {
        require(msg.sender == owner, "not owner");
        isVerified[who] = ok;
    }
}
