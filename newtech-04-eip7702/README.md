# EIP-7702 delegates: five bugs we'd flag before you ship (demo code)

The attacks and fixes from the Zealynx video *EIP-7702: 5 Bugs We'd Flag Before You Ship a
Delegate Contract* ([watch it](https://youtu.be/WSfZsNG21rg)).

EIP-7702 lets an EOA temporarily run a contract's code by signing an *authorization*. That
breaks two old assumptions at once: "an EOA has no code" and "tx.origin == msg.sender means a
plain wallet". These five demos show what goes wrong, and the one real check that stops each one.

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545 with the **Prague
hardfork** (so EIP-7702 type-4 transactions work), deploys our own delegate contracts and a test
token, and signs authorizations with anvil's public dev keys. Nothing here talks to a live
network, a real wallet or any third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) at a version with Prague / EIP-7702 support
(`anvil`, `forge` ≥ 1.0; developed on 1.7.1). OpenZeppelin v5 comes from npm. EIP-7702 is driven
with viem's `signAuthorization` / `authorizationList`.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-sweeper.mjs [--fixed]
```

Each demo writes a cast to `casts/<id>.raw.json` for the video renderer. The ten ids are
`sweeper`, `sweeper-fixed`, `execute`, `execute-fixed`, `initfront`, `initfront-fixed`,
`collision`, `collision-fixed`, `origin`, `origin-fixed`.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-sweeper` | The victim signs a 7702 authorization with `chainId 0` (valid on every chain) delegating to our sweeper; three 1 ETH deposits are forwarded to the attacker: `balance 0.0 · swept 3.0 ETH` | A wallet-side policy refuses to sign: `REFUSED: delegate not on allowlist (chainId 0)` — the deposits stay put |
| `02-execute` | An admin EOA delegated to a delegate with an open `execute()` (the QNT / IPOR pattern); anyone calls `admin.execute([...])` and drains the admin-only pool: `pool 1,988.5 → 0 tQNT` | `execute()` requires `msg.sender == address(this)`; the attacker's call reverts `Unauthorized`: `POOL SAFE: 1,988.5 tQNT` |
| `03-initfront` | A delegate needs `initialize(owner)`; an attacker front-runs the setup and takes ownership: `owner = <attacker>` | `initialize` is bound to a signature from the account itself (`ECDSA.recover(initHash, sig) == address(this)`); the attacker's init reverts `init sig` and the real owner stands |
| `04-collision` | Delegate A wrote `owner` to slot 0; after re-delegating to delegate B, B's `guardian` (also slot 0) reads A's value back: `GUARDIAN = <attacker> (left by A)` | B keeps `guardian` in an ERC-7201 namespaced slot A never wrote: `GUARDIAN = 0x0000…0000 (clean)` |
| `05-origin` | A mint limited "one per call" via `require(tx.origin == msg.sender)`; a delegated EOA batches 50 mints into one self-sent transaction: `50 MINTED IN 1 TX` | A per-address limit (`require(minted[msg.sender]++ < LIMIT)`) holds regardless of batching: `1 MINTED, 49 REVERTED` |

| File | What it is |
|---|---|
| `contracts/src/TestQNT.sol` | an 18-decimal test token (tQNT) standing in for QNT |
| `contracts/src/Sweeper.sol` | attack #1: a phishing delegate whose `receive()` forwards every deposit to a fixed sink |
| `contracts/src/Pool.sol` | attack #2: an admin-gated pool — the thing the open `execute()` drains |
| `contracts/src/OpenDelegate.sol`, `SelfDelegate.sol` | attack #2: `execute()` with no access control vs `msg.sender == address(this)` |
| `contracts/src/InitDelegate.sol`, `InitDelegateFixed.sol` | attack #3: unprotected `initialize` vs init bound to the account's signature |
| `contracts/src/DelegateA.sol`, `DelegateB.sol`, `DelegateBFixed.sol` | attack #4: `owner`/`guardian` colliding on slot 0 vs ERC-7201 namespaced storage |
| `contracts/src/MintVuln.sol`, `MintFixed.sol` | attack #5: the `tx.origin` guard vs a per-address limit |
| `contracts/src/BatchDelegate.sol` | attack #5: the delegate an EOA uses to batch many `mint()` calls into one tx |
| `lib/chain.mjs` | spawns anvil (`--hardfork prague`), deploys, and installs 7702 delegations |
| `lib/wallet-policy.mjs` | attack #1 fix: the wallet-side policy that refuses `chainId 0` / non-allowlisted delegates |
| `lib/term.mjs` | terminal output + cast recording (shared with the other New Tech demos) |

Every number the demos print is read from chain state after the transactions run. The fixes are
real on-chain checks that execute (`msg.sender == address(this)`, `ECDSA.recover`, an ERC-7201
slot, a per-address counter) — except attack #1, whose fix is wallet-side: the policy in
`lib/wallet-policy.mjs` actually runs and refuses to sign. The `--fixed` flag only selects which
delegate or token is deployed; it never decides what gets printed.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never
fund them on a real network. The contracts are deliberately vulnerable in places; this is a
teaching harness, not a wallet.
