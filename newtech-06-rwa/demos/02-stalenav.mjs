// Attack #2: a stale NAV. The fund's NAV feed last posted $1.00 three days ago; the reference
// NAV today is $0.92. Our redemption vault pays whatever the feed says.
//   node demos/02-stalenav.mjs           1,000,000 shares redeem for 1,000,000 (fair: 920,000)
//   node demos/02-stalenav.mjs --fixed   <= 1 day old and within 2% of reference: StaleNAV
import { startChain, stopChains, roles, abis, units, fmt, usd, pct } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "stalenav-fixed" : "stalenav", fixed ? "Stale NAV, fixed" : "Stale NAV");
const C = await startChain();
const { admin, redeemer } = roles;

const usdc = await C.deploy("TestToken", ["Test USDC", "tUSDC"]);
const shares = await C.deploy("TestToken", ["Test fund shares", "tFUND"]);
const feed = await C.deploy("NavFeed");
const ref = await C.deploy("NavFeed");
// --fixed only picks which vault is deployed.
const kind = fixed ? "RedemptionVaultFixed" : "RedemptionVault";
const vault = await C.deploy(kind, [shares, usdc, feed, ref]);
await C.send(admin, usdc, abis.TestToken, "mint", [vault, units(2_000_000)]);
await C.send(admin, shares, abis.TestToken, "mint", [redeemer.address, units(1_000_000)]);

await C.send(admin, feed, abis.NavFeed, "set", [units(1)]);           // last post: $1.00
await C.increaseTime(3 * 86400);                                      // ...then the feed stops
await C.send(admin, ref, abis.NavFeed, "set", [units(92) / 100n]);    // reference today: $0.92

const nav = await C.read(feed, abis.NavFeed, "nav");
const age = (await C.now()) - (await C.read(feed, abis.NavFeed, "updatedAt"));
const refNav = await C.read(ref, abis.NavFeed, "nav");
t.say(`NAV feed: ${usd(nav)} · updated ${Number(age) / 86400 | 0} days ago`);
t.say(`reference NAV: ${usd(refNav)}`);

const amount = units(1_000_000);
await C.send(redeemer, shares, abis.TestToken, "approve", [vault, amount]);
t.cmd(`redeemer → redeem(${fmt(amount)} shares)`);
const r = await C.attempt(redeemer, vault, abis[kind], "redeem", [amount]);
if (!r.ok) t.ok(`  ✗ reverted: ${r.name}`);
// Paid and fair are both read from chain state after the call.
const paid = await C.balanceOf(usdc, redeemer.address);
const fair = amount * refNav / units(1);
const kept = await C.balanceOf(shares, redeemer.address);
if (r.ok) t.bad(`  paid ${fmt(paid)} tUSDC · fair ${fmt(fair)}`);
t.big(paid > fair ? `OVERPAID ${fmt(paid - fair)} tUSDC (${pct(fair, paid)})`
  : paid === 0n ? `NOTHING PAID · shares kept ${fmt(kept)}` : `PAID ${fmt(paid)} · FAIR ${fmt(fair)}`);
t.save(); stopChains(); process.exit(0);
