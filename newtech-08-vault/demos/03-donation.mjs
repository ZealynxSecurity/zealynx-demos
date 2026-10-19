// Attack #3: the donation that inflates the rate. Our market sets its share exchange rate from
// its own token balance, so a plain transfer to the market lifts the rate for every share.
//   node demos/03-donation.mjs           rate from balanceOf: 1.0 → 40.0
//   node demos/03-donation.mjs --fixed   rate from tracked cash: stays 1.0
import { startChain, stopChains, roles, abis, units, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "donation-fixed" : "donation", fixed ? "The donation, fixed" : "The donation that inflates the rate");
const C = await startChain();
const A = roles.attacker;

const usdc = await C.deploy("token", ["Test USDC", "tUSDC", 18]);
const thin = await C.deploy("token", ["Thin Token", "THIN", 18]);
const feed = await C.deploy("feed", [units(1)]);
// --fixed only picks which market contract is deployed.
const market = fixed ? await C.deploy("tracked", [thin, usdc, feed]) : await C.deploy("market", [thin, usdc, feed]);
const mabi = fixed ? abis.tracked : abis.market;
const rate = async () => fmt(await C.read(market, mabi, "exchangeRate"), 1);

await C.fund(thin, A, units(40_000), market);
t.cmd(`attacker supplies 1,000 THIN`);
await C.send(A, market, mabi, "supply", [units(1_000)]);
t.say(`  shares ${fmt(await C.read(market, mabi, "shares", [A.address]))} · exchange rate ${await rate()}`);

t.cmd(`attacker transfers 39,000 THIN straight to the market (no supply call)`);
await C.send(A, thin, abis.token, "transfer", [market, units(39_000)]);
t.note(`  market THIN balance ${fmt(await C.balanceOf(thin, market))}${fixed ? ` · tracked cash ${fmt(await C.read(market, mabi, "cash"))}` : ""}`);
const r = await C.read(market, mabi, "exchangeRate");
(r > units(1) ? t.bad : t.ok)(`  exchange rate ${await rate()}`);
t.say(`  each share now counts as ${fmt(r, 1)} THIN of collateral`);
t.big(r > units(1) ? `ONE TRANSFER · RATE 1.0 → ${fmt(r, 1)}` : `SAME TRANSFER · RATE STAYS ${fmt(r, 1)}`);
t.save(); stopChains(); process.exit(0);
