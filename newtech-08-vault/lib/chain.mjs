// Local chain for the demos: spawns anvil, deploys our own contracts and test tokens.
// Everything is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, BaseError, ContractFunctionRevertedError,
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
];
const acct = KEYS.map((k) => privateKeyToAccount(k));
// deployer: deploys and runs the oracle. lender: deposits into markets and vaults.
// borrower/attacker: posts collateral and borrows. liquidator: clears bad loans. curator: runs the vault.
export const roles = { deployer: acct[0], lender: acct[1], attacker: acct[2], borrower: acct[2], liquidator: acct[3], curator: acct[4], seller: acct[5] };

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
const A = {
  token: artifact("TestToken.sol", "TestToken"),
  amm: artifact("MockAMM.sol", "MockAMM"),
  feed: artifact("PriceFeed.sol", "PriceFeed"),
  spot: artifact("PriceFeed.sol", "SpotOracle"),
  market: artifact("LendingMarket.sol", "LendingMarket"),
  depegGuard: artifact("DepegGuardMarket.sol", "DepegGuardMarket"),
  capped: artifact("CappedMarket.sol", "CappedMarket"),
  tracked: artifact("TrackedCashMarket.sol", "TrackedCashMarket"),
  breaker: artifact("BreakerMarket.sol", "BreakerMarket"),
  vault: artifact("CuratorVault.sol", "CuratorVault"),
  timelocked: artifact("TimelockedVault.sol", "TimelockedVault"),
};
export const abis = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi]));

let proc;
/** Start a local anvil chain. Returns helpers bound to it. */
export async function startChain({ port = 8545 } = {}) {
  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  proc = spawn("anvil", ["--silent", "--port", String(port)], { stdio: "ignore" });
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 50 });
  for (let i = 0; ; i++) {
    try { await pub.getBlockNumber(); break; } catch { if (i > 50) throw new Error("anvil did not start"); await new Promise((r) => setTimeout(r, 100)); }
  }
  const walletFor = (from) => createWalletClient({ account: from, chain, transport: http(rpc), pollingInterval: 50 });

  async function deploy(kind, args = []) {
    const hash = await walletFor(roles.deployer).deployContract({ abi: A[kind].abi, bytecode: A[kind].bytecode.object, args });
    return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
  }
  async function send(from, address, abi, functionName, args = []) {
    const { request } = await pub.simulateContract({ account: from, address, abi, functionName, args });
    const r = await pub.waitForTransactionReceipt({ hash: await walletFor(from).writeContract(request) });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
    return r;
  }
  /** Send without waiting (for batching several transactions into one block). */
  const sendNoWait = (from, address, abi, functionName, args = [], nonce) =>
    walletFor(from).writeContract({ address, abi, functionName, args, gas: 500_000n, nonce });
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
  const rpcCall = (method, params = []) => pub.request({ method, params });
  /** Mint test tokens and approve a spender in one go. */
  async function fund(token, who, amount, spender) {
    await send(roles.deployer, token, abis.token, "mint", [who.address ?? who, amount]);
    if (spender) await send(who, token, abis.token, "approve", [spender, 2n ** 255n]);
  }
  return { pub, deploy, send, sendNoWait, attempt, read, balanceOf, rpcCall, fund };
}
export function stopChains() { proc?.kill(); }

/** Whole-unit amount with thousands separators (rounded to whole units unless `dp` is set). */
export const fmt = (v, dp = 0) => {
  const n = Number(v) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
/** A price (18 decimals) as dollars. */
export const usd = (v, dp = 2) => `$${fmt(v, dp)}`;
export const units = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
