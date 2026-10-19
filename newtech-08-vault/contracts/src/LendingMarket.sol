// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOracle { function price() external view returns (uint256); }

/// Our own minimal Compound-style market (not real protocol code). Lenders deposit test USDC;
/// borrowers supply one collateral token, receive shares, and borrow up to 80% of its value.
/// This base version has no deviation check, no supply cap and no circuit breaker, and it sets
/// the share exchange rate from its own token balance.
contract LendingMarket {
    IERC20 public immutable collateral;
    IERC20 public immutable loan;
    IOracle public immutable oracle;
    uint256 public constant LTV = 0.8e18;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    mapping(address => uint256) public debt;
    uint256 public totalDebt;
    uint256 public badDebt;

    constructor(IERC20 collateral_, IERC20 loan_, IOracle oracle_) {
        collateral = collateral_; loan = loan_; oracle = oracle_;
    }

    function deposit(uint256 amt) external { loan.transferFrom(msg.sender, address(this), amt); }

    function supply(uint256 amt) external {
        _beforeSupply(amt);
        uint256 s = totalShares == 0 ? amt : amt * 1e18 / exchangeRate();
        collateral.transferFrom(msg.sender, address(this), amt);
        _afterSupply(amt);
        shares[msg.sender] += s;
        totalShares += s;
    }

    /// Collateral per share, 18 decimals.
    function exchangeRate() public view virtual returns (uint256) {
        if (totalShares == 0) return 1e18;
        return collateral.balanceOf(address(this)) * 1e18 / totalShares;
    }

    function collateralOf(address u) public view returns (uint256) { return shares[u] * exchangeRate() / 1e18; }
    function valueOf(address u) public view returns (uint256) { return collateralOf(u) * oracle.price() / 1e18; }
    function maxBorrow(address u) public view returns (uint256) { return valueOf(u) * LTV / 1e18 - debt[u]; }

    function borrow(uint256 amt) external {
        _beforeBorrow();
        require(debt[msg.sender] + amt <= valueOf(msg.sender) * LTV / 1e18, "undercollateralised");
        debt[msg.sender] += amt;
        totalDebt += amt;
        loan.transfer(msg.sender, amt);
    }

    /// The liquidator repays what the collateral is worth and takes all of it.
    /// Whatever debt is left over is bad debt, and the lenders carry it.
    function liquidate(address u) external {
        uint256 value = valueOf(u);
        require(debt[u] * 1e18 > value * LTV, "healthy");
        uint256 repay = debt[u] < value ? debt[u] : value;
        loan.transferFrom(msg.sender, address(this), repay);
        uint256 seized = collateralOf(u);
        totalShares -= shares[u];
        shares[u] = 0;
        _afterSeize(seized);
        collateral.transfer(msg.sender, seized);
        badDebt += debt[u] - repay;
        totalDebt -= debt[u];
        debt[u] = 0;
    }

    function _beforeSupply(uint256) internal virtual {}
    function _afterSupply(uint256) internal virtual {}
    function _afterSeize(uint256) internal virtual {}
    function _beforeBorrow() internal view virtual {}
}
