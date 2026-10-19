// Runs every demo in both modes and records a cast for each (casts/*.raw.json).
// Each demo starts and stops its own local anvil chain.
import { execFileSync } from "node:child_process";
const demos = ["01-future", "02-stalenav", "03-wrapper", "04-agent", "05-async"];
for (const d of demos) for (const mode of [[], ["--fixed"]]) {
  process.stdout.write(`\n===== ${d} ${mode[0] ?? "(vulnerable)"}\n`);
  execFileSync("node", [`demos/${d}.mjs`, ...mode], { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });
}
