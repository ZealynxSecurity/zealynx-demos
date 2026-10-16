// Attack #3: a freeze that only freezes one path.
//   node demos/03-freeze.mjs           frozen in transfer(); the approved spender uses transferFrom()
//   node demos/03-freeze.mjs --fixed   the check lives in _update(), which every path runs through
import { startChain, stopChain, setup, roles, send, attempt, read, fmt, short, parseUnits } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "freeze-fixed" : "freeze", fixed ? "Freeze, fixed" : "Freeze");
await startChain();
const s = await setup({ fixed, minter: "ops" });
const amt = parseUnits("50000", 6);
const bal = (a) => read(s.zusd, s.tokenAbi, "balanceOf", [a]);
const H = roles.victim, S = roles.spender; // H: the sanctioned holder, S: a spender it approved earlier

await send(roles.ops, s.zusd, s.tokenAbi, "mint", [H.address, amt]);
await send(H, s.zusd, s.tokenAbi, "approve", [S.address, amt]);
t.cmd(`zusd.freeze(${short(H.address)})   # court order`);
await send(roles.admin, s.zusd, s.tokenAbi, "freeze", [H.address]);
t.note(`  frozen: ${await read(s.zusd, s.tokenAbi, "frozen", [H.address])}    balance: ${fmt(await bal(H.address))} zUSD`);

t.cmd("holder: transfer(spender, 50,000)");
const a = await attempt(H, s.zusd, s.tokenAbi, "transfer", [S.address, amt]);
a.ok ? t.bad("  ✓ moved") : t.ok(`  ✗ reverted: ${a.name}`);
t.cmd("spender: transferFrom(holder, spender, 50,000)");
const b = await attempt(S, s.zusd, s.tokenAbi, "transferFrom", [H.address, S.address, amt]);
b.ok ? t.bad("  ✓ moved   # freeze bypassed") : t.ok(`  ✗ reverted: ${b.name}`);
t.say("");
t.big(`FROZEN WALLET MOVED: ${fmt(await bal(S.address))} zUSD   STILL FROZEN: ${fmt(await bal(H.address))} zUSD`);
t.save(); stopChain(); process.exit(0);
