# Zealynx demos

Runnable code from Zealynx videos and posts: the attacks we show, and the fixes, so you can run them
yourself. One folder per video.

| Folder | Video | What's inside |
|---|---|---|
| [`newtech-01-x402`](newtech-01-x402) | x402 Lets AI Agents Pay for APIs. 5 Ways Your Paid Endpoint Gets Drained. | Replay, weak binding, key drain (the 402bridge pattern), gas abuse and an agent with no budget, each vulnerable and fixed |
| [`newtech-02-genius-stablecoins`](newtech-02-genius-stablecoins) | GENIUS Act to Code: 5 Things Your Stablecoin Contract Must Get Right | Uncapped mint (the Resolv pattern), supply above reserves, a one-path freeze, an unguarded seize and a one-key upgrade, each vulnerable and fixed |

## Ground rules

- **Local only.** Every demo runs against its own local chain (anvil) with test tokens. Nothing here
  talks to a live network, a real service or a third-party endpoint.
- **Deliberately vulnerable.** This is teaching code, not a library. Don't deploy it.
- Keys in this repo are anvil's public default dev keys. Never fund them on a real network.

Building with any of this and want a second pair of eyes on the design?
[zealynx.io](https://www.zealynx.io/quote?utm_source=github&utm_medium=repo&utm_campaign=demos)

## License

MIT
