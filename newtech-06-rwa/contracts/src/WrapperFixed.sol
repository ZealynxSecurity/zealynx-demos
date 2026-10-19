// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Wrapper} from "./Wrapper.sol";
import {RwaToken} from "./RwaToken.sol";

/// Bug #3, fixed. Every wrapped-token movement (mint and transfer) runs the underlying
/// token's compliance check, so the wrapper cannot launder eligibility.
contract WrapperFixed is Wrapper {
    constructor(RwaToken _token) Wrapper(_token) {}

    function _update(address from, address to, uint256 amount) internal override {
        if (to != address(0) && !token.canTransfer(from, to)) revert NotEligible();
        super._update(from, to, amount);
    }
}
