// Runs every demo in both modes and records a cast for each (casts/*.raw.json).
// Each demo starts and stops its own local anvil chain.
import { execFileSync } from "node:child_process";
const demos = ["01-replay", "02-binding", "03-key-drain", "04-gas", "05-agent-cap"];
for (const d of demos) for (const mode of [[], ["--fixed"]]) {
  process.stdout.write(`\n===== ${d} ${mode[0] ?? "(vulnerable)"}\n`);
  execFileSync("node", [`demos/${d}.mjs`, ...mode], { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });
}
