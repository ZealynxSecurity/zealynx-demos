// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Verifiers} from "./Verifiers.sol";

struct Entry { bytes32 key; bytes32 value; }

contract RootBook is Verifiers {
    bytes32 public constant ROOT = "root";
    IERC20 public immutable token;
    bytes32 public checkpointRoot;
    mapping(bytes32 => bytes32) public values;
    mapping(bytes32 => bool) public processed;

    constructor(IERC20 _token, bytes32 _checkpointRoot, address[] memory verifiers, uint256 _threshold)
        Verifiers(verifiers, _threshold) { token = _token; checkpointRoot = _checkpointRoot; values[ROOT] = _checkpointRoot; }

    function trustedRoot() external view returns (bytes32) { return values[ROOT]; }

    function applyBatch(uint256 nonce, Entry[] calldata batch, bytes[] calldata sigs) external virtual {
        bytes32 digest = keccak256(abi.encode(block.chainid, nonce, batch));
        require(!processed[digest], "already processed");
        processed[digest] = true;
        _checkSigs(digest, sigs);
        require(_first(batch, ROOT) == checkpointRoot, "root mismatch");
        for (uint256 i; i < batch.length; i++) values[batch[i].key] = batch[i].value;
    }

    function claim(address to, uint256 amount) external {
        require(keccak256(abi.encode(to, amount)) == values[ROOT], "not in root");
        require(!processed[values[ROOT]], "claimed");
        processed[values[ROOT]] = true;
        token.transfer(to, amount);
    }

    function _first(Entry[] calldata batch, bytes32 key) internal pure returns (bytes32) {
        for (uint256 i; i < batch.length; i++) if (batch[i].key == key) return batch[i].value;
        return bytes32(0);
    }
}
