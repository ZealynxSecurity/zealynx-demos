// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// zUSD, VULNERABLE ON PURPOSE. A UUPS stablecoin with four of the five mistakes
/// from the video (the fifth, the uncapped minter, is in Minter.sol). Teaching code only.
contract ZUSD is ERC20Upgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    address public reserveFeed;
    mapping(address => bool) public frozen;

    error AccountFrozen(address account);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address feed, address minter) external initializer {
        __ERC20_init("zUSD", "zUSD");
        __AccessControl_init();
        reserveFeed = feed;
        _grantRole(DEFAULT_ADMIN_ROLE, admin); // one EOA holds every power
        _grantRole(FREEZER_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Mistake 2: nothing compares supply with the attested reserve.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function freeze(address account) external onlyRole(FREEZER_ROLE) {
        frozen[account] = true;
    }

    // Mistake 3: the freeze is checked in transfer() only. transferFrom() skips it.
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (frozen[msg.sender]) revert AccountFrozen(msg.sender);
        return super.transfer(to, amount);
    }

    // Mistake 4: one admin key can move anyone's balance to any address.
    function seize(address from, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _transfer(from, to, balanceOf(from));
    }

    // Mistake 5: the same admin EOA can swap in any implementation, instantly.
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}

/// The implementation an attacker upgrades to: zUSD plus a mint anyone can call.
contract EvilZUSD is ZUSD {
    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
