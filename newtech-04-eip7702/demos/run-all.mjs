// Runs every demo in both modes and records a cast for each (casts/*.raw.json).
// Each demo starts and stops its own local anvil chain (on the Prague hardfork).
import { execFileSync } from "node:child_process";
const demos = ["01-sweeper", "02-execute", "03-initfront", "04-collision", "05-origin"];
for (const d of demos) for (const mode of [[], ["--fixed"]]) {
  process.stdout.write(`\n===== ${d} ${mode[0] ?? "(vulnerable)"}\n`);
  execFileSync("node", [`demos/${d}.mjs`, ...mode], { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });
}
