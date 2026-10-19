// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Verifiers} from "./Verifiers.sol";

struct Message { uint256 srcChain; uint256 dstChain; uint256 nonce; address to; uint256 amount; }

contract Adapter is Verifiers {
    IERC20 public immutable token;
    uint256 public immutable srcChain;
    mapping(bytes32 => bool) public processed;

    constructor(IERC20 _token, uint256 _srcChain, address[] memory verifiers, uint256 _threshold)
        Verifiers(verifiers, _threshold) { token = _token; srcChain = _srcChain; }

    function release(Message calldata m, bytes[] calldata sigs) external {
        require(m.srcChain == srcChain && m.dstChain == block.chainid, "wrong route");
        bytes32 digest = keccak256(abi.encode(m));
        require(!processed[digest], "already processed");
        processed[digest] = true;
        _checkSigs(digest, sigs);
        _pay(m.to, m.amount);
    }

    function _pay(address to, uint256 amount) internal virtual { token.transfer(to, amount); }
}
