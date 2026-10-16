// Attack #4: storage belongs to the account, not the delegate code. Delegate A wrote
// `owner` to slot 0. After the account re-delegates to delegate B, B's first variable,
// `guardian`, reads back whatever A left in slot 0.
//   node demos/04-collision.mjs           B.guardian reads the attacker A left in slot 0
//   node demos/04-collision.mjs --fixed   B uses ERC-7201 namespaced storage → guardian is 0x0
import { startChain, stopChain, deploy, roles, abis, delegate, send, read, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "collision-fixed" : "collision", fixed ? "Storage collision, fixed" : "Storage collision");
await startChain();

const account = roles.user.address;
const delA = await deploy("delegateA");
const delB = fixed ? await deploy("delegateBFixed") : await deploy("delegateB");
const delBAbi = fixed ? abis.delegateBFixed : abis.delegateB;

// Step 1: account delegates to A; A writes `owner` (slot 0) = attacker.
t.say(`account ${short(account)} delegates to A, then switches to B`);
await delegate(roles.user, delA);
await send(roles.relayer, account, abis.delegateA, "setOwner", [roles.attacker.address]);
t.note(`delegate A set owner (slot 0) = ${short(await read(account, abis.delegateA, "owner"))}`);
t.note(`storage lives on the account, not the code — slot 0 persists`);

// Step 2: account re-delegates to B. B never set guardian — it just reads slot 0.
t.cmd(`re-delegate account → B ${short(delB)}; read B.guardian()`);
await delegate(roles.user, delB);
const guardian = await read(account, delBAbi, "guardian");
// The verdict comes from the value B actually reads, not from the flag.
const leftByA = guardian.toLowerCase() === roles.attacker.address.toLowerCase();
if (leftByA) t.bad(`  ✗ B reads slot 0 → guardian = ${short(guardian)} (left by A)`);
else t.ok(`  ✓ B reads its ERC-7201 slot, not slot 0 → guardian = ${short(guardian)}`);

t.big(`GUARDIAN = ${short(guardian)} ${leftByA ? "(left by A)" : "(clean)"}`);
t.save(); stopChain(); process.exit(0);
