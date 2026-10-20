// Attack #3: a custom curve that rounds the wrong way. Our hook prices swaps itself
// (1 tGOLD = 1,000 tUSD) and rounds every payout up. The attacker makes 100 of the smallest
// swaps possible in one transaction.
//   node demos/03-delta.mjs           rounds up: 0.0001 tUSD in, 1.00 tGOLD out
//   node demos/03-delta.mjs --fixed   rounds down: 0.00 tGOLD out
import { startChain, stopChains, roles, abis, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "delta-fixed" : "delta", fixed ? "Rounding the wrong way, fixed" : "Rounding the wrong way");
const C = await startChain();
const A = roles.attacker;

const usd = await C.deploy("token", ["Test USD", "tUSD", 6]);
const gold = await C.deploy("token", ["Test Gold", "tGOLD", 2]);
const manager = await C.deploy("manager");
const router = await C.deploy("router", [manager]);
// --fixed only picks which hook contract is deployed.
const hook = await C.deploy(fixed ? "curveFixed" : "curve", [manager, gold]);
const key = { currency0: usd, currency1: gold, fee: 0, hooks: hook };
await C.send(roles.deployer, manager, abis.manager, "initialize", [key]);
await C.fund(gold, hook, 1_000n); // 10.00 tGOLD (2 decimals)

const inv = async () => fmt(await C.balanceOf(gold, hook), 2, 2);
t.say(`curve hook: 1 tGOLD = 1,000 tUSD · inventory ${await inv()} tGOLD`);
const tiny = await C.deploy("tiny");
const n = 100n;
await C.fund(usd, tiny, n); // 100 raw units = 0.0001 tUSD
t.cmd(`attacker → 100 swaps of 0.000001 tUSD each, one transaction`);
await C.send(A, tiny, abis.tiny, "run", [router, key, n]);
const paid = n - await C.balanceOf(usd, tiny);
const got = await C.balanceOf(gold, A.address);
t.say(`  swaps: ${n} · paid: ${fmt(paid, 6, 4)} tUSD`);
(got > 0n ? t.bad : t.ok)(`  received: ${fmt(got, 2, 2)} tGOLD (worth ${fmt(got * 1000n, 2, 0)} tUSD)`);
t.note(`  hook inventory 10.00 → ${await inv()} tGOLD`);
t.big(got > 0n ? `PAID ${fmt(paid, 6, 4)} tUSD · TOOK ${fmt(got, 2, 2)} tGOLD (${fmt(got * 1000n, 2, 0)} tUSD)` : `SAME 100 SWAPS · PAID OUT ${fmt(got, 2, 2)}`);
t.save(); stopChains(); process.exit(0);
