// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Router {
    IERC20 public immutable token;
    address public immutable sink;

    constructor(address _token, address _sink) {
        token = IERC20(_token);
        sink = _sink;
    }

    function pull(address from, uint256 amount) external {
        token.transferFrom(from, sink, amount);
    }
}
