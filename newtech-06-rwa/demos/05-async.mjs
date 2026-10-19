// Attack #5: async redemption priced at request time. Request at NAV $1.00, an 8% loss is
// booked while the request waits, settle afterwards at the old price.
//   node demos/05-async.mjs           redeemer exits at $1.00; remaining holders eat the gap
//   node demos/05-async.mjs --fixed   settles at navAt(epoch + 1): the post-loss price
import { startChain, stopChains, roles, abis, units, fmt, usd, pct } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "async-fixed" : "async", fixed ? "Async redemption, fixed" : "Async redemption");
const C = await startChain();
const { admin, redeemer, other } = roles;
const SINK = "0x000000000000000000000000000000000000dEaD"; // where the written-down assets go

const usdc = await C.deploy("TestToken", ["Test USDC", "tUSDC"]);
const shares = await C.deploy("TestToken", ["Test fund shares", "tFUND"]);
// --fixed only picks which queue is deployed.
const kind = fixed ? "AsyncRedeemFixed" : "AsyncRedeem";
const q = await C.deploy(kind, [usdc, shares]);
const abi = abis[kind];
await C.send(admin, usdc, abis.TestToken, "mint", [q, units(2_000_000)]);
await C.send(admin, shares, abis.TestToken, "mint", [redeemer.address, units(1_000_000)]);
await C.send(admin, shares, abis.TestToken, "mint", [other.address, units(1_000_000)]);

const supply = await C.read(shares, abis.TestToken, "totalSupply");
t.say(`fund: ${fmt(supply)} shares · NAV ${usd(await C.read(q, abi, "navAt", [0n]))} (epoch 0)`);
const amount = units(1_000_000);
await C.send(redeemer, shares, abis.TestToken, "approve", [q, amount]);
t.cmd(`redeemer → requestRedeem(${fmt(amount)}) at epoch ${await C.read(q, abi, "epoch")}`);
await C.send(redeemer, q, abi, "requestRedeem", [amount]);

const a0 = await C.balanceOf(usdc, q);
await C.send(admin, q, abi, "writeDown", [a0 * 8n / 100n, SINK]); // strategy loss
await C.send(admin, q, abi, "strikeNav");
const e1 = await C.read(q, abi, "epoch");
const nav1 = await C.read(q, abi, "navAt", [e1]);
t.say(`loss: assets ${pct(a0, await C.balanceOf(usdc, q))} · NAV ${usd(nav1)} (epoch ${e1})`);

t.cmd(`settle(request)`);
await C.send(admin, q, abi, "settle", [0n]);
// Everything below is read from balances after settlement.
const paid = await C.balanceOf(usdc, redeemer.address);
const fair = amount * nav1 / units(1);
const left = await C.read(shares, abis.TestToken, "totalSupply");
const perShare = (await C.balanceOf(usdc, q)) * units(1) / left;
(paid > fair ? t.bad : t.ok)(`  redeemer paid ${fmt(paid)} · fair ${fmt(fair)}`);
const stake = left * (await C.read(q, abi, "navAt", [0n])) / units(1); // others' stake before the loss
const lost = left * nav1 / units(1) - (await C.balanceOf(usdc, q));     // vs their fair value after it
(perShare < nav1 ? t.bad : t.ok)(`  others' share: ${usd(perShare)} vs NAV ${usd(nav1)}`);
(lost > 0n ? t.bad : t.ok)(`  others lose ${fmt(lost)} of a ${fmt(stake)} stake (${pct(stake, stake - lost)})`);
t.big(paid > fair ? `REDEEMER +${fmt(paid - fair)} · OTHERS -${fmt(lost)}`
  : `PAID AT ${usd(paid * units(1) / amount)} · OTHERS LOSE ${fmt(lost)}`);
t.save(); stopChains(); process.exit(0);
