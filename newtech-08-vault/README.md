# Lending vaults: five ways to bad debt (demo code)

The attacks and fixes from the Zealynx video *Your Vault Prices Collateral at $1. Here's the Day
That Breaks It* ([watch it](VIDEO_URL)).

A lending vault is only as safe as the price it believes for its collateral, and how much of that
collateral it lets in. These five demos show a market that believes the wrong price, lets in too
much of a thin token, lets anyone inflate its exchange rate, keeps lending through a depeg, and a
vault whose curator can move money in one block.

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545 and deploys **our own
minimal stand-ins** (a Compound-style market, a constant-product pool, a settable oracle and a
curator vault, not any real protocol's code) with test tokens (tUSDC, tUSDX, THIN). Accounts are
anvil's public dev keys. Nothing here talks to a live network or any third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`; developed on 1.7.1).
OpenZeppelin v5 comes from npm.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-depeg.mjs [--fixed]
```

Each demo writes a cast to `casts/<id>.raw.json` for the video renderer. The ten ids are `depeg`,
`depeg-fixed`, `cap`, `cap-fixed`, `donation`, `donation-fixed`, `breaker`, `breaker-fixed`,
`curator`, `curator-fixed`.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-depeg` | The market prices tUSDX at a hardcoded $1.00. We crash it to $0.10 on our pool; a borrower posts 1,125,000 tUSDX (worth $112,500 at the pool) and borrows 80% of the oracle value: `POSTED $112,500 · TOOK 900,000 tUSDC` | The reference price is checked against the pool's live price; more than 2% apart reverts `price deviation`: `REVERTED · lenders keep 1,000,000 tUSDC` |
| `02-cap` | THIN has $1.3M of liquidity on our pool, and the market prices it from that pool. The attacker donates 650,000 tUSDC to the pool, then loops buy → supply → borrow. Six loops take all 120,000,000 of lender cash against collateral that would sell for about 21.4M: `$1,300,000 OF LIQUIDITY · 120,000,000 BORROWED` | A supply cap of 500,000 THIN: loop 5 reverts `supply cap`: `CAP 500,000 THIN · LOOP REVERTED · BORROWED 4,890,773` |
| `03-donation` | The share exchange rate is the market's token balance over total shares. One plain transfer of 39,000 THIN: `ONE TRANSFER · RATE 1.0 → 40.0` | The rate uses cash the market tracked on supply, not `balanceOf`: `SAME TRANSFER · RATE STAYS 1.0` |
| `04-breaker` | The oracle tracks the market. At $0.96 (4% off peg) the market still lends 768,000; the peg breaks to $0.128 and liquidation recovers 128,000: `BAD DEBT 640,000 tUSDC · LENDERS CARRY IT` | New borrows stop when the price is more than 3% off peg, `borrow paused: depeg`: `BORROWING PAUSED · BAD DEBT 0` |
| `05-curator` | The curator raises a market cap 1M → 50M and allocates 50M; both transactions land in the same block: `CAP RAISED AND 50,000,000 MOVED · SAME BLOCK` | A cap increase waits 3 days (`pendingCap`); the allocation reverts `above cap`: `PENDING 3 DAYS · 0 MOVED · DEPOSITORS CAN LEAVE` |

| File | What it is |
|---|---|
| `contracts/src/TestToken.sol` | open-mint test tokens (tUSDC, tUSDX, THIN, 18 decimals) |
| `contracts/src/MockAMM.sol` | our constant-product pool; `sync()` makes a direct transfer move the price |
| `contracts/src/PriceFeed.sol` | `PriceFeed` (a price the owner sets: hardcoded if never updated, market-tracking if a keeper updates it) and `SpotOracle` (reads the pool) |
| `contracts/src/LendingMarket.sol` | the base market: lenders deposit tUSDC, borrowers supply collateral and borrow up to 80% |
| `contracts/src/DepegGuardMarket.sol` | fix #1: deviation check against a live market price |
| `contracts/src/CappedMarket.sol` | fix #2: supply cap |
| `contracts/src/TrackedCashMarket.sol` | fix #3: exchange rate from tracked cash |
| `contracts/src/BreakerMarket.sol` | fix #4: depeg circuit breaker on new borrows |
| `contracts/src/CuratorVault.sol`, `TimelockedVault.sol` | attack #5 and its fix: immediate caps vs a 3-day timelock on increases |
| `lib/chain.mjs` | spawns anvil, deploys, funds test accounts |
| `lib/term.mjs` | terminal output + cast recording (shared with the other New Tech demos) |

Every number the demos print is read from chain state after the transactions run (balances, the
market's and vault's own storage, revert reasons, block numbers). The `--fixed` flag only selects
which contract is deployed; it never decides what gets printed.

The real incidents behind these demos (fixed-price oracles around the Nov 2025 xUSD collapse; the
Aug 2026 thin-collateral loop on Cronos) are described in the video's sources. This repo
reproduces the bug classes only. It is not a model of any real protocol.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never
fund them on a real network. The contracts are deliberately vulnerable in places; this is a
teaching harness, not a lending market.
