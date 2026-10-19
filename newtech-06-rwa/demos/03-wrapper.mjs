// Attack #3: the wrapper. The permissioned token asks compliance on every transfer, and the
// issuer whitelisted the wrapper contract. The wrapped token asks nobody.
//   node demos/03-wrapper.mjs           a non-verified wallet ends up holding 50,000 wrapped
//   node demos/03-wrapper.mjs --fixed   wrapped transfers run canTransfer: NotEligible
import { startChain, stopChains, roles, abis, units, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "wrapper-fixed" : "wrapper", fixed ? "Wrapper, fixed" : "Wrapper");
const C = await startChain();
const { admin, agent, alice, mallory } = roles;

const registry = await C.deploy("IdentityRegistry");
const token = await C.deploy("RwaToken", ["Test fund", "tFUND", registry, agent.address]);
// --fixed only picks which wrapper is deployed.
const kind = fixed ? "WrapperFixed" : "Wrapper";
const wrapper = await C.deploy(kind, [token]);
await C.send(admin, registry, abis.IdentityRegistry, "register", [alice.address, true]);
await C.send(admin, registry, abis.IdentityRegistry, "register", [wrapper, true]); // issuer whitelists the wrapper
await C.send(agent, token, abis.RwaToken, "mint", [alice.address, units(50_000)]);

const can = await C.read(token, abis.RwaToken, "canTransfer", [alice.address, mallory.address]);
t.say(`canTransfer(alice → mallory): ${can}`);
const amt = units(50_000);
t.cmd(`alice → token.transfer(mallory, ${fmt(amt)})`);
const d = await C.attempt(alice, token, abis.RwaToken, "transfer", [mallory.address, amt]);
t.say(d.ok ? `  ✓ sent` : `  ✗ reverted: ${d.name}`);

t.cmd(`alice → wrap(${fmt(amt)}) · send wrapped → mallory`);
await C.send(alice, token, abis.RwaToken, "approve", [wrapper, amt]);
await C.send(alice, wrapper, abis[kind], "wrap", [amt]);
const w = await C.attempt(alice, wrapper, abis[kind], "transfer", [mallory.address, amt]);
if (w.ok) t.bad(`  ✓ sent`); else t.ok(`  ✗ reverted: ${w.name}`);
// Balances read from chain after the calls.
const held = await C.read(wrapper, abis[kind], "balanceOf", [mallory.address]);
const direct = await C.balanceOf(token, mallory.address);
t.say(`mallory: tFUND ${fmt(direct)} · wrapped ${fmt(held)}`);
t.big(held > 0n ? `canTransfer: ${can} · YET HOLDS ${fmt(held)} WRAPPED` : `BLOCKED · MALLORY HOLDS ${fmt(held + direct)}`);
t.save(); stopChains(); process.exit(0);
