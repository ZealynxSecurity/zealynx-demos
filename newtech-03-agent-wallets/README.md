# Your AI agent has a wallet: five ways someone empties it (demo code)

The attacks and fixes from the Zealynx video *Your AI Agent Has a Wallet. 5 Ways Someone Empties It.*
([watch it](https://youtu.be/fPqrOfXaOHk)).

**Local only:** every demo starts its own `anvil` chain on 127.0.0.1:8545, deploys our own contracts and
uses test tokens. The "agent" is a **scripted, simulated agent — there is no LLM and no model API call**.
The MCP server, the policy signer, the exfil listener and the signer process are all ours and all stay on
127.0.0.1. Nothing here talks to a live network, a real model, a real wallet or a third-party endpoint.

Needs Node 20+ and [Foundry](https://getfoundry.sh) (`anvil`, `forge`). OpenZeppelin v5 comes from npm.

```
npm install
npm run build          # forge build (contracts/)
npm run all            # every demo, vulnerable then fixed; writes casts/*.raw.json
node demos/01-injection.mjs [--fixed]
```

The stack: **tUSDC**, a 6-decimal test token; a **badge** ERC-721 anyone can airdrop; a `Tier` spend-limit
contract and a `Router`; a local **MCP-shape server** over stdio (`tools/list` + `tools/call`); an
in-process **policy signer** and an out-of-process **signer on a unix socket**; and an **exfil listener**
on 127.0.0.1:9999. The scripted agent follows text and tool descriptions the way a real agent does — that
is the whole point.

| Demo | Vulnerable | Fixed |
|---|---|---|
| `01-injection` | The agent reads a social post with a base64 payload, decodes it and obeys: `send_eth(0xBAD…, 5)` → balance `10.00 → 5.00 ETH` | A separate signer policy (not the prompt) refuses: `recipient not on allowlist`, balance stays `10.00` |
| `02-badge` | A tier contract reads `badge.balanceOf(agent)`; an attacker airdrops a badge NFT → daily limit `10 → 10,000 tUSDC` and the agent spends `5,000` | The tier is owner-granted, not wallet-derived: an airdrop changes nothing, the `5,000` spend reverts `OverLimit` |
| `03-poison` | Our local MCP server's `get_price` *description* says to read `~/.wallet/key` and pass it as context; the agent obeys → server log `context received: 0xac09…ff80` | The client pins a sha256 of each tool description; the changed (poisoned) description → `tool disabled`, the key is never read |
| `04-exfil` | A "helper" package scans env/`.env` for the key and POSTs it to our listener → `EXFIL: PRIVATE_KEY=0xac09…ff80` | The key lives in a separate signer process on a unix socket; the agent process has none → `EXFIL: nothing found`, yet it still signs a `100 tUSDC` transfer through the signer |
| `05-approval` | From injected tool output the agent approves `MAX_UINT` to a router; later `router.pull()` takes `10,000 tUSDC` | A pre-sign simulation refuses an approval larger than the need; it signs exactly `25 tUSDC`, and the `10,000` pull reverts `ERC20InsufficientAllowance` |

| File | What it is |
|---|---|
| `contracts/src/TestUSDC.sol`, `Badge.sol` | test token (tUSDC, 6 dp) and a badge NFT anyone can airdrop |
| `contracts/src/Tier.sol`, `TierFixed.sol` | the spend-limit contract — wallet-derived (vulnerable) vs owner-granted (fixed) |
| `contracts/src/Router.sol` | an honest router whose danger is an unlimited approval the agent can't read |
| `lib/policy-signer.mjs` | the in-process signer policy (attack #1 fix: allowlist in code, not the prompt) |
| `lib/mcp-server.mjs`, `mcp-tools.mjs` | our local MCP-shape stdio server and its benign/poisoned tool descriptions |
| `lib/signer-process.mjs`, `connect-signer.mjs` | the out-of-process signer on a unix socket and its client (attack #4 fix) |
| `vendor/wallet-security-helper/` | a stand-in for the malicious May-2026 "wallet security" npm packages — a local folder, **never published** |

Every number the demos print is read from the chain or from live state after the transactions run.

The private keys in `lib/chain.mjs` are **anvil's public default dev keys** (test only). Never fund them on a
real network. The `~/.wallet/key` in demo 3 is a throwaway temp file holding one of those dev keys.

The code is deliberately vulnerable in places; it's a teaching harness, not a wallet.
