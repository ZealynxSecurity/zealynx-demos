// Local chain for the demos. `startChain` spawns its own anvil, deploys our stand-in
// contracts (simplified ERC-3643-style token, identity registry, price/NAV feeds, vaults)
// and test tokens. Everything is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, BaseError,
  ContractFunctionRevertedError, keccak256, encodeAbiParameters, toHex,
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
];
const acct = KEYS.map((k) => privateKeyToAccount(k));
// admin: the issuer / deployer. reporter: the price-feed key. agent: the token's agent key.
export const roles = {
  admin: acct[0], alice: acct[1], agent: acct[2], attacker: acct[3],
  mallory: acct[4], reporter: acct[5], redeemer: acct[6], other: acct[7],
};

const artifact = (file, name = file) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}.sol/${name}.json`, "utf8"));
const A = Object.fromEntries([
  "TestToken", "IdentityRegistry", "RwaToken", "RwaTokenFixed", "Wrapper", "WrapperFixed",
  "PerpVault", "PerpVaultFixed", "NavFeed", "RedemptionVault", "RedemptionVaultFixed",
  "AsyncRedeem", "AsyncRedeemFixed",
].map((n) => [n, artifact(n)]));
export const abis = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi]));

const running = [];
/** Start a local anvil chain. Returns helpers bound to it. */
export async function startChain({ id = 31337, port = 8545 } = {}) {
  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({ id, name: "local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const proc = spawn("anvil", ["--silent", "--port", String(port), "--chain-id", String(id)], { stdio: "ignore" });
  running.push(proc);
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
  for (let i = 0; ; i++) {
    try { await pub.getBlockNumber(); break; } catch { if (i > 50) throw new Error("anvil did not start"); await new Promise((r) => setTimeout(r, 100)); }
  }
  const walletFor = (from) => createWalletClient({ account: from, chain, transport: http(rpc), pollingInterval: 100 });

  async function deploy(kind, args = [], from = roles.admin) {
    const hash = await walletFor(from).deployContract({ abi: A[kind].abi, bytecode: A[kind].bytecode.object, args });
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
  const balanceOf = (token, who) => read(token, abis.TestToken, "balanceOf", [who]);
  /** Timestamp of the latest block (what the next block builds on). */
  const now = async () => (await pub.getBlock()).timestamp;
  /** Move the local chain's clock forward and mine a block (anvil only). */
  async function increaseTime(seconds) {
    await pub.request({ method: "evm_increaseTime", params: [toHex(seconds)] });
    await pub.request({ method: "evm_mine", params: [] });
  }
  return { pub, deploy, send, attempt, read, balanceOf, now, increaseTime };
}
export function stopChains() { for (const p of running) p.kill(); }

/** A price report signed by the feed key (EIP-191 over keccak256(abi.encode(price, ts)). */
export async function signReport(signer, price, ts) {
  const d = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [price, ts]));
  return { report: { price, ts }, sig: await signer.signMessage({ message: { raw: d } }) };
}

/** Whole-unit amount with thousands separators (exact, from a bigint). */
export const fmt = (v, dec = 18) => {
  const unit = 10n ** BigInt(dec);
  const neg = v < 0n; if (neg) v = -v;
  const whole = (v / unit).toLocaleString("en-US");
  const frac = v % unit;
  return (neg ? "-" : "") + (frac ? `${whole}.${frac.toString().padStart(dec, "0").replace(/0+$/, "")}` : whole);
};
/** Dollar amount from an 18-decimal value, with a fixed number of decimals. */
export const usd = (v, digits = 2) =>
  "$" + (Number(v) / 1e18).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Signed percentage change from a to b, two decimals. */
export const pct = (a, b) => { const p = ((Number(b - a) / Number(a)) * 100).toFixed(2); return `${p > 0 ? "+" : ""}${p === "-0.00" ? "0.00" : p}%`; };
export const units = (n, dec = 18) => BigInt(n) * 10n ** BigInt(dec);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
