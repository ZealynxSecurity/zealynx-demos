// Attack #2: a cheap payment opens an expensive route, when the server checks the
// payment against the terms the request carries instead of the route's own price.
//   node demos/02-binding.mjs           server trusts request-carried terms
//   node demos/02-binding.mjs --fixed   server checks the route's price, recipient, expiry
import { startChain, stopChain, setup, roles, usdcBalance, fmtUsdc } from "../lib/chain.mjs";
import { createFacilitator } from "../lib/facilitator.mjs";
import { createResourceServer } from "../lib/server.mjs";
import { requirements, signPayment, encode } from "../lib/x402.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "x402-binding-fixed" : "x402-binding", "Binding");
await startChain();
const { usdc } = await setup();
const fac = createFacilitator({ usdc }); await fac.listen();
const srv = createResourceServer({ usdc, payTo: roles.seller.address, facilitatorUrl: fac.url, binding: fixed ? "route-terms" : "trust-payment" }); await srv.listen();
const before = await usdcBalance(usdc, roles.seller.address);

t.cmd("node client.mjs --pay-for /cheap --use-on /premium");
const cheap = requirements({ resource: "/cheap", price: 1_000n, payTo: roles.seller.address, usdc });
const header = encode(await signPayment(roles.buyer, cheap));
t.note("signed a payment for /cheap:     $0.001 USDC");
t.note("sending it to       /premium:    price $5.00 USDC");
const r = await fetch(srv.url + "/premium", { headers: { "x-payment": header } });
const body = await r.json();
r.status === 200 ? t.ok(`200 OK   ${JSON.stringify(body)}`) : t.bad(`402      ${body.error}`);
const paid = (await usdcBalance(usdc, roles.seller.address)) - before;
t.say("");
t.big(`PREMIUM SERVED: ${r.status === 200 ? "YES" : "NO"}    seller received $${fmtUsdc(paid)} of $5.00`);
t.save(); await srv.close(); await fac.close(); stopChain(); process.exit(0);
