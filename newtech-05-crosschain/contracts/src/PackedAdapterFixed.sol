// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Verifiers} from "./Verifiers.sol";

/// Bug #2, fixed. Same fields, same raw bytes, but hashed with abi.encode: every
/// variable-length field carries its own length, so no bytes can move between them.
contract PackedAdapterFixed is Verifiers {
    IERC20 public immutable token;
    mapping(bytes32 => bool) public processed;

    constructor(IERC20 _token, address[] memory verifiers, uint256 _threshold)
        Verifiers(verifiers, _threshold) { token = _token; }

    function digestOf(uint256 nonce, bytes calldata amount, bytes calldata recipient) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, nonce, amount, recipient));
    }

    function release(uint256 nonce, bytes calldata amount, bytes calldata recipient, bytes[] calldata sigs) external {
        bytes32 digest = digestOf(nonce, amount, recipient);
        require(!processed[digest], "already processed");
        processed[digest] = true;
        _checkSigs(digest, sigs);
        token.transfer(_toAddress(recipient), _toUint(amount));
    }

    function _toUint(bytes calldata b) internal pure returns (uint256 v) {
        require(b.length <= 32, "amount too long");
        for (uint256 i; i < b.length; i++) v = (v << 8) | uint8(b[i]);
    }

    function _toAddress(bytes calldata b) internal pure returns (address) {
        require(b.length >= 20, "recipient too short");
        return address(bytes20(b[b.length - 20:]));
    }
}
