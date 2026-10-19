// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Our own minimal curator vault (ERC-4626 in spirit, not real protocol code). Depositors put in
/// test USDC; the curator sets a cap per market and allocates deposits up to it.
/// Here a cap change takes effect immediately.
contract CuratorVault {
    IERC20 public immutable asset;
    address public immutable curator;
    mapping(address => uint256) public cap;
    mapping(address => uint256) public allocated;
    mapping(address => uint256) public balanceOf;

    constructor(IERC20 asset_, address curator_) { asset = asset_; curator = curator_; }

    modifier onlyCurator() { require(msg.sender == curator, "not curator"); _; }

    function deposit(uint256 amt) external {
        asset.transferFrom(msg.sender, address(this), amt);
        balanceOf[msg.sender] += amt;
    }

    function withdraw(uint256 amt) external {
        balanceOf[msg.sender] -= amt;
        asset.transfer(msg.sender, amt);
    }

    function setCap(address market, uint256 newCap) public virtual onlyCurator {
        cap[market] = newCap;
    }

    function allocate(address market, uint256 amt) external onlyCurator {
        require(allocated[market] + amt <= cap[market], "above cap");
        allocated[market] += amt;
        asset.transfer(market, amt);
    }
}
