// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// Workflow example for Episode 7: every bug you fix gets a test that fails if it comes back.
// P14 (stale NAV) from the planted corpus, against the fixed vault from Episode 6.
import {Test} from "forge-std/Test.sol";
import {Setup} from "./Setup.sol";

contract RegressionTest is Test, Setup {
    function test_bug_P14_staleNav() public {
        vm.warp(block.timestamp + 3 days);           // the NAV feed stops updating
        vm.expectRevert(RedemptionVault.StaleNAV.selector);
        vault.redeem(1_000_000e18);                  // must refuse the old price
    }
}
