// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// The pool from attack #2. It holds tQNT and only the admin may withdraw. The bug
/// is not here: it is that the admin is an EOA delegated to a contract with an open
/// execute(), so anyone can act *as* the admin and pass this msg.sender check.
contract Pool {
    IERC20 public immutable token;
    address public immutable admin;
    constructor(IERC20 t, address a) { token = t; admin = a; }
    function balance() external view returns (uint256) { return token.balanceOf(address(this)); }
    function withdraw(address to, uint256 amount) external {
        require(msg.sender == admin, "not admin");
        token.transfer(to, amount);
    }
}
