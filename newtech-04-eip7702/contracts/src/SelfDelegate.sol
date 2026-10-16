// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct Call { address to; uint256 value; bytes data; }

/// Attack #2, fixed. The same execute(), but it only runs when the caller is the
/// account itself. A delegated EOA's own transaction has msg.sender == address(this);
/// anyone else calling admin.execute(...) is rejected.
contract SelfDelegate {
    error Unauthorized();
    function execute(Call[] calldata calls) external payable {
        if (msg.sender != address(this)) revert Unauthorized();
        for (uint256 i; i < calls.length; i++) {
            (bool ok, ) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            require(ok, "call failed");
        }
    }
}
