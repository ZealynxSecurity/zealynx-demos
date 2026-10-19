// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestToken} from "./TestToken.sol";

/// Stand-in async redemption queue (simplified, ERC-7540-like): request now, settle later.
/// NAV is struck once per epoch from the vault's own assets / share supply.
///
/// Bug #5 (vulnerable): a request settles at the NAV of the epoch it was made in. Whoever
/// requests before a loss is struck exits at the old price; remaining holders eat the gap.
/// Fixed version: AsyncRedeemFixed.sol (settle at the first NAV struck after the request).
contract AsyncRedeem {
    struct Request { address owner; uint256 shares; uint256 epoch; bool done; }

    IERC20 public immutable usdc;
    TestToken public immutable shares;
    address public immutable admin = msg.sender;
    uint256[] public navs; // navs[e] = NAV per share struck at epoch e (18 decimals)
    Request[] public requests;

    error NotYetPriced();

    constructor(IERC20 _usdc, TestToken _shares) { usdc = _usdc; shares = _shares; navs.push(1e18); }

    function epoch() public view returns (uint256) { return navs.length - 1; }
    function navAt(uint256 e) public view returns (uint256) { return navs[e]; }

    /// Admin strikes the next NAV from on-chain assets.
    function strikeNav() external {
        require(msg.sender == admin, "not admin");
        navs.push(usdc.balanceOf(address(this)) * 1e18 / shares.totalSupply());
    }

    /// Admin books a strategy loss (stand-in: assets leave the vault).
    function writeDown(uint256 amount, address sink) external {
        require(msg.sender == admin, "not admin");
        usdc.transfer(sink, amount);
    }

    function requestRedeem(uint256 amount) external returns (uint256 id) {
        shares.transferFrom(msg.sender, address(this), amount);
        requests.push(Request(msg.sender, amount, epoch(), false));
        return requests.length - 1;
    }

    function settle(uint256 id) external {
        Request storage r = requests[id];
        require(!r.done, "done");
        uint256 nav = _settleNav(r);
        r.done = true;
        shares.burn(address(this), r.shares);
        usdc.transfer(r.owner, r.shares * nav / 1e18);
    }

    /// Vulnerable: the price that was known when the request was made.
    function _settleNav(Request storage r) internal view virtual returns (uint256) {
        return navAt(r.epoch);
    }
}
