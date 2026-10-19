// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract DelegateA {
    address public owner;
    function setOwner(address newOwner) external { owner = newOwner; }
}
