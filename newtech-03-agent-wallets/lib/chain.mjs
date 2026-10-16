// Local chain for the demos: spawns anvil, deploys the test token, badge, tier, router.
// Everything here is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, createTestClient, http, parseUnits, parseEther,
  formatEther, defineChain, BaseError, ContractFunctionRevertedError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HERE = new URL("..", import.meta.url).pathname;
export const RPC = "http://127.0.0.1:8545";
export const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

// anvil's well-known dev keys (public, test only). Never fund these on a real network.
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];
export const accounts = KEYS.map((k) => privateKeyToAccount(k));
export const keyOf = (acct) => KEYS[accounts.indexOf(acct)];
// agent: the AI agent's own wallet (dev key [0], the one attacks try to read/drain).
// owner: the human who deployed the wallet stack. attacker/sink: where stolen value goes.
export const roles = { agent: accounts[0], owner: accounts[1], treasury: accounts[2], attacker: accounts[3], sink: accounts[4] };

// The injected "bad" recipient for attack #1. Not an anvil account; any address can receive ETH.
export const BAD = "0xbad0000000000000000000000000000000000bad";

export const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 100 });
export const walletFor = (acct) => createWalletClient({ account: acct, chain, transport: http(RPC), pollingInterval: 100 });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
const A = {
  usdc: artifact("TestUSDC.sol", "TestUSDC"),
  badge: artifact("Badge.sol", "Badge"),
  tier: artifact("Tier.sol", "Tier"),
  tierFixed: artifact("TierFixed.sol", "TierFixed"),
  router: artifact("Router.sol", "Router"),
};
export const abis = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi]));

let anvil;
export async function startChain() {
  anvil = spawn("anvil", ["--silent", "--port", "8545"], { stdio: "ignore" }); // automine: one block per tx
  for (let i = 0; i < 50; i++) {
    try { await pub.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("anvil did not start");
}
export function stopChain() { anvil?.kill(); }

export async function deploy(name, args = [], from = roles.owner) {
  const hash = await walletFor(from).deployContract({ abi: A[name].abi, bytecode: A[name].bytecode.object, args });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
}

/** Send a transaction and wait for it. Throws on revert. */
export async function send(from, address, abi, functionName, args = []) {
  const { request } = await pub.simulateContract({ account: from, address, abi, functionName, args });
  const hash = await walletFor(from).writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}

/** Try a call as `from`. Sends it if it would succeed; returns the custom error if it would revert. */
export async function attempt(from, address, abi, functionName, args = []) {
  try {
    await send(from, address, abi, functionName, args);
    return { ok: true };
  } catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    if (!rev) throw e;
    return { ok: false, name: rev.data?.errorName ?? rev.reason ?? "revert", args: rev.data?.args ?? [] };
  }
}

export const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
export const ethBalance = (addr) => pub.getBalance({ address: addr });
export const setEth = (addr, eth) => testClient.setBalance({ address: addr, value: parseEther(String(eth)) });

/** 6-decimal amount, whole units with thousands separators (exact, from a bigint). */
export const fmt = (v) => {
  const whole = (v / 1_000_000n).toLocaleString("en-US");
  const frac = v % 1_000_000n;
  return frac ? `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}` : whole;
};
export const fmtEth = (v) => Number(formatEther(v)).toFixed(2);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export { parseUnits, parseEther };
