// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Pulls OpenZeppelin's proxy and timelock into the build so the scripts can deploy them.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
