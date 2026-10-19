// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RwaToken} from "./RwaToken.sol";

/// Stand-in wrapper (simplified): deposit the permissioned token, get a plain ERC-20 back.
///
/// Bug #3 (vulnerable): the issuer whitelisted the wrapper contract itself, but the wrapped
/// token never asks compliance. Anyone can end up holding the exposure.
/// Fixed version: WrapperFixed.sol (wrapped transfers call the token's own compliance check).
contract Wrapper is ERC20 {
    RwaToken public immutable token;

    error NotEligible();

    constructor(RwaToken _token) ERC20("Wrapped tFUND", "wtFUND") { token = _token; }

    function wrap(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    function unwrap(uint256 amount) external {
        _burn(msg.sender, amount);
        token.transfer(msg.sender, amount);
    }
}
