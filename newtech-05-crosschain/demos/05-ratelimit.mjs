// Attack #5: assume one of the first four fails. A forged message gets through a 1-of-1
// verifier set. How much can it take in one call?
//   node demos/05-ratelimit.mjs           everything: the adapter is emptied in one call
//   node demos/05-ratelimit.mjs --fixed   1,000 per hour on this route; the rest is held, route pauses
import { keccak256, encodeAbiParameters } from "viem";
import { startChain, stopChains, roles, verifiers, abis, sigsFrom, units, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "ratelimit-fixed" : "ratelimit", fixed ? "Rate limit, fixed" : "Rate limit");
const CHAIN_A = 1001n;
const B = await startChain({ id: 31338, name: "chain B" });

const token = await B.deploy("token", ["Test rsETH", "tRSETH", 18]);
// Same weak verifier set in both runs; --fixed only adds the per-route limit.
const weak = [[verifiers[0].address], 1n];
const adapter = fixed
  ? await B.deploy("rateLimited", [token, CHAIN_A, ...weak, units(1_000)])
  : await B.deploy("adapter", [token, CHAIN_A, ...weak]);
const abi = fixed ? abis.rateLimited : abis.adapter;
await B.send(roles.relayer, token, abis.token, "mint", [adapter, units(116_500)]);
const before = await B.balanceOf(token, adapter);
t.say(`adapter holds ${fmt(before)} tRSETH`);

const msg = { srcChain: CHAIN_A, dstChain: B.id, nonce: 9n, to: roles.attacker.address, amount: before };
const d = keccak256(encodeAbiParameters(
  [{ type: "tuple", components: [{ name: "srcChain", type: "uint256" }, { name: "dstChain", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }] }],
  [msg]));
t.cmd(`forged message gets through: release ${fmt(before)} → attacker`);
const r = await B.attempt(roles.attacker, adapter, abi, "release", [msg, await sigsFrom([verifiers[0]], d)]);
if (!r.ok) t.ok(`  ✗ reverted: ${r.name}`);
// The verdict comes from balances and the adapter's own state, not from the flag.
const got = await B.balanceOf(token, roles.attacker.address);
const left = await B.balanceOf(token, adapter);
t.bad(`  attacker received ${fmt(got)} tRSETH`);
if (fixed) t.ok(`  route paused: ${await B.read(adapter, abi, "paused")} · held for review: ${fmt(await B.read(adapter, abi, "held", [roles.attacker.address]))}`);
t.big(left === 0n ? `ONE CALL · ADAPTER EMPTIED` : `${fmt(got)} OUT · ${fmt(left)} STAYS`);
t.save(); stopChains(); process.exit(0);
