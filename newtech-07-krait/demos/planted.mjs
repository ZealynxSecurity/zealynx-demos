// Replays the Krait run over the planted corpus as a cast, scored against the sealed answer key.
// Every line comes from run/krait-findings.json (Krait's own output), planted-bugs.md (the key,
// sealed before the run) and run/score.json (the hand scoring, with reasons).
import { readFileSync } from "node:fs";
import { session } from "../lib/term.mjs";

const HERE = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, HERE), "utf8");
const out = JSON.parse(read("run/krait-findings.json"));
const score = JSON.parse(read("run/score.json"));
const key = Object.fromEntries(read("planted-bugs.md").split("\n")
  .filter((l) => /^\| P\d\d /.test(l)).map((l) => l.split("|").map((c) => c.trim()))
  .map((c) => [c[1], { file: c[2], cls: c[4].replaceAll("`", "") }]));

const t = session("planted", "Our AI auditor on 18 planted bugs");
const mins = (Date.parse(score.run.finished) - Date.parse(score.run.started)) / 60000;
t.cmd(`/krait src/     # 20 files, 476 lines, answer key kept out of the folder`);
t.note(`  done in ${mins.toFixed(0)} min · ${out.findings.length} findings + ${out.lowFindings.length} low`);
for (const f of [...out.findings, ...out.lowFindings]) {
  const sev = (f.severity ?? "low").toUpperCase().padEnd(8);
  t.say(`  ${sev} ${f.title.slice(0, 62)}`);
}
t.cmd(`score against the sealed key (18 planted bugs)`);
let found = 0, low = 0;
for (const [id, s] of Object.entries(score.planted)) {
  const k = key[id];
  if (s.found) { found++; if (s.low) low++; t.ok(`  ✓ ${id} ${k.cls.slice(0, 48).padEnd(48)} ${s.low ? "(low)" : ""}`); }
  else t.bad(`  ✗ ${id} ${k.cls.slice(0, 48).padEnd(48)} ${s.partial ? "MISSED (half found)" : "MISSED"}`);
}
const missed = Object.keys(score.planted).length - found;
t.note(`  strict scoring by us · ${low} of the found only at low · ${Object.keys(score.outsideKey).length} findings outside the key`);
t.big(`FOUND ${found} OF 18 · MISSED ${missed} · NO WARNING ON THE REPORT`);
t.save(); process.exit(0);
