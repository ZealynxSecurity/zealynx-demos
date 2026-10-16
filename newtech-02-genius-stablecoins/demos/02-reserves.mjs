// Attack #2: supply that outruns the reserve (GENIUS Act: 1:1 backing).
//   node demos/02-reserves.mjs           mint takes supply to 120% of the attested reserve
//   node demos/02-reserves.mjs --fixed   mint checks the proof-of-reserve feed, and its age
import { startChain, stopChain, setup, roles, abis, send, attempt, read, warp, now, fmt, parseUnits } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "reserves-fixed" : "reserves", fixed ? "Reserves, fixed" : "Reserves");
await startChain();
const s = await setup({ fixed, minter: "ops", reserve: 1_000_000 });
const u = (n) => parseUnits(String(n), 6);
const supply = () => read(s.zusd, s.tokenAbi, "totalSupply");
const reserve = () => read(s.feed, abis.feed, "reserve");

await send(roles.ops, s.zusd, s.tokenAbi, "mint", [roles.ops.address, u(1_000_000)]);
t.cmd("reserveFeed.reserve()");
t.note(`  attested reserve: $${fmt(await reserve())}    supply: ${fmt(await supply())} zUSD`);
t.cmd("zusd.mint(treasury, 200,000)");
const over = await attempt(roles.ops, s.zusd, s.tokenAbi, "mint", [roles.ops.address, u(200_000)]);
if (over.ok) t.bad(`  ✓ minted   supply now ${fmt(await supply())} zUSD`);
else {
  t.ok(`  ✗ reverted: ${over.name}(supply ${fmt(over.args[0])} > reserve ${fmt(over.args[1])})`);
  t.note("3 days pass, no new attestation");
  await warp(3 * 86_400);
  t.cmd("zusd.mint(treasury, 1)");
  const stale = await attempt(roles.ops, s.zusd, s.tokenAbi, "mint", [roles.ops.address, u(1)]);
  const age = ((await now()) - stale.args[0]) / 3600n;
  t.ok(`  ✗ reverted: ${stale.name}(attested ${age}h ago, max 24h)`);
}
const sup = await supply(), res = await reserve();
t.say("");
t.big(`SUPPLY: ${fmt(sup)} zUSD   RESERVE: $${fmt(res)}   (${(sup * 100n) / res}% backed)`);
t.save(); stopChain(); process.exit(0);
