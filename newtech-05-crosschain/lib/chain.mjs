// Local chains for the demos. Each `startChain` spawns its own anvil with its own chain id
// (so a message can be tried on "chain B" and on "chain C"), deploys our stand-in contracts
// and test tokens. Everything is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, BaseError,
  ContractFunctionRevertedError, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HERE = new URL("..", import.meta.url).pathname;

// anvil's well-known dev keys (public, test only). Never fund these on a real network.
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
];
const acct = KEYS.map((k) => privateKeyToAccount(k));
// relayer: submits transactions to the adapter (anyone can). attacker: receives what leaks.
// v1..v3: the off-chain verifiers. Their keys sign digests; the adapter checks them.
export const roles = { relayer: acct[1], user: acct[0], attacker: acct[3] };
// Sorted by address: the adapter requires strictly ascending signers (no duplicates).
export const verifiers = [acct[6], acct[7], acct[8]].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));

/** Sign a 32-byte digest as an off-chain verifier (EIP-191 personal sign over the raw digest). */
export const signDigest = (verifier, digest) => verifier.signMessage({ message: { raw: digest } });
/** Signatures from a set of verifiers, ordered by signer address as the adapter expects. */
export const sigsFrom = (set, digest) =>
  Promise.all([...set].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1)).map((v) => signDigest(v, digest)));

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
const A = {
  token: artifact("TestToken.sol", "TestToken"),
  adapter: artifact("Adapter.sol", "Adapter"),
  packed: artifact("PackedAdapter.sol", "PackedAdapter"),
  packedFixed: artifact("PackedAdapterFixed.sol", "PackedAdapterFixed"),
  replay: artifact("ReplayAdapter.sol", "ReplayAdapter"),
  replayFixed: artifact("ReplayAdapterFixed.sol", "ReplayAdapterFixed"),
  rootBook: artifact("RootBook.sol", "RootBook"),
  rootBookFixed: artifact("RootBookFixed.sol", "RootBookFixed"),
  rateLimited: artifact("RateLimitedAdapter.sol", "RateLimitedAdapter"),
};
export const abis = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi]));

const running = [];
/** Start a local anvil chain with its own id and port. Returns helpers bound to that chain. */
export async function startChain({ id = 31337, port = 8545, name = "chain" } = {}) {
  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({ id, name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const proc = spawn("anvil", ["--silent", "--port", String(port), "--chain-id", String(id)], { stdio: "ignore" });
  running.push(proc);
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
  for (let i = 0; ; i++) {
    try { await pub.getBlockNumber(); break; } catch { if (i > 50) throw new Error("anvil did not start"); await new Promise((r) => setTimeout(r, 100)); }
  }
  const walletFor = (from) => createWalletClient({ account: from, chain, transport: http(rpc), pollingInterval: 100 });

  async function deploy(kind, args = []) {
    const hash = await walletFor(roles.relayer).deployContract({ abi: A[kind].abi, bytecode: A[kind].bytecode.object, args });
    return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
  }
  async function send(from, address, abi, functionName, args = []) {
    const { request } = await pub.simulateContract({ account: from, address, abi, functionName, args });
    const r = await pub.waitForTransactionReceipt({ hash: await walletFor(from).writeContract(request) });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
    return r;
  }
  /** Try a call. Sends it if it would succeed; returns the revert reason if it would not. */
  async function attempt(from, address, abi, functionName, args = []) {
    try { await send(from, address, abi, functionName, args); return { ok: true }; } catch (e) {
      const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
      if (!rev) throw e;
      return { ok: false, name: rev.reason ?? rev.data?.errorName ?? "revert" };
    }
  }
  const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
  const balanceOf = (token, who) => read(token, abis.token, "balanceOf", [who]);
  return { id: BigInt(id), name, pub, deploy, send, attempt, read, balanceOf };
}
export function stopChains() { for (const p of running) p.kill(); }

/** Whole-unit amount with thousands separators (exact, from a bigint). */
export const fmt = (v, dec = 18) => {
  const unit = 10n ** BigInt(dec);
  const whole = (v / unit).toLocaleString("en-US");
  const frac = v % unit;
  return frac ? `${whole}.${frac.toString().padStart(dec, "0").replace(/0+$/, "")}` : whole;
};
export const units = (n, dec = 18) => BigInt(n) * 10n ** BigInt(dec);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export { toHex };
