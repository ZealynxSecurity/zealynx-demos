# Krait Security Audit Report

**Target**: corpus (RWA + bridge + EIP-7702 delegate + wallet sub-systems)
**Date**: 2026-10-19
**Auditor**: Krait by Zealynx Security
**Scope**: `src/` — 20 Solidity files, 476 LOC (Solidity 0.8.26)

---

## Executive Summary

This codebase bundles four independent sub-systems — a permissioned RWA token with
redemption/perp vaults, a set of multisig-verified bridge adapters, EIP-7702-style delegate
accounts, and a spending wallet/router. The dominant risk themes are **unauthenticated
value-moving entrypoints** and **missing replay/staleness binding on signed messages**.
Three Critical issues allow outright draining (an auth-free universal executor, replay of
signed price reports, and a bridge release with no replay guard); three High issues add a
hash-collision payout inflation, an access-control-free wallet drain, and an arbitrary-`from`
token pull. Five Medium issues cover RWA compliance bypasses and NAV mispricing. Overall risk:
**severe** — multiple permissionless paths to total loss of custodied funds.

**Finding Summary**:
| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 3 |
| Medium | 5 |
| Low | 4 |

All findings are `REASONED — code trace [CODE-TRACE]` (no PoC pass was run; an opt-in
`krait-poc` pass can mechanically confirm the Criticals).

---

## Findings

### [KRAIT-001] Unauthenticated arbitrary executor drains any 7702-delegated account — CRITICAL

**File**: `src/delegate/OpenDelegate.sol:7-12`
**Category**: access-control / EIP-7702
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `execute(Call[] calldata calls)` is `external payable` and loops
`calls[i].to.call{value: calls[i].value}(calls[i].data)` with **no caller authorization**.
In the `delegate/` (EIP-7702) context an EOA sets its code to this contract, so `address(this)`
is the EOA and `execute` runs with the account's full balance and token approvals.

**Impact**: Any address can invoke `execute` on a delegated account and perform arbitrary
calls — transfer out every token, move all ETH, grant approvals. Complete, unconditional
account takeover.

**Proof of Concept**:
```
1. Victim EOA designates OpenDelegate as its 7702 code.
2. Attacker calls victim.execute([
     {to: USDC, value: 0, data: transfer(attacker, USDC.balanceOf(victim))},
     {to: attacker, value: victim.balance, data: ""}
   ])
3. Both calls execute from the victim account → all funds leave.
```

**Root Cause**: A universal execute entrypoint with no owner/`msg.sender` check.

**Recommendation**: Gate `execute` on the account owner. For 7702, require
`msg.sender == address(this)` (self-call via a validated signature) or an ECDSA auth over the
call batch with a nonce:
```solidity
function execute(Call[] calldata calls) external payable {
    require(msg.sender == address(this), "only self");
    ...
}
```

---

### [KRAIT-002] PerpVault price reports are replayable (empty `_checkTime`, no nonce) — CRITICAL

**File**: `src/rwa/PerpVault.sol:22-46`
**Category**: signature-replay / oracle-staleness
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `_verify` authenticates a `Report{price, ts}` only by
`ECDSA.recover(keccak256(abi.encode(r.price, r.ts))) == reporter`, then calls
`_checkTime(r.ts)` — an **empty `virtual` no-op** in the deployed base contract. There is no
freshness check, no nonce, and no binding to `msg.sender` or to the open/close action. Every
report the reporter has ever signed is visible in public calldata and can be reused by anyone.

**Impact**: An attacker opens a position at a stale low price and closes it at a stale high
price, extracting other traders' collateral from the vault.

**Proof of Concept**:
```
Reporter has (over time) signed P_low and P_high.
1. open(C, {price: P_low}, sig_low):  size = C * 5 * 1e18 / P_low   (large)
2. close({price: P_high}, sig_high):  value = size*P_high/1e18 ; cost = size*P_low/1e18
   payout = C + (value - cost) ≈ C * 5 * (P_high - P_low) / P_low
3. payout >> C; the excess is paid from other users' collateral. Repeat to drain.
```

**Root Cause**: Report authentication omits timestamp/nonce validation; `_checkTime` is never
implemented in the concrete contract.

**Recommendation**: Enforce freshness and single-use in the base: require
`block.timestamp - r.ts <= MAX_AGE`, bind a per-user `nonce` into the signed payload, and mark
consumed report digests. Do not ship an empty security-critical `virtual` hook on a deployable
contract.

---

### [KRAIT-003] ReplayAdapter releases with no replay protection — CRITICAL

**File**: `src/bridge/ReplayAdapter.sol:13-17`
**Category**: cross-chain-bridge / replay
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `release(to, amount, sigs)` computes `digest = keccak256(abi.encode(to, amount))`,
checks verifier signatures, and transfers — but records **no `processed` state**, and the digest
contains **no nonce and no `chainid`**. The sibling `Adapter.sol` (lines 17-21) guards with a
`processed[digest]` mapping; this adapter omits it.

**Impact**: Any caller replays a single validly-signed release arbitrarily many times, sending
N× the signed amount out of the adapter and draining its token balance. The message is also
replayable on any other chain the same verifier set secures.

**Proof of Concept**:
```
1. A legitimate release(to, amount, sigs) executes once.
2. Attacker calls release(to, amount, sigs) again — same sigs still valid, no guard.
3. Repeat until token.balanceOf(adapter) == 0.
```

**Root Cause**: Missing replay guard / nonce / chain-id binding.

**Recommendation**: Add a `mapping(bytes32 => bool) processed`, include a unique `nonce` and
`block.chainid` in the signed digest, and set `processed[digest] = true` before transferring
(mirroring `Adapter.sol`).

---

### [KRAIT-004] PackedAdapter digest collision inflates payout — HIGH

**File**: `src/bridge/PackedAdapter.sol:14-24`
**Category**: cross-chain-bridge / hash-collision
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `digestOf` hashes `abi.encodePacked(block.chainid, nonce, amount, recipient)`
where `amount` and `recipient` are both dynamic `bytes` with no length delimiter. Adjacent
variable-length arguments in `encodePacked` make the amount/recipient boundary ambiguous, so
distinct `(amount, recipient)` pairs can produce the same digest (and therefore the same valid
signatures).

**Impact**: Given one legitimately-signed release whose recipient is encoded as a 32-byte
left-padded address (the natural encoding), an attacker front-runs it with a re-split that
keeps the same bytes but moves the 12 zero-padding bytes into `amount`, yielding
`_toUint(amount) = A · 2^96` to the same address — a massive over-payment — while `processed`
then blocks the honest release.

**Proof of Concept**:
```
Signed: amount = A (e.g. 0x01f4), recipient = 0x0000..0000||addr  (32 bytes)
Packed tail = A || 0x0..0(12) || addr(20)
Attacker submits: amount' = A || 0x0..0(12)  (=> value A*2^96), recipient' = addr (20 bytes)
Same concatenation => same digest => same sigs valid => adapter pays A*2^96 to addr.
```

**Root Cause**: `abi.encodePacked` over two adjacent dynamic arguments.

**Recommendation**: Use `abi.encode` (length-prefixed) instead of `encodePacked`, or hash
fixed-width fields (`uint256 amount`, `address recipient`) rather than raw `bytes`.

---

### [KRAIT-005] Tier.spend has no access control and no real daily limit — HIGH

**File**: `src/wallet/Tier.sol:25-29`
**Category**: access-control
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `spend(to, amount)` transfers the **contract's own** tokens but has no
owner/caller check. `dailyLimit(msg.sender)` returns `BASE = 10e6` for any caller without the
badge NFT. There is no timestamp or cumulative-spend storage, so the "daily limit" is only a
per-call cap, not a per-day budget.

**Impact**: Anyone drains the Tier wallet in 10e6 increments by calling `spend` in a loop; even
an authorized spender can exceed the intended daily budget with repeated calls.

**Proof of Concept**:
```
while (token.balanceOf(tier) > 0):
    tier.spend(attacker, min(10e6, balance))   // no auth, no per-day accounting
```

**Root Cause**: Missing authorization + absent daily-window accounting (no `spent`/`lastReset`
state keyed by day).

**Recommendation**: Restrict `spend` to the wallet owner/authorized agents, and track
cumulative spend within a rolling 24h window (`spentToday[agent]`, `windowStart`) enforced
against `dailyLimit`.

---

### [KRAIT-006] Router.pull uses an arbitrary `from` in transferFrom — HIGH

**File**: `src/wallet/Router.sol:15-17`
**Category**: access-control / arbitrary-transfer
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `pull(address from, uint256 amount)` calls `token.transferFrom(from, sink, amount)`
with `from` an unbound parameter and no `from == msg.sender` or authorization check.

**Impact**: Any third party can move any user's Router-approved tokens to `sink` at a time of
the attacker's choosing. `sink` is immutable so the attacker does not self-profit, but every
approver loses custody/timing control of their funds (and if `sink` is a one-way pool or bridge,
loses the funds outright).

**Proof of Concept**:
```
1. Alice approves Router (its intended use) for 1000 tokens.
2. Attacker (anyone) calls Router.pull(Alice, 1000) → Alice's 1000 tokens are sent to sink.
```

**Root Cause**: `from` not constrained to `msg.sender`.

**Recommendation**: Set `from = msg.sender` (pull only from the caller), or require explicit
per-pull authorization (signature / allowance ledger) from `from`.

---

### [KRAIT-007] RwaToken transfer check ignores the sender — MEDIUM

**File**: `src/rwa/RwaToken.sol:17-28`
**Category**: eip-standard-compliance / access-control
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `canTransfer(address, address to)` validates only `registry.isVerified(to)`;
the `from` argument is unused. An ERC-3643-style permissioned token must verify both parties.

**Impact**: A holder whose verification is later revoked (`isVerified(from) == false`) is never
blocked and can still transfer tokens to any verified address — defeating the compliance freeze
that the IdentityRegistry is meant to enforce.

**Root Cause**: Sender eligibility is never checked.

**Recommendation**:
```solidity
function canTransfer(address from, address to) public view returns (bool) {
    return registry.isVerified(from) && registry.isVerified(to);
}
```

---

### [KRAIT-008] Wrapper escapes RWA transfer restrictions — MEDIUM

**File**: `src/rwa/Wrapper.sol:14-22`
**Category**: eip-standard-compliance / token-flow
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `wtFUND` is a plain OpenZeppelin ERC20 with no transfer gating. Wrapping moves
restricted RwaToken value into a freely transferable representation.

**Impact**: A verified user wraps and sends `wtFUND` to any address, including non-verified
parties — the restricted economic exposure now circulates without registry checks. A
non-verified holder can route `wtFUND` through any verified mule to `unwrap`, fully bypassing
the identity gate on the underlying.

**Root Cause**: The wrapped token does not inherit the underlying's transfer restrictions.

**Recommendation**: Apply the same `registry.isVerified` gate to `wtFUND` transfers (override
`transfer`/`transferFrom`), or restrict `wrap`/`unwrap` and `wtFUND` holding to verified
addresses.

---

### [KRAIT-009] RedemptionVault never checks NAV staleness or zero — MEDIUM

**File**: `src/rwa/RedemptionVault.sol:19-27`
**Category**: oracle-staleness
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `_nav()` returns `feed.nav()` with no staleness or non-zero validation, even
though the contract declares `error StaleNAV()`, `NavFeed` exposes `updatedAt`, and a second
`ref` feed exists — all unused.

**Impact**: If the feed owner stops updating during volatility, redemptions clear at an outdated
price (value leakage in both directions). If `nav` is `0` (pre-initialization or reset), a
redeemer transfers shares in and receives `amount * 0 / 1e18 = 0` USDC — total loss of the
redeemed shares.

**Root Cause**: Declared staleness machinery is not wired into the redemption path.

**Recommendation**: Require `feed.nav() > 0` and `block.timestamp - feed.updatedAt() <= MAX_AGE`
(reverting `StaleNAV`) before pricing a redemption; remove or use the dead `ref` feed.

---

### [KRAIT-010] AsyncRedeem settles at a backward-looking NAV — MEDIUM

**File**: `src/rwa/AsyncRedeem.sol:33-50`
**Category**: economic-design
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `requestRedeem` stamps the current epoch, and `settle` pays
`navAt(r.epoch)` — the NAV already known at request time, rather than one struck AFTER the
request. There is no forward pricing (`error NotYetPriced()` is declared but never used), and
`settle` is permissionless and callable in the same epoch.

**Impact**: A holder who anticipates a write-down (admin `writeDown` moves USDC out, lowering
future per-share NAV) requests and settles at the current high NAV, extracting full value and
leaving remaining holders under-collateralized.

**Proof of Concept**:
```
1. NAV currently high. Attacker: id = requestRedeem(shares); settle(id) → paid at high NAV.
2. Admin writeDown()/strikeNav() lowers NAV; remaining holders redeem at the depressed NAV.
3. Attacker exited whole; the loss is socialized onto everyone else.
```

**Root Cause**: Backward-looking NAV selection instead of forward (next-strike) pricing.

**Recommendation**: Price redemptions at the first NAV struck strictly AFTER the request epoch;
reject `settle` until that strike exists (`NotYetPriced`).

---

### [KRAIT-011] DelegateA.setOwner is unauthenticated; DelegateA/DelegateB share storage slot 0 — MEDIUM

**File**: `src/delegate/DelegateA.sol:6`, `src/delegate/DelegateB.sol:5`
**Category**: access-control / EIP-7702 storage-collision
**Evidence**: REASONED — code trace [CODE-TRACE]

**Description**: `DelegateA.setOwner(newOwner)` has no caller check, so anyone can set the
`owner` of a DelegateA-installed account. Separately, `DelegateA.owner` and `DelegateB.guardian`
both occupy storage slot 0; an EIP-7702 account that redelegates from A to B keeps slot 0, so
`guardian` silently inherits the prior `owner` value.

**Impact**: (a) Any address hijacks the account owner via `setOwner`. (b) Redelegation produces
an unintended `guardian`, an uninitialized-delegate hazard that can mis-authorize later logic.

**Root Cause**: Missing auth on a state setter plus colliding storage layouts across delegate
implementations.

**Recommendation**: Authorize `setOwner` (`require(msg.sender == owner || msg.sender == address(this))`)
and standardize a shared, namespaced storage layout (e.g. ERC-7201) across every delegate a
7702 account may install, with explicit re-initialization on redelegation.

---

## Low Findings (brief)

- **[KRAIT-L1] TestToken.burn is public and unguarded** (`src/rwa/TestToken.sol:9`) — used as the
  `shares` token in `AsyncRedeem`; anyone can burn any holder's or the vault's shares, skewing the
  `totalSupply` denominator in `strikeNav`. Scope caveat: named "TestToken"; production must use a
  share token whose `burn` is restricted to the vault.
- **[KRAIT-L2] InitDelegate.initialize is front-runnable** (`src/delegate/InitDelegate.sol:7`) — any
  address can initialize first; low impact because `owner` is otherwise unused. Bind initialization
  to the intended account/deployer.
- **[KRAIT-L3] Mint uses `tx.origin == msg.sender`** (`src/delegate/Mint.sol:7`) — EIP-7702 EOAs
  carry code yet pass this "humans only" gate; only a counter is affected. Remove the anti-pattern.
- **[KRAIT-L4] Verifiers: `threshold` not required > 0, no verifier-removal path**
  (`src/bridge/Verifiers.sol:11-27`) — a zero threshold makes an empty `sigs` array pass; add
  `require(_threshold > 0)` and a removal function.

---

## Security Strengths

- **Replay protection where present**: `Adapter.sol` correctly binds `srcChain`/`dstChain`,
  records `processed[digest]`, and checks route before paying — the right pattern (which
  `ReplayAdapter`/`PackedAdapter` deviate from).
- **Signature hygiene in the multisig**: `Verifiers._checkSigs` enforces strictly ascending
  signer addresses (`signer > last`), preventing duplicate-signature inflation, and uses OZ
  `ECDSA` (malleability-safe) with `MessageHashUtils`.
- **Arithmetic safety**: Solidity 0.8.26 checked math throughout; no `unchecked` blocks and no
  explicit downcasts that could silently truncate.
- **Battle-tested base token**: `RwaToken`/`Wrapper`/`TestToken` extend OpenZeppelin `ERC20`
  (sound mint/burn/allowance accounting) rather than a hand-rolled implementation.
- **Area for improvement**: no reentrancy guards anywhere — current findings don't hinge on
  reentrancy, but `AsyncRedeem.settle` and the adapters perform external token transfers and would
  benefit from CEI discipline + `nonReentrant` as defense-in-depth.

---

## Architecture Observations

- **RootBook.applyBatch** (`src/bridge/RootBook.sol:21-35`): the `_first(batch, ROOT) == checkpointRoot`
  guard inspects only the first `ROOT` entry, while the write loop applies every entry in order — a
  trailing `ROOT` entry overwrites `values[ROOT]` to an attacker-chosen claim hash, and
  `checkpointRoot` is never updated after construction. Exploitation needs `threshold` verifier
  signatures over the crafted batch (trusted actors), so it is reported here rather than as an H/M
  finding — but it should be hardened (reject multi-`ROOT` batches / advance `checkpointRoot`).
- **Signed-message design is the recurring weak point**: three separate contracts (PerpVault,
  ReplayAdapter, PackedAdapter) authenticate a payload but fail to bind it uniquely (freshness,
  nonce, chain-id, length-delimited encoding). A single shared "signed-message envelope" helper
  (domain-separated EIP-712 struct with nonce + chainid) would eliminate the whole class.
- **EIP-7702 delegates lack a shared storage discipline and authorization convention** — consider a
  single audited account implementation rather than multiple slot-colliding delegates.

---

## Methodology

This audit was performed using Krait's multi-phase analysis:
1. **Recon**: architecture mapping, fund-flow and trust-boundary identification, deterministic risk
   scoring, Slither pre-scan (19 High / 11 Medium raw signals triaged).
2. **Detection**: Feynman first-principles interrogation + 4-lens multi-mindset pass across all 20
   files (small-codebase full treatment) + exploit-derived heuristics.
3. **State Analysis**: coupled-pair review (report↔position, request-epoch↔NAV, DelegateA/B slot 0,
   RwaToken from/to).
4. **Verification**: devil's-advocate falsification through the 8 kill gates + Impact-Premise
   (harm, not mechanism); every H/M carries a concrete exploit trace.

_Generated by [Krait](https://github.com/ZealynxSecurity/krait) by Zealynx Security_
