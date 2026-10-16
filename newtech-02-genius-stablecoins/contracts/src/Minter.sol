// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// Two-step minter, VULNERABLE ON PURPOSE (the Resolv pattern, March 2026).
/// A user deposits collateral; an off-chain service key completes the swap
/// with whatever mint amount it likes. Teaching code only.
contract Minter is AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant SERVICE_ROLE = keccak256("SERVICE_ROLE");

    struct Request {
        address user;
        uint256 collateralIn;
        bool done;
    }

    IERC20 public immutable collateral;
    IMintable public immutable zusd;
    Request[] public requests;

    constructor(IERC20 collateral_, IMintable zusd_, address service) {
        collateral = collateral_;
        zusd = zusd_;
        _grantRole(SERVICE_ROLE, service);
    }

    function requestSwap(uint256 amount) external returns (uint256 id) {
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        requests.push(Request(msg.sender, amount, false));
        return requests.length - 1;
    }

    // Mistake 1: the service key decides the amount. No cap, no link to collateral.
    function completeSwap(uint256 id, uint256 mintAmount) external onlyRole(SERVICE_ROLE) {
        Request storage r = requests[id];
        require(!r.done, "done");
        r.done = true;
        zusd.mint(r.user, mintAmount);
    }
}

/// The fix: a hard cap per hour, and never more zUSD out than collateral in.
contract MinterFixed is AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant SERVICE_ROLE = keccak256("SERVICE_ROLE");
    uint256 public constant WINDOW = 1 hours;
    uint256 public constant WINDOW_CAP = 1_000_000e6;

    struct Request {
        address user;
        uint256 collateralIn;
        bool done;
    }

    IERC20 public immutable collateral;
    IMintable public immutable zusd;
    Request[] public requests;
    uint256 public windowStart;
    uint256 public mintedInWindow;

    error MintCapExceeded(uint256 minted, uint256 cap);
    error CollateralRatio(uint256 collateralIn, uint256 mintAmount);

    constructor(IERC20 collateral_, IMintable zusd_, address service) {
        collateral = collateral_;
        zusd = zusd_;
        _grantRole(SERVICE_ROLE, service);
    }

    function requestSwap(uint256 amount) external returns (uint256 id) {
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        requests.push(Request(msg.sender, amount, false));
        return requests.length - 1;
    }

    // Fix 1: a hard cap per hour, and never more zUSD out than collateral in.
    function completeSwap(uint256 id, uint256 mintAmount) external onlyRole(SERVICE_ROLE) {
        Request storage r = requests[id];
        require(!r.done, "done");
        if (block.timestamp >= windowStart + WINDOW) {
            windowStart = block.timestamp;
            mintedInWindow = 0;
        }
        uint256 minted = mintedInWindow + mintAmount;
        if (minted > WINDOW_CAP) revert MintCapExceeded(minted, WINDOW_CAP);
        if (mintAmount > r.collateralIn) revert CollateralRatio(r.collateralIn, mintAmount);
        mintedInWindow = minted;
        r.done = true;
        zusd.mint(r.user, mintAmount);
    }
}
