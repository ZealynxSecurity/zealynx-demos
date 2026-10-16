// Minimal x402 "exact" EVM scheme: 402 payment requirements, an EIP-3009
// TransferWithAuthorization signed by the payer, carried base64 in X-PAYMENT.
// The signature covers from, to, value, validAfter, validBefore, nonce. It does
// NOT cover the resource URL or the price of the route being called: binding
// the payment to the route is the server's job (attack #2).
import { toHex } from "viem";
import { randomBytes } from "node:crypto";
import { chain } from "./chain.mjs";

export function requirements({ resource, price, payTo, usdc }) {
  return { scheme: "exact", network: "anvil", maxAmountRequired: String(price), resource, payTo, asset: usdc, maxTimeoutSeconds: 60 };
}

export async function signPayment(account, req, { value = req.maxAmountRequired, nonce } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const authorization = { from: account.address, to: req.payTo, value: String(value), validAfter: String(now - 600), validBefore: String(now + 600), nonce: nonce ?? toHex(randomBytes(32)) };
  const signature = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: chain.id, verifyingContract: req.asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" } ] },
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  return { x402Version: 1, scheme: "exact", network: "anvil", payload: { signature, authorization } };
}

export const encode = (p) => Buffer.from(JSON.stringify(p)).toString("base64");
export const decode = (h) => JSON.parse(Buffer.from(h, "base64").toString("utf8"));
