// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestToken} from "./TestToken.sol";

contract AsyncRedeem {
    struct Request { address owner; uint256 shares; uint256 epoch; bool done; }

    IERC20 public immutable usdc;
    TestToken public immutable shares;
    address public immutable admin = msg.sender;
    uint256[] public navs;
    Request[] public requests;

    error NotYetPriced();

    constructor(IERC20 _usdc, TestToken _shares) { usdc = _usdc; shares = _shares; navs.push(1e18); }

    function epoch() public view returns (uint256) { return navs.length - 1; }
    function navAt(uint256 e) public view returns (uint256) { return navs[e]; }

    function strikeNav() external {
        require(msg.sender == admin, "not admin");
        navs.push(usdc.balanceOf(address(this)) * 1e18 / shares.totalSupply());
    }

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

    function _settleNav(Request storage r) internal view virtual returns (uint256) {
        return navAt(r.epoch);
    }
}
