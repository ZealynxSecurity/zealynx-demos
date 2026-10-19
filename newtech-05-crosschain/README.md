# Cross-chain messages: five checks before launch (demo code)

The attacks and fixes from the Zealynx video *A $292M Bridge Hack Came Down to One Verifier. 5
Checks Before Launch* ([watch it](VIDEO_URL)).

When your app acts on a message from another chain, it can't see that chain. It sees signatures
over bytes. These five demos show what goes wrong with who signs, what bytes they sign, and how
often those bytes can be used, plus the limit that caps the damage when something else fails.

**Local only:** every demo starts its own `anvil` chain(s) on 127.0.0.1 (chain B on :8545, chain
C on :8546), deploys **our own stand-in adapter** (not real bridge or messaging-protocol code) and
test tokens, and signs as "verifiers" with anvil's public dev keys. Nothing here talks to a live
network, a real bridge, a real verifier network or any third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`; developed on 1.7.1).
OpenZeppelin v5 comes from npm.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-onev.mjs [--fixed]
```

Each demo writes a cast to `casts/<id>.raw.json` for the video renderer. The ten ids are `onev`,
`onev-fixed`, `packed`, `packed-fixed`, `replay`, `replay-fixed`, `dupe`, `dupe-fixed`,
`ratelimit`, `ratelimit-fixed`.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-onev` | The adapter requires 1 of 1 verifiers. We hold that verifier's key and sign a message chain A never sent: `FORGED MESSAGE PAID 116,500 tRSETH` | 2 of 3 independent verifiers; the one signature reverts `not enough verifiers`: `NOTHING RELEASED · adapter keeps 650,000` |
| `02-packed` | Amount and recipient arrive as raw variable-length bytes and are hashed with `abi.encodePacked`. A properly signed request for 3,110 tokens is replayed with two bytes moved from the recipient into the amount; the hash is identical: `SIGNED FOR 3,110 · PAID 203,816,960` | The same fields hashed with `abi.encode` (each carries its length): the forged split recovers a non-verifier, `not a verifier`: `FORGERY REJECTED · paid 0` |
| `03-replay` | The signed message carries only recipient and amount. One 5,000 transfer is paid on chain B, again on chain B, and on chain C: `SENT 5,000 · RECEIVED 15,000` | Source chain, destination chain and nonce are signed, and the message is marked processed: `already processed` on B, `not a verifier` on C: `SENT 5,000 · received 5,000` |
| `04-dupe` | A signed batch of key/value updates carries `root` twice. The adapter checks the first against the checkpoint, then applies every entry, so the second becomes the trusted root and the attacker claims against it: `ROOT REWRITTEN · attacker took 80,000` | A key that appears twice rejects the batch before anything is applied, `duplicate key`; the claim reverts `not in root`: `ROOT INTACT · attacker took 0` |
| `05-ratelimit` | Assume a forged message gets through (1-of-1 verifiers). It empties the adapter in one call: `ONE CALL · ADAPTER EMPTIED` | The same weak verifier set plus a per-route limit of 1,000 per hour; the excess is held and the route pauses: `1,000 OUT · 115,500 STAYS` |

| File | What it is |
|---|---|
| `contracts/src/TestToken.sol` | test tokens standing in for the bridged asset (tRSETH, 18 decimals; tNIGHT, whole units) |
| `contracts/src/Verifiers.sol` | the shared verifier check: distinct, registered signers, in ascending order, counted against a threshold |
| `contracts/src/Adapter.sol` | the "correct" stand-in adapter (abi.encode, chain binding, nonce, processed): attack #1 varies only its verifier configuration |
| `contracts/src/PackedAdapter.sol`, `PackedAdapterFixed.sol` | attack #2: `abi.encodePacked` over variable-length fields vs `abi.encode` |
| `contracts/src/ReplayAdapter.sol`, `ReplayAdapterFixed.sol` | attack #3: an unbound message vs source, destination, nonce and a processed flag |
| `contracts/src/RootBook.sol`, `RootBookFixed.sol` | attack #4: validate-first-apply-all vs reject duplicate keys before applying |
| `contracts/src/RateLimitedAdapter.sol` | attack #5 fix: the same adapter with a per-route hourly outflow limit and an automatic pause |
| `lib/chain.mjs` | spawns anvil chains, deploys, signs digests as the verifiers |
| `lib/term.mjs` | terminal output + cast recording (shared with the other New Tech demos) |

Every number the demos print is read from chain state after the transactions run (balances, the
adapter's own storage, revert reasons). The `--fixed` flag only selects which adapter or verifier
configuration is deployed; it never decides what gets printed.

The real incidents behind these demos (April 2026, a 1-of-1 verifier configuration; July 2026,
packed variable-length fields) involved specific protocols and configurations that are described
in the video's sources. This repo reproduces the bug classes only. It is not a model of any
real bridge, and it says nothing about who was at fault.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never
fund them on a real network. The contracts are deliberately vulnerable in places; this is a
teaching harness, not a bridge.
