# x402: five ways a paid endpoint gets drained (demo code)

The attacks and fixes from the Zealynx video *x402 Lets AI Agents Pay for APIs. 5 Ways Your Paid Endpoint
Gets Drained.* (on the Zealynx YouTube channel).

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545, deploys test contracts and
uses test tokens. Nothing here talks to a live network, a real facilitator or a third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`).

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-replay.mjs [--fixed]
```

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-replay` | One signed payment sent 20× at once to a server that verifies, serves, then settles later: 20 served, 1 paid | Payment ID reserved atomically, settled before serving: 1 served |
| `02-binding` | Server checks the payment against the terms the request carries: a $0.001 payment opens the $5 route | Server checks the route's own price, recipient and expiry: refused |
| `03-key-drain` | The 402bridge pattern: the owner key in `server/.env` leaks; ownership moves; every over-approved user is drained | No owner path to user funds, exact approvals: both theft routes revert |
| `04-gas` | The facilitator sponsors gas and settles blind: 30 junk payments revert on chain at its expense | Dry-run first, refuse anything that would revert: nothing sent |
| `05-agent-cap` | A simulated (scripted, no LLM) agent pays a tool that keeps saying "payment not received" | A wallet-enforced budget ($1/session): the third payment is refused |

Implements x402 v1 (`X-PAYMENT` header, `exact` scheme, EIP-3009 `transferWithAuthorization`).
The code is deliberately vulnerable in places; it's a teaching harness, not a library.

The private keys in `lib/chain.mjs` are anvil's public default dev keys. Never fund them on a real network.
