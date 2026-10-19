// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Verifiers} from "./Verifiers.sol";

contract ReplayAdapter is Verifiers {
    IERC20 public immutable token;

    constructor(IERC20 _token, address[] memory verifiers, uint256 _threshold)
        Verifiers(verifiers, _threshold) { token = _token; }

    function release(address to, uint256 amount, bytes[] calldata sigs) external {
        bytes32 digest = keccak256(abi.encode(to, amount));
        _checkSigs(digest, sigs);
        token.transfer(to, amount);
    }
}
