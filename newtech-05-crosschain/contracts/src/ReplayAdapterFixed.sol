// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Verifiers} from "./Verifiers.sol";

/// Bug #3, fixed. The digest binds source chain, destination chain and nonce, and
/// the message is marked processed the first time it runs.
contract ReplayAdapterFixed is Verifiers {
    IERC20 public immutable token;
    uint256 public immutable srcChain;
    mapping(bytes32 => bool) public processed;

    constructor(IERC20 _token, uint256 _srcChain, address[] memory verifiers, uint256 _threshold)
        Verifiers(verifiers, _threshold) { token = _token; srcChain = _srcChain; }

    function release(uint256 nonce, address to, uint256 amount, bytes[] calldata sigs) external {
        bytes32 digest = keccak256(abi.encode(srcChain, block.chainid, nonce, to, amount));
        require(!processed[digest], "already processed");
        processed[digest] = true;
        _checkSigs(digest, sigs);
        token.transfer(to, amount);
    }
}
