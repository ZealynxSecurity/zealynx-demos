// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract PerpVault {
    struct Report { uint256 price; uint64 ts; }
    struct Position { uint256 collateral; uint256 size; uint256 entry; }

    uint256 public constant LEVERAGE = 5;
    IERC20 public immutable usdc;
    address public immutable reporter;
    mapping(address => Position) public positions;

    error BadSignature();
    error NoPosition();

    constructor(IERC20 _usdc, address _reporter) { usdc = _usdc; reporter = _reporter; }

    function open(uint256 collateral, Report calldata r, bytes calldata sig) external {
        _verify(r, sig);
        usdc.transferFrom(msg.sender, address(this), collateral);
        positions[msg.sender] = Position(collateral, collateral * LEVERAGE * 1e18 / r.price, r.price);
    }

    function close(Report calldata r, bytes calldata sig) external {
        _verify(r, sig);
        Position memory p = positions[msg.sender];
        if (p.size == 0) revert NoPosition();
        delete positions[msg.sender];
        uint256 value = p.size * r.price / 1e18;
        uint256 cost = p.size * p.entry / 1e18;
        uint256 payout = value >= cost ? p.collateral + (value - cost)
            : (cost - value >= p.collateral ? 0 : p.collateral - (cost - value));
        if (payout > 0) usdc.transfer(msg.sender, payout);
    }

    function _verify(Report calldata r, bytes calldata sig) internal view {
        bytes32 d = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(r.price, r.ts)));
        if (ECDSA.recover(d, sig) != reporter) revert BadSignature();
        _checkTime(r.ts);
    }

    function _checkTime(uint64) internal view virtual {}
}
