// Attack #5: a mint "limited to one per call" with require(tx.origin == msg.sender),
// meant as "a human, calling directly". A delegated EOA batches 50 mints into one
// transaction it sends itself — so tx.origin == msg.sender holds on every call.
//   node demos/05-origin.mjs           50 mints land in one transaction
//   node demos/05-origin.mjs --fixed   a per-address limit holds → 1 mints, 49 revert
import { encodeFunctionData } from "viem";
import { startChain, stopChain, deploy, roles, abis, delegate, sendRaw, read, short } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "origin-fixed" : "origin", fixed ? "tx.origin limit, fixed" : "tx.origin limit");
await startChain();

const minter = fixed ? await deploy("mintFixed") : await deploy("mintVuln");
const minterAbi = fixed ? abis.mintFixed : abis.mintVuln;
const batch = await deploy("batch");
const eoa = roles.minter; // a fresh EOA that will batch-mint

t.say(`a mint that means "one per human, called directly"`);
t.note(fixed ? `mint limits one per address` : `mint guards with require(tx.origin == msg.sender)`);

// The EOA delegates to the batch delegate, then sends ITS OWN transaction calling
// batchMint — so tx.origin is the EOA, the same as msg.sender inside each mint().
await delegate(eoa, batch);
t.note(`EOA ${short(eoa.address)} delegated to the batcher ${short(batch)}`);
t.cmd(`EOA self-tx → batchMint(mint, 50)   # one transaction`);
await sendRaw(eoa, { to: eoa.address, data: encodeFunctionData({ abi: abis.batch, functionName: "batchMint", args: [minter, 50n] }) });

const minted = await read(minter, minterAbi, "minted", [eoa.address]);
const reverted = 50n - minted;
if (fixed) t.ok(`  ✓ per-address limit held: ${minted} minted, ${reverted} reverted`);
else t.bad(`  ✗ ${minted} mints in a single transaction`);

t.big(fixed ? `${minted} MINTED, ${reverted} REVERTED` : `${minted} MINTED IN 1 TX`);
t.save(); stopChain(); process.exit(0);
