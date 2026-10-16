// Local chain for the demos: spawns anvil, deploys zUSD (behind a UUPS proxy), the
// test collateral, the mock reserve feed, the minter and, for the fixed runs, a
// 24-hour timelock. Everything here is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, createTestClient, http, parseUnits, defineChain, encodeFunctionData, getContractAddress, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HERE = new URL("..", import.meta.url).pathname;
export const RPC = "http://127.0.0.1:8545";
export const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

// anvil's well-known dev keys (public, test only).
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
];
export const accounts = KEYS.map((k) => privateKeyToAccount(k));
// admin: the issuer's admin EOA (vulnerable: holds every power). ops: treasury minter.
// service: the minter's off-chain service key. multisig: proposes to the timelock (fixed runs).
export const roles = { admin: accounts[0], ops: accounts[1], service: accounts[2], attacker: accounts[3], victim: accounts[4], spender: accounts[5], multisig: accounts[6] };

export const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 100 });
export const walletFor = (acct) => createWalletClient({ account: acct, chain, transport: http(RPC), pollingInterval: 100 });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
const A = {
  usdc: artifact("TestUSDC.sol", "TestUSDC"),
  feed: artifact("MockReserveFeed.sol", "MockReserveFeed"),
  zusd: artifact("ZUSD.sol", "ZUSD"),
  zusdFixed: artifact("ZUSDFixed.sol", "ZUSDFixed"),
  evil: artifact("ZUSD.sol", "EvilZUSD"),
  minter: artifact("Minter.sol", "Minter"),
  minterFixed: artifact("Minter.sol", "MinterFixed"),
  proxy: artifact("ERC1967Proxy.sol", "ERC1967Proxy"),
  timelock: artifact("TimelockController.sol", "TimelockController"),
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

export async function deploy(name, args = [], from = roles.admin) {
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

/** Move anvil's clock forward and mine a block. */
export async function warp(seconds) {
  await testClient.increaseTime({ seconds });
  await testClient.mine({ blocks: 1 });
}
export const now = async () => (await pub.getBlock()).timestamp;

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const implementationOf = async (proxy) => "0x" + (await pub.getStorageAt({ address: proxy, slot: IMPL_SLOT })).slice(26);

const ZERO = "0x0000000000000000000000000000000000000000";
export const DELAY = 86_400; // timelock delay, 24 hours

/**
 * Deploy the stack. `fixed` picks ZUSDFixed/MinterFixed and puts admin, enforcement and
 * upgrades behind a 24h TimelockController proposed by the multisig. `minter` picks who
 * holds MINTER_ROLE: "contract" (the two-step minter) or "ops" (a treasury EOA).
 * `reserve` is what the feed attests at deploy time.
 */
export async function setup({ fixed = false, minter = "ops", reserve = 10_000_000 } = {}) {
  const usdc = await deploy("usdc");
  const feed = await deploy("feed");
  await send(roles.admin, feed, abis.feed, "attest", [parseUnits(String(reserve), 6)]);
  const impl = await deploy(fixed ? "zusdFixed" : "zusd");
  const tokenAbi = fixed ? abis.zusdFixed : abis.zusd;
  const timelock = fixed ? await deploy("timelock", [BigInt(DELAY), [roles.multisig.address], [roles.multisig.address], ZERO]) : undefined;
  // The minter contract needs the token address and the token needs the minter: predict the
  // minter's address (deployed right after the proxy) so the proxy is initialized in its constructor.
  const nonce = await pub.getTransactionCount({ address: roles.admin.address });
  const minterAddr = minter === "contract" ? getContractAddress({ from: roles.admin.address, nonce: BigInt(nonce + 1) }) : undefined;
  const minterRole = minterAddr ?? roles.ops.address;
  const init = fixed
    ? encodeFunctionData({ abi: tokenAbi, functionName: "initialize", args: [timelock, feed, minterRole, roles.admin.address] })
    : encodeFunctionData({ abi: tokenAbi, functionName: "initialize", args: [roles.admin.address, feed, minterRole] });
  const zusd = await deploy("proxy", [impl, init]);
  if (minterAddr) {
    const got = await deploy(fixed ? "minterFixed" : "minter", [usdc, zusd, roles.service.address]);
    if (got.toLowerCase() !== minterAddr.toLowerCase()) throw new Error("minter address mismatch");
  }
  return { usdc, feed, zusd, impl, tokenAbi, minter: minterAddr, minterAbi: fixed ? abis.minterFixed : abis.minter, timelock };
}

/** Schedule `functionName(args)` on `target` through the timelock, from the multisig. Returns the execute() args. */
export async function scheduleViaTimelock(timelock, target, abi, functionName, args) {
  const data = encodeFunctionData({ abi, functionName, args });
  const salt = "0x" + "00".repeat(32), pred = "0x" + "00".repeat(32);
  await send(roles.multisig, timelock, abis.timelock, "schedule", [target, 0n, data, pred, salt, BigInt(DELAY)]);
  return [target, 0n, data, pred, salt];
}

/** 6-decimal amount, whole units with thousands separators (exact, from a bigint). */
export const fmt = (v) => {
  const whole = (v / 1_000_000n).toLocaleString("en-US");
  const frac = v % 1_000_000n;
  return frac ? `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}` : whole;
};
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export { parseUnits };
