// Attack #4: seize power behind one key.
//   node demos/04-seize.mjs           the admin key moves any balance to any address
//   node demos/04-seize.mjs --fixed   seize only burns, ENFORCER_ROLE sits behind a 24h timelock
import { startChain, stopChain, setup, roles, abis, send, attempt, read, warp, fmt, short, scheduleViaTimelock, parseUnits } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "seize-fixed" : "seize", fixed ? "Seize, fixed" : "Seize");
await startChain();
const s = await setup({ fixed, minter: "ops" });
const V = roles.victim, X = roles.attacker;
const bal = (a) => read(s.zusd, s.tokenAbi, "balanceOf", [a]);

await send(roles.ops, s.zusd, s.tokenAbi, "mint", [V.address, parseUnits("2000000", 6)]);
t.note(`victim ${short(V.address)}: ${fmt(await bal(V.address))} zUSD`);
t.warn("ADMIN_KEY leaked");
if (!fixed) {
  t.cmd(`zusd.seize(victim, ${short(X.address)})   # signed with the admin key`);
  await send(roles.admin, s.zusd, s.tokenAbi, "seize", [V.address, X.address]);
  t.bad(`  ✓ moved ${fmt(await bal(X.address))} zUSD in one transaction`);
} else {
  t.cmd("zusd.seize(victim)   # signed with the admin key");
  const a = await attempt(roles.admin, s.zusd, s.tokenAbi, "seize", [V.address]);
  t.ok(`  ✗ reverted: ${a.name}   # ENFORCER_ROLE is the timelock`);
  t.cmd("timelock.schedule(seize(victim), 24h)   # multisig, court order attached");
  const exec = await scheduleViaTimelock(s.timelock, s.zusd, s.tokenAbi, "seize", [V.address]);
  const early = await attempt(roles.multisig, s.timelock, abis.timelock, "execute", exec);
  t.ok(`  execute now   ✗ reverted: ${early.name}`);
  await warp(86_400);
  t.note("24 hours pass (public, cancellable)");
  const done = await attempt(roles.multisig, s.timelock, abis.timelock, "execute", exec);
  t.note(done.ok ? "  execute       ✓ seize(victim) burned the balance" : `  ✗ ${done.name}`);
}
t.say("");
t.big(`VICTIM: ${fmt(await bal(V.address))} zUSD   ATTACKER: ${fmt(await bal(X.address))} zUSD`);
t.save(); stopChain(); process.exit(0);
