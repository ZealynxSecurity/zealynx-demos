# Zealynx demos

Runnable code from Zealynx videos and posts: the attacks we show, and the fixes, so you can run them
yourself. One folder per video.

| Folder | Video | What's inside |
|---|---|---|
| [`newtech-01-x402`](newtech-01-x402) | x402 Lets AI Agents Pay for APIs. 5 Ways Your Paid Endpoint Gets Drained. | Replay, weak binding, key drain (the 402bridge pattern), gas abuse and an agent with no budget, each vulnerable and fixed |
| [`newtech-02-genius-stablecoins`](newtech-02-genius-stablecoins) | GENIUS Act to Code: 5 Things Your Stablecoin Contract Must Get Right | Uncapped mint (the Resolv pattern), supply above reserves, a one-path freeze, an unguarded seize and a one-key upgrade, each vulnerable and fixed |
| [`newtech-03-agent-wallets`](newtech-03-agent-wallets) | Your AI Agent Has a Wallet. 5 Ways Someone Empties It | A scripted agent (no LLM) taken over by an encoded post, an airdropped permission badge, a poisoned MCP tool, a key-stealing helper package and an unlimited approval, each vulnerable and fixed |
| [`newtech-04-eip7702`](newtech-04-eip7702) | EIP-7702: 5 Bugs We'd Flag Before You Ship a Delegate Contract | A delegation to a sweeper, an open `execute`, a front-run `initialize`, storage left by the previous delegate and a `tx.origin` check beaten by batching, each vulnerable and fixed |
| [`newtech-05-crosschain`](newtech-05-crosschain) | A $292M Bridge Hack Came Down to One Verifier. 5 Checks Before Launch | A 1-of-1 verifier set, `abi.encodePacked` over variable-length fields, an unbound replayable message, a duplicate key in a signed batch and a bridge with no rate limit, on our own stand-in adapter, each vulnerable and fixed |
| [`newtech-06-rwa`](newtech-06-rwa) | Tokenised RWAs: 5 Checks Before Launch (A Price From the Future Cost $23.75M) | A future-dated signed price report, redemption at a stale NAV, a wrapper that skips compliance, one agent key that force-transfers every holder and async redemptions priced at request time, each vulnerable and fixed |
| [`newtech-07-krait`](newtech-07-krait) | We Built an AI Auditor. Here's What It Missed on Real Protocols | Our AI auditor (Krait v8.2, Claude Code skill) over 18 bugs we planted in our own code, scored against a key sealed before the run, and an AI agent writing a working Foundry exploit for one of them on a local chain |
| [`newtech-08-vault`](newtech-08-vault) | Your Vault Prices Collateral at $1. Here's the Day That Breaks It | A hardcoded $1 oracle, a thin token with no supply cap, a donation-inflated exchange rate, no depeg circuit breaker and a curator who moves in one block, on our own lending market and vault, each vulnerable and fixed |

## Ground rules

- **Local only.** Every demo runs against its own local chain (anvil) with test tokens. Nothing here
  talks to a live network, a real service or a third-party endpoint.
- **Deliberately vulnerable.** This is teaching code, not a library. Don't deploy it.
- Keys in this repo are anvil's public default dev keys. Never fund them on a real network.

Building with any of this and want a second pair of eyes on the design?
[zealynx.io](https://www.zealynx.io/quote?utm_source=github&utm_medium=repo&utm_campaign=demos)

## License

MIT
