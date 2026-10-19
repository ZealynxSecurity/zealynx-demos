// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestToken} from "./TestToken.sol";
import {AsyncRedeem} from "./AsyncRedeem.sol";

/// Bug #5, fixed. A request settles at the first NAV struck AFTER it was made,
/// so the redeemer shares any loss booked while the request was pending.
contract AsyncRedeemFixed is AsyncRedeem {
    constructor(IERC20 u, TestToken s) AsyncRedeem(u, s) {}

    function _settleNav(Request storage r) internal view override returns (uint256) {
        if (r.epoch + 1 > epoch()) revert NotYetPriced();
        return navAt(r.epoch + 1);
    }
}
