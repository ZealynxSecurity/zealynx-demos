// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct Call { address to; uint256 value; bytes data; }

contract OpenDelegate {
    function execute(Call[] calldata calls) external payable {
        for (uint256 i; i < calls.length; i++) {
            (bool ok, ) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            require(ok, "call failed");
        }
    }
}
