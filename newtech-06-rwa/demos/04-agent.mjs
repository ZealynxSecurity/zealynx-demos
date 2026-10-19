// Attack #4: one agent key. forcedTransfer exists for recovery (lost keys, court orders).
// Our token gates it with a single agent key: no delay, no cap, and a batch version.
//   node demos/04-agent.mjs           the stolen key empties all 12 holders in one tx
//   node demos/04-agent.mjs --fixed   same key, same call: capped per op, queued 48h, evented
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { startChain, stopChains, roles, abis, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "agent-fixed" : "agent", fixed ? "Agent key, fixed" : "Agent key");
const C = await startChain();
const { admin, agent, attacker } = roles;
// 12 holder addresses (no keys needed: they only receive).
const holders = Array.from({ length: 12 }, (_, i) => privateKeyToAccount(keccak256(toHex(`rwa-holder-${i}`))).address);

const registry = await C.deploy("IdentityRegistry");
// --fixed only picks which token is deployed (and its cap / guardian).
const kind = fixed ? "RwaTokenFixed" : "RwaToken";
const abi = abis[kind];
const token = fixed
  ? await C.deploy(kind, ["Test fund", "tFUND", registry, agent.address, units(1_000), admin.address])
  : await C.deploy(kind, ["Test fund", "tFUND", registry, agent.address]);
for (const h of holders) {
  await C.send(admin, registry, abis.IdentityRegistry, "register", [h, true]);
  await C.send(agent, token, abi, "mint", [h, units(100_000)]);
}
const count = async () => (await Promise.all(holders.map((h) => C.balanceOf(token, h)))).filter((b) => b > 0n).length;
const supply = await C.read(token, abi, "totalSupply");
t.say(`${await count()} holders · ${fmt(supply)} tFUND`);
t.note(`agent key ${short(agent.address)} is stolen`);

// Same key, same call in both runs: every holder's full balance → attacker.
const amounts = await Promise.all(holders.map((h) => C.balanceOf(token, h)));
t.cmd(`stolen key → batchForcedTransfer(12 → attacker)`);
const r = await C.attempt(agent, token, abi, "batchForcedTransfer", [holders, holders.map(() => attacker.address), amounts]);
if (r.ok) t.bad(`  ✓ one transaction`);
else t.ok(`  ✗ reverted: ${r.name}${fixed ? ` · cap ${fmt(await C.read(token, abi, "maxForced"))} per operation` : ""}`);

let queued = 0n;
if (fixed) {
  t.cmd(`stolen key → forcedTransfer(1 holder, 1,000)`);
  await C.send(agent, token, abi, "forcedTransfer", [holders[0], attacker.address, units(1_000)]);
  // Read back from chain: the queued op and its event.
  queued = await C.read(token, abi, "opsCount");
  const [, , amt, eta, done] = await C.read(token, abi, "ops", [queued - 1n]);
  const ev = await C.pub.getContractEvents({ address: token, abi, eventName: "ForcedTransferQueued", fromBlock: 0n });
  t.warn(`  queued: ${fmt(amt)} tFUND · executes in ${(eta - (await C.now())) / 3600n}h · ${ev.length} event${done ? " · done" : ""}`);
}
// Counts and balances read from chain after the calls.
const left = await count();
const took = await C.balanceOf(token, attacker.address);
t.say(`holders with a balance: ${holders.length} → ${left}`);
if (!fixed || took > 0n) t.say(`attacker holds ${fmt(took)} tFUND`);
t.big(left === 0 ? `1 TX · ${holders.length} HOLDERS → 0 · ${fmt(took)} TAKEN`
  : took === 0n ? `${left} HOLDERS KEEP THEIR BALANCES · ${queued} OP QUEUED` : `${left} HOLDERS LEFT · ${fmt(took)} TAKEN`);
t.save(); stopChains(); process.exit(0);
