// Attack #5: one EOA can upgrade the token.
//   node demos/05-upgrade.mjs           the admin EOA swaps in an implementation with mintTo()
//   node demos/05-upgrade.mjs --fixed   _authorizeUpgrade needs UPGRADER_ROLE, held only by the timelock
import { startChain, stopChain, setup, roles, abis, deploy, attempt, read, fmt, short, implementationOf } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "upgrade-fixed" : "upgrade", fixed ? "Upgrade, fixed" : "Upgrade");
await startChain();
const s = await setup({ fixed, minter: "ops" });
const X = roles.attacker;

t.note(`zUSD implementation: ${short(await implementationOf(s.zusd))}`);
t.warn("UPGRADER (admin EOA) key leaked");
t.cmd("forge create EvilZUSD   # zUSD + mintTo(), no access control");
const evil = await deploy("evil", [], X);
t.cmd(`zusd.upgradeToAndCall(${short(evil)}, "")`);
const up = await attempt(roles.admin, s.zusd, s.tokenAbi, "upgradeToAndCall", [evil, "0x"]);
if (up.ok) {
  t.bad(`  ✓ upgraded   implementation: ${short(await implementationOf(s.zusd))}`);
  t.cmd("zusd.mintTo(attacker, 1e30)");
  const m = await attempt(X, s.zusd, abis.evil, "mintTo", [X.address, 10n ** 30n]);
  t.bad(m.ok ? "  ✓ minted" : `  ✗ ${m.name}`);
} else {
  t.ok(`  ✗ reverted: ${up.name}   # UPGRADER_ROLE is the timelock`);
  t.note(`  implementation: ${short(await implementationOf(s.zusd))} (unchanged)`);
}
const got = await read(s.zusd, s.tokenAbi, "balanceOf", [X.address]);
const swapped = (await implementationOf(s.zusd)).toLowerCase() !== s.impl.toLowerCase();
t.say(`  implementation ${swapped ? "SWAPPED" : "UNCHANGED"}`);
t.say("");
// One field on the scoreboard: the 25-digit balance alone already fills the line.
t.big(`ATTACKER MINTED: ${fmt(got)} zUSD`);
t.save(); stopChain(); process.exit(0);
