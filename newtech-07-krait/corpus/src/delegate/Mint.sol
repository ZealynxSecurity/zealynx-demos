// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract Mint {
    mapping(address => uint256) public minted;
    function mint() external {
        require(tx.origin == msg.sender, "humans only");
        minted[msg.sender] += 1;
    }
}
