// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// The verifier set every stand-in adapter uses: off-chain verifiers sign a digest,
/// and the adapter counts distinct, registered signers against a threshold.
abstract contract Verifiers {
    mapping(address => bool) public isVerifier;
    uint256 public immutable threshold;

    constructor(address[] memory verifiers, uint256 _threshold) {
        for (uint256 i; i < verifiers.length; i++) isVerifier[verifiers[i]] = true;
        threshold = _threshold;
    }

    function _checkSigs(bytes32 digest, bytes[] calldata sigs) internal view {
        bytes32 h = MessageHashUtils.toEthSignedMessageHash(digest);
        address last;
        uint256 count;
        for (uint256 i; i < sigs.length; i++) {
            address signer = ECDSA.recover(h, sigs[i]);
            require(signer > last, "duplicate signer");
            require(isVerifier[signer], "not a verifier");
            last = signer;
            count++;
        }
        require(count >= threshold, "not enough verifiers");
    }
}
