// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20 { function transferFrom(address, address, uint256) external returns (bool); }

/// The 402bridge pattern, rebuilt for the demo (vulnerable on purpose).
/// Users approve this contract; a single owner key, kept on a web server, can
/// move any approved user's tokens. Leak the key and every approval is exposed.
contract PayBridge {
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// The function the 402bridge attacker used: owner moves a user's approved tokens.
    function transferUserToken(address token, address from, address to, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(from, to, amount);
    }
}

/// The fix: there is no owner path to user funds at all. A user can only pay
/// for themselves, and only the exact amount they sign for each call.
contract PayBridgeFixed {
    function pay(address token, address to, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, to, amount);
    }
}
