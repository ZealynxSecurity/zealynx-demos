// A self-hosted x402 facilitator: /verify checks a payment, /settle submits it on
// chain and pays the gas. Modes are switched per demo:
//   simulate: false  -> settle sends the tx blind (gas-abuse demo, attack #4)
//   simulate: true   -> settle dry-runs first and refuses anything that would revert
import { createServer } from "node:http";
import { verifyTypedData, parseSignature } from "viem";
import { pub, walletFor, roles, abis, chain } from "./chain.mjs";

export function createFacilitator({ usdc, simulate = true, port = 4021, gasPrice }) {
  const wallet = walletFor(roles.facilitator);
  const stats = { verified: 0, settled: 0, reverted: 0 };

  async function verify(payment, req) {
    const a = payment?.payload?.authorization;
    if (!a) return { isValid: false, reason: "malformed" };
    const ok = await verifyTypedData({
      address: a.from,
      domain: { name: "USD Coin", version: "2", chainId: chain.id, verifyingContract: usdc },
      types: { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" } ] },
      primaryType: "TransferWithAuthorization",
      message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
      signature: payment.payload.signature,
    }).catch(() => false);
    if (!ok) return { isValid: false, reason: "invalid signature" };
    // Binding: the payment must be for THIS route's terms (if the caller passes them honestly).
    if (a.to.toLowerCase() !== req.payTo.toLowerCase()) return { isValid: false, reason: "wrong recipient" };
    if (BigInt(a.value) < BigInt(req.maxAmountRequired)) return { isValid: false, reason: "amount too low" };
    // Stateless: "unused" means unused ON CHAIN right now. Not reserved, not in flight.
    const used = await pub.readContract({ address: usdc, abi: abis.usdc, functionName: "authorizationState", args: [a.from, a.nonce] });
    if (used) return { isValid: false, reason: "authorization already used" };
    stats.verified++;
    return { isValid: true };
  }

  // One sender wallet: queue on-chain sends so concurrent settlements don't collide on nonces.
  let queue = Promise.resolve();
  const settle = (payment) => { const run = queue.then(() => settleNow(payment)); queue = run.catch(() => {}); return run; };

  async function settleNow(payment) {
    const a = payment.payload.authorization;
    let v, r, s;
    try { ({ v, r, s } = parseSignature(payment.payload.signature)); } catch { return { success: false, reason: "malformed signature" }; }
    const args = [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, Number(v), r, s];
    if (simulate) {
      try { await pub.simulateContract({ account: wallet.account, address: usdc, abi: abis.usdc, functionName: "transferWithAuthorization", args }); }
      catch (e) { return { success: false, reason: "refused: would revert" }; }
    }
    // Passing `gas` skips estimation, so a doomed tx is still sent and paid for.
    let rcpt, hash;
    try {
      hash = await wallet.writeContract({ address: usdc, abi: abis.usdc, functionName: "transferWithAuthorization", args, gas: 120_000n, ...(gasPrice ? { gasPrice } : {}) });
      rcpt = await pub.waitForTransactionReceipt({ hash });
    } catch (e) { stats.reverted++; return { success: false, reason: "send failed: " + (e.shortMessage ?? e.message).split("\n")[0] }; }
    if (rcpt.status === "success") { stats.settled++; return { success: true, tx: hash }; }
    stats.reverted++;
    return { success: false, reason: "reverted on chain", gasUsed: rcpt.gasUsed };
  }

  const server = createServer(async (rq, rs) => {
    let body = ""; for await (const c of rq) body += c;
    const msg = body ? JSON.parse(body) : {};
    const res = rq.url === "/verify" ? await verify(msg.payment, msg.requirements)
      : rq.url === "/settle" ? await settle(msg.payment) : { error: "not found" };
    rs.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(res, (k, v) => typeof v === "bigint" ? v.toString() : v));
  });
  return {
    stats, verify, settle,
    /** Resolves once every queued settlement has finished. */
    idle: () => queue,
    url: `http://127.0.0.1:${port}`,
    listen: () => new Promise((r) => server.listen(port, r)),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
