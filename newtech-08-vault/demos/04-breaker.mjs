// Attack #4: no breaker when the peg breaks. Our oracle tracks the market, but the market keeps
// lending while tUSDX slides off its peg. When it collapses, liquidation can't cover the loan.
//   node demos/04-breaker.mjs           no breaker: 640,000 tUSDC of bad debt
//   node demos/04-breaker.mjs --fixed   breaker at 3% off peg: borrow paused, zero bad debt
import { startChain, stopChains, roles, abis, units, fmt, usd } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "breaker-fixed" : "breaker", fixed ? "No breaker, fixed" : "No breaker when the peg breaks");
const C = await startChain();
const B = roles.borrower;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 18]);
const usdx = await C.deploy("token", ["Test USDX", "tUSDX", 18]);
const feed = await C.deploy("feed", [units(1)]); // our keeper updates it to the market price
// --fixed only picks which market contract is deployed.
const market = fixed ? await C.deploy("breaker", [usdx, usdc, feed]) : await C.deploy("market", [usdx, usdc, feed]);
const mabi = fixed ? abis.breaker : abis.market;
await C.fund(usdc, roles.lender, units(1_000_000), market);
await C.send(roles.lender, market, mabi, "deposit", [units(1_000_000)]);
t.say(`lenders deposited ${fmt(await C.balanceOf(usdc, market))} tUSDC`);

const price = async (p) => {
  await C.send(roles.deployer, feed, abis.feed, "setPrice", [units(p)]);
  const v = await C.read(feed, abis.feed, "price");
  (v < units(0.97) ? t.bad : t.warn)(`  oracle: tUSDX ${usd(v, 3)}${fixed ? ` · borrow paused: ${await C.read(market, mabi, "borrowPaused")}` : ""}`);
};
t.cmd(`the peg slips`);
await price(0.96);

await C.fund(usdx, B, units(1_000_000), market);
await C.send(B, market, mabi, "supply", [units(1_000_000)]);
const want = await C.read(market, mabi, "maxBorrow", [B.address]);
t.cmd(`borrower supplies 1,000,000 tUSDX · borrows ${fmt(want)} tUSDC`);
const r = await C.attempt(B, market, mabi, "borrow", [want]);
if (r.ok) t.bad(`  ✓ borrowed ${fmt(await C.read(market, mabi, "debt", [B.address]))}`);
else t.ok(`  ✗ reverted: ${r.name}`);

t.cmd(`the peg breaks`);
await price(0.128);
const debt = await C.read(market, mabi, "debt", [B.address]);
if (debt > 0n) {
  await C.fund(usdc, roles.liquidator, debt, market);
  t.cmd(`liquidator → market.liquidate(borrower)`);
  await C.send(roles.liquidator, market, mabi, "liquidate", [B.address]);
  t.say(`  liquidator repaid ${fmt(debt - await C.read(market, mabi, "badDebt"))} · took all ${fmt(await C.balanceOf(usdx, roles.liquidator.address))} tUSDX`);
} else t.note(`  no loan against tUSDX to liquidate`);
const bad = await C.read(market, mabi, "badDebt");
(bad > 0n ? t.bad : t.ok)(`  bad debt ${fmt(bad)} tUSDC`);
t.big(bad > 0n ? `BAD DEBT ${fmt(bad)} tUSDC · LENDERS CARRY IT` : `BORROWING PAUSED · BAD DEBT ${fmt(bad)}`);
t.save(); stopChains(); process.exit(0);
