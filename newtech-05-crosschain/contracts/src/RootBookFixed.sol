// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RootBook, Entry} from "./RootBook.sol";

/// Bug #4, fixed. Validate the whole batch before applying any of it: a key that
/// appears twice rejects the batch.
contract RootBookFixed is RootBook {
    constructor(IERC20 _token, bytes32 _checkpointRoot, address[] memory verifiers, uint256 _threshold)
        RootBook(_token, _checkpointRoot, verifiers, _threshold) {}

    function applyBatch(uint256 nonce, Entry[] calldata batch, bytes[] calldata sigs) external override {
        for (uint256 i; i < batch.length; i++)
            for (uint256 j = i + 1; j < batch.length; j++)
                require(batch[i].key != batch[j].key, "duplicate key");
        bytes32 digest = keccak256(abi.encode(block.chainid, nonce, batch));
        require(!processed[digest], "already processed");
        processed[digest] = true;
        _checkSigs(digest, sigs);
        require(_first(batch, ROOT) == checkpointRoot, "root mismatch");
        for (uint256 i; i < batch.length; i++) values[batch[i].key] = batch[i].value;
    }
}
