// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// A "badge" NFT. Anyone can airdrop one to any address: that is the whole point of
/// attack #2 — a permission that grows from what lands in the wallet, not from the owner.
contract Badge is ERC721 {
    uint256 public nextId;

    constructor() ERC721("Agent Badge", "BADGE") {}

    function airdrop(address to) external returns (uint256 id) {
        id = nextId++;
        _mint(to, id);
    }
}
