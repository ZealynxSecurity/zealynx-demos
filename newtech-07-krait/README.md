# What an AI auditor misses (demo code and run)

The demos from the Zealynx video *We Built an AI Auditor. Here's What It Missed on Real
Protocols* ([watch it](https://youtu.be/QlAjVUmC96g)).

Two things are here, both on our own code only:

1. **`planted`**: our AI auditor, Krait (v8.2, run as the Claude Code skill `/krait`), over a
   corpus of 20 files from our earlier New Tech demos with **18 bugs planted on purpose**. The
   answer key, `planted-bugs.md`, was sealed before the run and kept out of the folder Krait saw.
   Result, scored strictly by us (`run/score.json` gives the reason for every call): **13 of 18 found**
   (2 of them only at Low), 5 missed (P08 half found), 3 findings outside the key.
   Note: Krait's published benchmark (v8, contests 46-50: 10 true, 0 false, 66 judged bugs) ran
   through its CLI harness. This run is a later version on a different surface.
2. **`exploit`**: an AI agent (headless Claude Code) given one planted bug as a lead (the replay
   bug in `ReplayAdapter.sol`) writes a Foundry exploit test and runs it against a local anvil
   chain. One signed release of 5,000 tokens pays out 25,000.

| Path | What it is |
|---|---|
| `corpus/` | the audited code (Foundry project). Comments stripped so no header names a bug |
| `planted-bugs.md` | the sealed answer key: 18 planted bugs, one per root cause |
| `run/krait-report.md`, `run/krait-findings.json` | Krait's own output, unedited |
| `run/score.json` | our hand scoring against the key, with a reason for every miss and every finding outside the key |
| `exploit/Exploit.t.sol`, `exploit/session.json` | the agent's exploit test and a log of its tool calls and forge output |
| `demos/planted.mjs`, `demos/exploit.mjs` | replay both runs as terminal casts for the video (`npm run all`) |
| `workflow/` | the three workflow snippets shown in the video (regression test, exploit-test gate, AI review in CI). Illustrative, not compiled against this repo |

Setup: the corpus borrows OpenZeppelin from the sibling `newtech-06-rwa` folder, so run `npm install` there first, then `forge build` in `corpus/`.

Re-run Krait yourself: install it (github.com/ZealynxSecurity/krait), open Claude Code in
`corpus/` and run `/krait src/`. Results vary between runs and versions; score them against
`planted-bugs.md` the same way.

Local only. No live network, no third-party contracts. The exploit test uses throwaway keys from
`vm.addr` on a local chain.
