// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// A plain 18-decimal test token standing in for QNT. Local only.
contract TestQNT is ERC20 {
    constructor() ERC20("Test QNT", "tQNT") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
