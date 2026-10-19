# GENIUS Act to code: five ways a stablecoin contract fails (demo code)

The attacks and fixes from the Zealynx video *GENIUS Act to Code: 5 Things Your Stablecoin Contract Must Get
Right* ([watch it](https://youtu.be/PMuN-22EFZM)).

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545, deploys our own contracts and
uses test tokens. Nothing here talks to a live network, a real stablecoin or a third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`). OpenZeppelin v5 comes from npm.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-mint.mjs [--fixed]
```

The stack: **zUSD**, our own 6-decimal UUPS stablecoin (OpenZeppelin v5 upgradeable), **tUSDC** test
collateral, a mock proof-of-reserve feed, and a two-step minter (`requestSwap` / `completeSwap`).
The fixed runs put admin, enforcement and upgrades behind a 24-hour `TimelockController`.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-mint` | The Resolv pattern: deposit 100,000 tUSDC, one leaked service key completes the swap for 80,000,000 zUSD | `MintCapExceeded` (1,000,000 zUSD/hour) and `CollateralRatio` (mint ≤ collateral in) both revert; only the 1:1 mint goes through |
| `02-reserves` | Mint pushes supply to 1,200,000 zUSD against an attested reserve of $1,000,000 (120%) | `ReserveExceeded(supply 1,200,000 > reserve 1,000,000)`; a 3-day-old attestation reverts `StaleReserve` |
| `03-freeze` | The freeze is checked in `transfer` only: the frozen holder's approved spender moves 50,000 zUSD with `transferFrom` | The check lives in OpenZeppelin v5's `_update`: both paths revert `AccountFrozen` |
| `04-seize` | One admin key calls `seize(victim, attacker)` and moves 2,000,000 zUSD | `seize` only burns, `ENFORCER_ROLE` is a 24h timelock: the admin key reverts, executing early reverts, after 24h the balance is burned and nothing reaches the attacker |
| `05-upgrade` | The admin EOA upgrades to an implementation with `mintTo` and mints 1e30 units | `_authorizeUpgrade` needs `UPGRADER_ROLE`, held only by the timelock: the EOA upgrade reverts |

| File | What it is |
|---|---|
| `contracts/src/ZUSD.sol` | zUSD, vulnerable on purpose (mistakes 2 to 5), plus `EvilZUSD`, the attacker's implementation |
| `contracts/src/ZUSDFixed.sol` | zUSD with the fixes |
| `contracts/src/Minter.sol` | `Minter` (vulnerable on purpose, mistake 1) and `MinterFixed` |
| `contracts/src/MockReserveFeed.sol`, `TestUSDC.sol` | the mock reserve attestation and the test collateral |

Every number the demos print is read from the chain after the transactions run. Time jumps (3 days,
24 hours) use anvil's `evm_increaseTime`.

The code is deliberately vulnerable in places; it's a teaching harness, not a stablecoin.

The private keys in `lib/chain.mjs` are anvil's public default dev keys. Never fund them on a real network.
