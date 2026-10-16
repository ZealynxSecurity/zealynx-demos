// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IReserveFeed {
    function reserve() external view returns (uint256);
    function updatedAt() external view returns (uint256);
}

/// zUSD with the fixes. Admin, enforcement and upgrades sit behind a 24-hour
/// TimelockController run by a multisig; no single EOA holds those roles.
contract ZUSDFixed is ERC20Upgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant ENFORCER_ROLE = keccak256("ENFORCER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint256 public constant MAX_AGE = 1 days;

    IReserveFeed public reserveFeed;
    mapping(address => bool) public frozen;

    error AccountFrozen(address account);
    error ReserveExceeded(uint256 supply, uint256 reserve);
    error StaleReserve(uint256 updatedAt);

    constructor() {
        _disableInitializers();
    }

    function initialize(address timelock, address feed, address minter, address freezer) external initializer {
        __ERC20_init("zUSD", "zUSD");
        __AccessControl_init();
        reserveFeed = IReserveFeed(feed);
        _grantRole(DEFAULT_ADMIN_ROLE, timelock);
        _grantRole(ENFORCER_ROLE, timelock);
        _grantRole(UPGRADER_ROLE, timelock);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(MINTER_ROLE, minter);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Fix 2: supply can never pass the attested reserve, and the attestation must be fresh.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 updatedAt = reserveFeed.updatedAt();
        if (updatedAt < block.timestamp - MAX_AGE) revert StaleReserve(updatedAt);
        uint256 supply = totalSupply() + amount;
        uint256 reserve = reserveFeed.reserve();
        if (supply > reserve) revert ReserveExceeded(supply, reserve);
        _mint(to, amount);
    }

    function freeze(address account) external onlyRole(FREEZER_ROLE) {
        frozen[account] = true;
    }

    // Fix 3: transfer, transferFrom and mint all run through _update. Burns stay open for seize.
    function _update(address from, address to, uint256 amount) internal override {
        if (frozen[from] && to != address(0)) revert AccountFrozen(from);
        if (frozen[to]) revert AccountFrozen(to);
        super._update(from, to, amount);
    }

    // Fix 4: seize only burns, and only the timelock holds ENFORCER_ROLE.
    function seize(address from) external onlyRole(ENFORCER_ROLE) {
        _burn(from, balanceOf(from));
    }

    // Fix 5: only the timelock holds UPGRADER_ROLE.
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
