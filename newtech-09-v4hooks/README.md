# Uniswap v4 hooks: five ways a hook gets drained (demo code)

The attacks and fixes from the Zealynx video *Your Uniswap v4 Hook Is a Public Function. 5 Ways
It Gets Drained* ([watch it](https://youtu.be/jgUp4Ukx7mg)).

A v4 hook is a contract the pool calls on every swap, which makes it an entry point. These five
demos show who can call a hook, what `sender` really is, how a custom curve's rounding leaks,
how a public helper can drive a module that holds funds, and what happens when anyone can pick
the pool your contract swaps through.

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545 and deploys **our own
minimal stand-ins**: a pool manager, a router, hooks, a smart wallet, a module, a helper and a
vault. None of it is Uniswap, Safe or any other protocol's code. Tokens are our own test tokens
(tUSDC, tUSD, tGOLD, tRSETH, tETH). Accounts are anvil's public dev keys. Nothing here talks to a
live network or any third-party endpoint.

**How the stand-in differs from v4:** `MiniPoolManager` keys pools by
`PoolKey{currency0, currency1, fee, hooks}`, lets anyone `initialize` a pool with any hook, and
calls `beforeSwap` / `afterSwap` and a return delta around each swap, as v4 does. To stay small it
settles each swap immediately (no `unlock` / flash accounting), uses constant product with no fee,
and reads a hook's callbacks from a `flags()` function instead of from its address bits.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`; developed on 1.7.1).

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-callback.mjs [--fixed]
```

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-callback` | Our rebate hook pays 1% of each swap from a 10,000 tUSDC budget in `afterSwap`. The attacker never swaps; they call `afterSwap` directly with a fake 1,000,000 swap: `0 SWAPS · BUDGET 10,000 → 0` | `onlyPoolManager`: `NotPoolManager()`, budget stays 10,000 |
| `02-sender` | The pool allows alice, bob and carol. The hook checks `sender`, which is the router, so the router must be listed too. The attacker swaps 5,000 tUSDC through it | The hook asks a router it trusts for the real user (`msgSender()`): `NotAllowed(attacker)`; alice still swaps |
| `03-delta` | The curve hook (1 tGOLD = 1,000 tUSD) rounds payouts up. 100 swaps of 0.000001 tUSD in one transaction: `PAID 0.0001 tUSD · TOOK 1.00 tGOLD (1,000 tUSD)` | Payouts round down: same 100 swaps pay 0.00 |
| `04-multicall` | Our wallet's LP module only obeys its keeper helper. The helper's public `multicall` checks the call target, not the caller: `ONE MULTICALL · WALLET 2,900 → 0 tRSETH` | `isKeeper[msg.sender]`: `NotKeeper()`, wallet keeps 2,900 |
| `05-route` | Anyone can trigger the vault's harvest and pick the pool. The attacker creates a pool with their own hook, which takes the whole input: `8,000 tUSDC IN · 0 OUT · THE HOOK KEPT IT` | Hook allowlist + minimum out: `HookNotAllowed(...)`; the allowlisted pool still harvests |

Every number the demos print is read from chain state after the transactions run (balances,
contract storage, revert reasons). The `--fixed` flag only selects which contract is deployed; it
never decides what gets printed.

The real incidents behind these demos (Cork, May 2025; Bunni, September 2025; a Safe with a
custom v4 liquidity module, September 2026) are described in the video's sources. This repo
reproduces the bug classes only. Safe's core contracts were not at fault in that incident.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never
fund them on a real network. The contracts are deliberately vulnerable in places; this is a
teaching harness, not a DEX.
