# Planted bugs: sealed answer key (Episode 7)

Sealed 2026-10-19, before any Krait run. Do not show this file to the auditor and do not
place it inside `corpus/`.

**Corpus**: `corpus/` (Foundry project, `forge build` passes, solc 0.8.26, OpenZeppelin 5.6.1
remapped from `../../newtech-06-rwa/node_modules`). 20 files, 476 lines. Every contract comes
from the vulnerable side of the Episode 3-6 demos. All comments were stripped (only the SPDX
line is kept) so no header names the bug or the fix. Code is otherwise byte-identical, with one
exception: `MintVuln` was renamed `Mint` (file `Mint.sol`) because the name itself was a hint.

**Total planted bugs: 18.** One row per distinct root cause. Two demos hold two separate
missing checks each and are split into two rows: the replay demo (no "used" marker, and no
chain binding) and the stale-NAV demo (no age check, and no deviation check against the
reference feed).

| ID | File | Function | Bug class | One-line description |
|---|---|---|---|---|
| P01 | src/wallet/Tier.sol | `dailyLimit` / `spend` | Manipulable authorization input | Spend limit jumps 10 → 10,000 if the caller holds any badge NFT, and anyone can send (airdrop) an NFT to any address |
| P02 | src/wallet/Router.sol | `pull` | Missing access control / arbitrary `from` | Anyone can call `pull(from, amount)` and move any approver's tokens to `sink` via `transferFrom` |
| P03 | src/delegate/OpenDelegate.sol | `execute` | Missing access control (EIP-7702 delegate) | `execute` runs arbitrary calls with no caller check; on a delegated EOA, anyone can act as that account |
| P04 | src/delegate/InitDelegate.sol | `initialize` | Unprotected initializer / front-running | The only guard is `!initialized`; whoever calls first becomes `owner` |
| P05 | src/delegate/DelegateA.sol | `setOwner` | Missing access control | Anyone can overwrite `owner` |
| P06 | src/delegate/DelegateB.sol | `guardian` (storage slot 0) | Storage collision on re-delegation | `guardian` sits in slot 0, the same slot `DelegateA.owner` writes, so after re-delegation it reads a value nobody set on B |
| P07 | src/delegate/Mint.sol | `mint` | `tx.origin` used as EOA / rate-limit guard | `tx.origin == msg.sender` is the only limit; a 7702-delegated EOA can call `mint` many times in one tx, and there is no per-address cap |
| P08 | src/bridge/Verifiers.sol | `constructor` | Unbounded verifier threshold (config) | Threshold is not bounded: 0 or 1-of-1 is accepted, so one key (or none) can authorize releases. The episode's attack is a 1-of-1 deployment of `Adapter` |
| P09 | src/bridge/PackedAdapter.sol | `digestOf` / `release` | `abi.encodePacked` hash collision (variable-length fields) | Amount and recipient are both variable-length bytes, packed without lengths; shifting bytes between them keeps the signed digest and changes amount/recipient |
| P10 | src/bridge/ReplayAdapter.sol | `release` | Signature replay (same chain) | No nonce and no "processed" marker; the same signed message pays out again and again |
| P11 | src/bridge/ReplayAdapter.sol | `release` | Cross-chain replay / missing domain separation | The digest is `keccak256(abi.encode(to, amount))`, with no chain id or contract address; one signature is valid on every chain/deployment that shares verifiers |
| P12 | src/bridge/RootBook.sol | `applyBatch` (`_first`) | Validate-first / apply-all on duplicate keys | Only the first `root` entry is checked against the checkpoint, then every entry is applied, so a second `root` entry replaces the trusted root and `claim` pays against it |
| P13 | src/rwa/PerpVault.sol | `_verify` / `_checkTime` | Oracle: no timestamp / freshness check | Signed price reports are accepted regardless of `ts`, including future-dated or old ones; open on one report, close on another to drain LPs |
| P14 | src/rwa/RedemptionVault.sol | `redeem` / `_nav` | Oracle: stale NAV | `feed.updatedAt` is never checked; redemptions pay at an arbitrarily old NAV |
| P15 | src/rwa/RedemptionVault.sol | `_nav` | Oracle: no deviation check | The reference feed `ref` is stored but never read; no cross-check of NAV against an independent source |
| P16 | src/rwa/Wrapper.sol | `wrap` / inherited ERC-20 transfers | Compliance bypass via wrapper | The permissioned token whitelists the wrapper, but the wrapped ERC-20 transfers freely, so unverified wallets end up holding the exposure |
| P17 | src/rwa/RwaToken.sol | `forcedTransfer` / `batchForcedTransfer` | Centralization: single key, no cap, no delay | One agent key can move any holder's balance instantly and without limit; the batch moves every holder in one tx |
| P18 | src/rwa/AsyncRedeem.sol | `settle` / `_settleNav` | Stale-price settlement (async redemption) | A request settles at the NAV of the epoch it was made in, so redeemers who request before a write-down exit at the old price and other holders absorb the loss |

## Excluded from the corpus (and why)

| Episode file | Reason |
|---|---|
| `*Fixed*.sol`, `SelfDelegate.sol`, `RateLimitedAdapter.sol` | Fixed variants |
| `Sweeper.sol` (ep4 #1) | Attacker's phishing delegate; the planted bug (signing a `chainId 0` authorization) is wallet-side, not in contract code |
| `BatchDelegate.sol` (ep4 #5) | Attacker tool used to batch calls; not needed to compile |
| `Pool.sol` (ep4 #2) | Victim contract with no bug of its own; not needed to compile |
| `Badge.sol`, `TestUSDC.sol`, `TestQNT.sol`, ep5 `TestToken.sol` | Test tokens not imported by any corpus contract |
| ep3 attacks #1, #3, #4 | Off-chain (prompt injection, MCP tool poisoning, key exfiltration); no Solidity |

`src/rwa/TestToken.sol` is in the corpus only because `AsyncRedeem` imports it.

## Real issues that are present but NOT planted

Listed before the run so they are not counted as false positives if the auditor reports them.
They do not count as true positives either; they are scored as a separate column.

| File | Function | Issue |
|---|---|---|
| src/rwa/TestToken.sol | `mint` / `burn` | Anyone can mint, and anyone can burn anyone's balance (test harness by design) |
| src/wallet/Tier.sol | `spend` | Despite the name, there is no per-day accounting: the limit applies per call, and any caller can spend Tier's own token balance |
| src/rwa/AsyncRedeem.sol | `strikeNav` | Divides by `shares.totalSupply()` (reverts at zero supply); NAV is read from a raw balance, so a donation moves it |

## Pre-registered caveats about the tool's view of the corpus

From a `--dry-run` of the Krait CLI (no API calls) on 2026-10-19:
- The CLI skipped `src/bridge/Verifiers.sol` as an "abstract base (no function bodies)" (it has
  a body: `_checkSigs`). P08 can still be found through `Adapter`'s constructor, but its file is
  not analyzed directly.
- `src/rwa/TestToken.sol` was not picked up (19 of 20 files).
- With the default `--min-lines 20`, most corpus files would be skipped; the run must pass
  `--min-lines 1`.
