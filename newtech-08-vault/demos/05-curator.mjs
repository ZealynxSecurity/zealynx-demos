// Attack #5: the curator who moves in one block. Our vault lets its curator raise a market's cap
// and allocate into it at once, so depositors get no warning and no exit.
//   node demos/05-curator.mjs           cap 1M → 50M and allocation land in the same block
//   node demos/05-curator.mjs --fixed   cap increase pending for 3 days; allocation reverts
import { startChain, stopChains, roles, abis, units, fmt, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "curator-fixed" : "curator", fixed ? "The curator, fixed" : "The curator who moves in one block");
const C = await startChain();
const K = roles.curator;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 18]);
// --fixed only picks which vault contract is deployed.
const vault = fixed ? await C.deploy("timelocked", [usdc, K.address]) : await C.deploy("vault", [usdc, K.address]);
const vabi = fixed ? abis.timelocked : abis.vault;
const risky = "0x000000000000000000000000000000000000dEaD".replace("dEaD", "0b0b"); // a stand-in market address
await C.fund(usdc, roles.lender, units(60_000_000), vault);
await C.send(roles.lender, vault, vabi, "deposit", [units(60_000_000)]);
await C.send(K, vault, vabi, "setCap", [risky, units(1_000_000)]);
if (fixed) { // the starting 1M cap went through the same timelock, days ago
  await C.rpcCall("evm_increaseTime", [3 * 86400]); await C.rpcCall("evm_mine");
  await C.send(K, vault, vabi, "acceptCap", [risky]);
}
t.say(`vault holds ${fmt(await C.balanceOf(usdc, vault))} tUSDC from depositors`);
t.say(`cap on risky market ${short(risky)}: ${fmt(await C.read(vault, vabi, "cap", [risky]))}`);

// The curator sends both transactions together; we mine them as one block.
await C.rpcCall("evm_setAutomine", [false]);
const n = await C.pub.getTransactionCount({ address: K.address });
t.cmd(`curator → setCap(risky, 50,000,000) · allocate(risky, 50,000,000)`);
const h1 = await C.sendNoWait(K, vault, vabi, "setCap", [risky, units(50_000_000)], n);
const h2 = await C.sendNoWait(K, vault, vabi, "allocate", [risky, units(50_000_000)], n + 1);
await C.rpcCall("evm_mine");
await C.rpcCall("evm_setAutomine", [true]);
const [r1, r2] = await Promise.all([h1, h2].map((hash) => C.pub.waitForTransactionReceipt({ hash })));
t.note(`  setCap   block ${r1.blockNumber} · ${r1.status}`);
(r2.status === "success" ? t.bad : t.ok)(`  allocate block ${r2.blockNumber} · ${r2.status === "success" ? "success" : "reverted: above cap"}`);
t.say(`  cap now ${fmt(await C.read(vault, vabi, "cap", [risky]))}`);
if (fixed) {
  const [cap, validAt] = await C.read(vault, vabi, "pendingCap", [risky]);
  const now = (await C.pub.getBlock()).timestamp;
  t.warn(`  pending cap ${fmt(cap)} · executable in ${Number(validAt - now) / 86400} days`);
}
const moved = await C.balanceOf(usdc, risky);
t.big(moved > 0n ? `CAP RAISED AND ${fmt(moved)} MOVED · SAME BLOCK ${r1.blockNumber}` : `PENDING 3 DAYS · 0 MOVED · DEPOSITORS CAN LEAVE`);
t.save(); stopChains(); process.exit(0);
