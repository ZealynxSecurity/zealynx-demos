// Runs every demo in both modes and records a cast for each (casts/*.raw.json).
// Each demo starts and stops its own local anvil chain(s).
import { execFileSync } from "node:child_process";
const demos = ["01-onev", "02-packed", "03-replay", "04-dupe", "05-ratelimit"];
for (const d of demos) for (const mode of [[], ["--fixed"]]) {
  process.stdout.write(`\n===== ${d} ${mode[0] ?? "(vulnerable)"}\n`);
  execFileSync("node", [`demos/${d}.mjs`, ...mode], { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });
}
