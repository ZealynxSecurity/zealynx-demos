// Attack #2: trusting sender. Our pool lets in three allowlisted users. The hook checks `sender`,
// which is whoever called the pool manager: the router. So the router must be on the list,
// and anyone who swaps through the router gets in.
//   node demos/02-sender.mjs           hook checks sender: the attacker swaps 5,000 tUSDC
//   node demos/02-sender.mjs --fixed   hook asks the trusted router for the real user: NotAllowed
import { startChain, stopChains, roles, abis, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "sender-fixed" : "sender", fixed ? "Trusting sender, fixed" : "Trusting sender");
const C = await startChain();
const A = roles.attacker;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 6]);
const usd = await C.deploy("token", ["Test USD", "tUSD", 6]);
const manager = await C.deploy("manager");
const router = await C.deploy("router", [manager]);
// --fixed only picks which hook contract is deployed (and so whether the router needs listing).
const hook = await C.deploy(fixed ? "allowFixed" : "allow", [manager]);
const habi = fixed ? abis.allowFixed : abis.allow;
const key = { currency0: usdc, currency1: usd, fee: 3000, hooks: hook };
await C.send(roles.deployer, manager, abis.manager, "initialize", [key]);
await C.fund(usdc, roles.deployer, units(1_000_000, 6), manager);
await C.fund(usd, roles.deployer, units(1_000_000, 6), manager);
await C.send(roles.deployer, manager, abis.manager, "addLiquidity", [key, units(1_000_000, 6), units(1_000_000, 6)]);
for (const u of [roles.alice, roles.bob, roles.carol]) await C.send(roles.deployer, hook, habi, "allow", [u.address]);
if (fixed) await C.send(roles.deployer, hook, habi, "trustRouter", [router]);
else await C.send(roles.deployer, hook, habi, "allow", [router]); // or nobody could swap through it

const listed = [roles.alice, roles.bob, roles.carol, { address: router }];
const on = await Promise.all(listed.map((u) => C.read(hook, habi, "allowed", [u.address])));
t.say(`allowlist: alice, bob, carol${on[3] ? ", the router" : ""}${fixed ? ` · trusted router: ours` : ""}`);
t.note(`attacker ${short(A.address)} on the allowlist: ${await C.read(hook, habi, "allowed", [A.address]) ? "yes" : "no"}`);

const swap = async (who, label) => {
  await C.fund(usdc, who, units(5_000, 6), router);
  t.cmd(`${label} → router.swap(5,000 tUSDC → tUSD)`);
  const r = await C.attempt(who, router, [...abis.router, ...habi], "swap", [key, true, units(5_000, 6), "0x"]);
  const seen = (await C.read(hook, habi, "lastSeen")).toLowerCase();
  const names = { [router.toLowerCase()]: "the router", [A.address.toLowerCase()]: "attacker", [roles.alice.address.toLowerCase()]: "alice" };
  if (r.ok) t.note(`  hook saw sender as: ${names[seen] ?? short(seen)}`);
  if (r.ok) (who === A ? t.bad : t.ok)(`  ✓ swapped · ${label} holds ${fmt(await C.balanceOf(usd, who.address), 6)} tUSD`);
  else t.ok(`  ✗ reverted: ${r.name}`);
  return r.ok;
};
const ok = await swap(A, "attacker");
if (fixed) await swap(roles.alice, "alice");
const got = await C.balanceOf(usd, A.address);
t.big(ok ? `NOT ON THE LIST · SWAPPED 5,000 tUSDC · GOT ${fmt(got, 6)} tUSD` : `ATTACKER REVERTED · ALICE STILL SWAPS`);
t.save(); stopChains(); process.exit(0);
