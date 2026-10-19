// Attack #1: a price that never moves. Our market prices tUSDX at a hardcoded $1.00.
// We crash tUSDX to $0.10 on our own pool; a borrower posts it at the oracle price.
//   node demos/01-depeg.mjs           fixed $1 oracle: the borrower takes 900,000 tUSDC
//   node demos/01-depeg.mjs --fixed   deviation check against the pool: borrow reverts
import { startChain, stopChains, roles, abis, units, fmt, usd } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "depeg-fixed" : "depeg", fixed ? "A price that never moves, fixed" : "A price that never moves");
const C = await startChain();

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 18]);
const usdx = await C.deploy("token", ["Test USDX", "tUSDX", 18]);
const amm = await C.deploy("amm", [usdx, usdc]);
const feed = await C.deploy("feed", [units(1)]); // set once, never updated
// --fixed only picks which market contract is deployed.
const market = fixed ? await C.deploy("depegGuard", [usdx, usdc, feed, amm]) : await C.deploy("market", [usdx, usdc, feed]);
const mabi = fixed ? abis.depegGuard : abis.market;

await C.fund(usdc, roles.deployer, units(1_000_000), amm);
await C.fund(usdx, roles.deployer, units(1_000_000), amm);
await C.send(roles.deployer, amm, abis.amm, "addLiquidity", [units(1_000_000), units(1_000_000)]);
await C.fund(usdc, roles.lender, units(1_000_000), market);
await C.send(roles.lender, market, mabi, "deposit", [units(1_000_000)]);

t.say(`market holds ${fmt(await C.balanceOf(usdc, market))} tUSDC from lenders`);
t.note(`tUSDX · oracle ${usd(await C.read(feed, abis.feed, "price"))} · pool ${usd(await C.read(amm, abis.amm, "spotPrice"))}`);

// The crash: holders dump tUSDX into our pool until it trades at ten cents.
const rb = await C.read(amm, abis.amm, "reserveBase"), rq = await C.read(amm, abis.amm, "reserveQuote");
const target = BigInt(Math.floor(Math.sqrt(Number(rb) * Number(rq) / 0.1)));
const dump = target - rb;
await C.fund(usdx, roles.seller, dump, amm);
t.cmd(`sellers dump ${fmt(dump)} tUSDX into the pool`);
await C.send(roles.seller, amm, abis.amm, "swap", [usdx, dump, roles.seller.address]);
const spot = await C.read(amm, abis.amm, "spotPrice");
const oracle = await C.read(feed, abis.feed, "price");
t.bad(`  pool price   ${usd(spot)}`);
t.warn(`  oracle price ${usd(oracle)}   (unchanged)`);

const posted = units(1_125_000);
await C.fund(usdx, roles.borrower, posted, market);
t.cmd(`borrower supplies ${fmt(posted)} tUSDX · worth ${usd(posted * spot / 10n ** 18n, 0)} at the pool`);
await C.send(roles.borrower, market, mabi, "supply", [posted]);
const want = await C.read(market, mabi, "maxBorrow", [roles.borrower.address]);
t.cmd(`borrower → market.borrow(${fmt(want)} tUSDC)`);
const r = await C.attempt(roles.borrower, market, mabi, "borrow", [want]);
const got = await C.balanceOf(usdc, roles.borrower.address);
if (r.ok) t.bad(`  ✓ borrowed · borrower holds ${fmt(got)} tUSDC`);
else t.ok(`  ✗ reverted: ${r.name}`);
// The verdict comes from balances, not from the flag.
t.big(got === 0n ? `REVERTED · lenders keep ${fmt(await C.balanceOf(usdc, market))} tUSDC`
  : `POSTED ${usd(posted * spot / 10n ** 18n, 0)} · TOOK ${fmt(got)} tUSDC`);
t.save(); stopChains(); process.exit(0);
