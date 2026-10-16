// The wallet-side fix for attack #1. A real policy that runs before the wallet will
// sign an EIP-7702 authorization. It refuses two things the phishing flow depends on:
//   - chainId 0 (an authorization valid on EVERY chain), and
//   - any delegate that is not on the wallet's own allowlist.
// The allowlist lives in the wallet's code, not in whatever the user was asked to sign.
export class PolicyError extends Error {}

export function makeWalletSigner(account, { allowlist = [] } = {}) {
  const trusted = new Set(allowlist.map((a) => a.toLowerCase()));
  return {
    /** Refuses or signs. `chainId` may be a number or bigint; 0 means "every chain". */
    async signDelegation({ chainId, delegate, nonce }) {
      if (Number(chainId) === 0 || !trusted.has(delegate.toLowerCase())) {
        throw new PolicyError(`delegate not on allowlist (chainId ${Number(chainId)})`);
      }
      return account.signAuthorization({ chainId: Number(chainId), nonce, address: delegate });
    },
    isTrusted: (delegate) => trusted.has(delegate.toLowerCase()),
  };
}
