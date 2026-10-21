# Tokenised RWAs: five bugs we'd flag before you ship (demo code)

The attacks and fixes from the Zealynx video *Tokenised RWAs: 5 Bugs We'd Flag Before You Ship*
([watch it](https://youtu.be/3f94XmZDMxM)).

A tokenised fund, bond or T-bill is a smart contract that takes its truth from off-chain feeds:
a price, a NAV, a list of who passed KYC, and an agent who can move tokens by force. Each of these
five demos breaks one of those links, then shows the small on-chain check that holds it.

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545, deploys our own
**simplified stand-ins** (an ERC-3643-style permissioned token, an identity registry, a signed
price feed, a NAV feed, a perp vault, a redemption vault and an async redemption queue) and test
tokens, and signs with anvil's public dev keys. None of it is real ERC-3643 / T-REX, oracle or
fund code. Nothing here talks to a live network, a real wallet or any third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`; developed on 1.7.1).
OpenZeppelin v5 and viem come from npm.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-future.mjs [--fixed]
```

Each demo writes a cast to `casts/<id>.raw.json` for the video renderer. The ten ids are
`future`, `future-fixed`, `stalenav`, `stalenav-fixed`, `wrapper`, `wrapper-fixed`, `agent`,
`agent-fixed`, `async`, `async-fixed`.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-future` | The perp vault checks the feed's signature but not the timestamp. A report dated +2h prices BTC at $5,000 (true $62,000); the attacker opens a 5x long on it and closes on a fresh $62,000 report: `VAULT -23.75% · ATTACKER +57,000 tUSDC` | `if (ts > block.timestamp \|\| block.timestamp - ts > MAX_AGE) revert FutureReport()`: `VAULT UNCHANGED · 240,000 tUSDC` |
| `02-stalenav` | The NAV feed last posted $1.00 three days ago; the reference NAV is $0.92. Redeeming 1,000,000 shares pays 1,000,000: `OVERPAID 80,000 tUSDC (+8.70%)` | NAV must be ≤ 1 day old and within 2% of the reference, else `StaleNAV`: `NOTHING PAID · shares kept 1,000,000` |
| `03-wrapper` | The token's compliance blocks the transfer (`canTransfer(alice → mallory): false`), but the whitelisted wrapper's ERC-20 asks nobody: `canTransfer: false · YET HOLDS 50,000 WRAPPED` | The wrapper's `_update` calls `token.canTransfer(from, to)`, else `NotEligible`: `BLOCKED · MALLORY HOLDS 0` |
| `04-agent` | One stolen agent key calls `batchForcedTransfer` and moves all 12 holders' balances in one tx: `1 TX · 12 HOLDERS → 0 · 1,200,000 TAKEN` | Same key, same call: reverts `OverCap` (1,000 per operation); a capped call is only queued for 48h with an event: `12 HOLDERS KEEP THEIR BALANCES · 1 OP QUEUED` |
| `05-async` | A redemption requested at NAV $1.00 settles at $1.00 after an 8% loss is struck: `REDEEMER +80,000 · OTHERS -80,000` | Settles at `navAt(req.epoch + 1)`, the first NAV after the request: `PAID AT $0.92 · OTHERS LOSE 0` |

| File | What it is |
|---|---|
| `contracts/src/TestToken.sol` | 18-decimal test token: tUSDC and plain fund shares (tFUND) |
| `contracts/src/IdentityRegistry.sol` | stand-in identity registry: which wallets passed KYC |
| `contracts/src/RwaToken.sol` | stand-in ERC-3643-style token: compliance on transfers; attack #4's single-key `forcedTransfer` |
| `contracts/src/RwaTokenFixed.sol` | attack #4 fix: per-operation cap, 48h queue, `ForcedTransferQueued` event, guardian cancel |
| `contracts/src/PerpVault.sol`, `PerpVaultFixed.sol` | attack #1: signed reports with no time check vs `FutureReport` |
| `contracts/src/NavFeed.sol` | stand-in NAV feed (the fund's feed and an independent reference) |
| `contracts/src/RedemptionVault.sol`, `RedemptionVaultFixed.sol` | attack #2: blind NAV vs staleness + deviation checks (`StaleNAV`) |
| `contracts/src/Wrapper.sol`, `WrapperFixed.sol` | attack #3: compliance-free wrapped token vs compliance on every wrapped transfer |
| `contracts/src/AsyncRedeem.sol`, `AsyncRedeemFixed.sol` | attack #5: settle at request-epoch NAV vs `navAt(req.epoch + 1)` |
| `lib/chain.mjs` | spawns anvil, deploys, signs price reports, moves the local clock |
| `lib/term.mjs` | terminal output + cast recording (shared with the other New Tech demos) |

Every number the demos print is read from chain state after the transactions run: balances,
storage (`positions`, `ops`, `navAt`), events (`ForcedTransferQueued`) and revert reasons. The
`--fixed` flag only selects which contract (and its configuration) is deployed; it never decides
what gets printed.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never
fund them on a real network. The contracts are deliberately vulnerable in places; this is a
teaching harness, not fund infrastructure.
