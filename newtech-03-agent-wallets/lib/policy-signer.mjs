// The fix for attack #1: a signer that is a SEPARATE policy layer, not the prompt.
// The agent can ask it to send value, but the allowlist decision lives here, in code the
// untrusted text can never reach. Caps and human-approval thresholds would live here too.
import { walletFor, pub, parseEther } from "./chain.mjs";

export class PolicyError extends Error {
  constructor(what) { super(what); this.name = "PolicyError"; }
}

/** `allowlist` is a list of lowercased addresses the signer is permitted to pay. */
export function createSigner(account, { allowlist }) {
  const ALLOWLIST = new Set(allowlist.map((a) => a.toLowerCase()));
  return {
    /** tx = { to (lowercased), eth }. Signs and broadcasts only if policy allows. */
    async sendEth(tx) {
      if (!ALLOWLIST.has(tx.to)) throw new PolicyError("recipient");
      const hash = await walletFor(account).sendTransaction({ to: tx.to, value: parseEther(String(tx.eth)) });
      return (await pub.waitForTransactionReceipt({ hash })).transactionHash;
    },
  };
}
