// A paid API behind x402. Two routes: /cheap ($0.001) and /premium ($5).
// Modes (each demo picks one):
//   order:   "serve-then-settle" (vulnerable, attack #1) | "reserve-settle-serve" (fixed)
//   binding: "trust-payment"     (vulnerable, attack #2) | "route-terms"          (fixed)
import { createServer } from "node:http";
import { requirements, decode } from "./x402.mjs";

export function createResourceServer({ usdc, payTo, facilitatorUrl, order = "reserve-settle-serve", binding = "route-terms", port = 4020 }) {
  const ROUTES = { "/cheap": 1_000n, "/premium": 5_000_000n }; // 6 decimals: $0.001 and $5
  const stats = { served: 0, refused: 0 };
  const reserved = new Set(); // payment IDs taken by an in-flight or settled request
  const post = (path, body) => fetch(facilitatorUrl + path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

  const server = createServer(async (rq, rs) => {
    const price = ROUTES[rq.url];
    if (price === undefined) return rs.writeHead(404).end();
    const req = requirements({ resource: rq.url, price, payTo, usdc });
    const refuse = (reason) => { stats.refused++; rs.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify({ error: reason, accepts: [req] })); };
    const header = rq.headers["x-payment"];
    if (!header) return refuse("payment required");
    const payment = decode(header);
    const a = payment.payload.authorization;

    // Attack #2: checking the payment against ITSELF instead of this route's price.
    const terms = binding === "trust-payment" ? { ...req, payTo: a.to, maxAmountRequired: a.value } : req;

    if (order === "reserve-settle-serve") {
      const id = `${a.from}:${a.nonce}`;
      if (reserved.has(id)) return refuse("payment already used"); // atomic: no await before this line
      reserved.add(id);
      const v = await post("/verify", { payment, requirements: terms });
      if (!v.isValid) { reserved.delete(id); return refuse(v.reason); }
      const s = await post("/settle", { payment });
      if (!s.success) { reserved.delete(id); return refuse(s.reason); }
    } else {
      // Attack #1: verify, serve now, settle later. Every concurrent copy passes verify.
      const v = await post("/verify", { payment, requirements: terms });
      if (!v.isValid) return refuse(v.reason);
      setTimeout(() => post("/settle", { payment }).catch(() => {}), 1500);
    }
    stats.served++;
    rs.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ route: rq.url, data: rq.url === "/premium" ? "premium market data" : "basic data" }));
  });
  return {
    stats, url: `http://127.0.0.1:${port}`,
    listen: () => new Promise((r) => server.listen(port, r)),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
