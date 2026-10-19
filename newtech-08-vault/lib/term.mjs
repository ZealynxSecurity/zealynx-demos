// Terminal output for the demos. Prints with ANSI colour and records every line
// with its time offset, so the video renderer can replay it paced to the voice.
import { writeFileSync, mkdirSync } from "node:fs";

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m", reset: "\x1b[0m" };
export const color = (c, s) => `${C[c]}${s}${C.reset}`;

export function session(id, title) {
  const t0 = Date.now();
  const events = [];
  const out = (text) => { process.stdout.write(text + "\n"); events.push({ t: Date.now() - t0, text }); };
  return {
    cmd: (s) => out(color("dim", "$ ") + s),
    say: (s) => out(s),
    ok: (s) => out(color("green", s)),
    bad: (s) => out(color("red", s)),
    warn: (s) => out(color("yellow", s)),
    note: (s) => out(color("dim", s)),
    big: (s) => out(color("bold", s)),
    /** A line that updates in place (counters). The renderer shows only the latest value. */
    tick: (key, s) => { process.stdout.write(`\r${s}`); events.push({ t: Date.now() - t0, key, text: s }); },
    end: (s) => { process.stdout.write("\n"); if (s) out(s); },
    save: () => {
      mkdirSync(new URL("../casts/", import.meta.url), { recursive: true }); // gitignored, absent on a fresh clone
      writeFileSync(new URL(`../casts/${id}.raw.json`, import.meta.url), JSON.stringify({ id, title, events }, null, 1));
    },
  };
}
