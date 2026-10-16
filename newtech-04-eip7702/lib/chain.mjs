// Local chain for the demos: spawns anvil on the Prague hardfork (so EIP-7702 type-4
// transactions work), deploys our delegates and the test token, and installs 7702
// delegations. Everything here is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, createTestClient, http, parseEther,
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
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
];
export const accounts = KEYS.map((k) => privateKeyToAccount(k));
export const keyOf = (acct) => KEYS[accounts.indexOf(acct)];
// relayer: the wallet infrastructure / bundler that submits the 7702 delegation txs.
// victim/admin/user: EOAs that delegate (or are tricked into delegating) their account.
// attacker: the sink for swept ETH, drained tokens, and the front-run / collision takeover.
export const roles = {
  relayer: accounts[1], victim: accounts[0], admin: accounts[2],
  user: accounts[4], attacker: accounts[3], minter: accounts[5],
};

export const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 100 });
export const walletFor = (acct) => createWalletClient({ account: acct, chain, transport: http(RPC), pollingInterval: 100 });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
const A = {
  qnt: artifact("TestQNT.sol", "TestQNT"),
  sweeper: artifact("Sweeper.sol", "Sweeper"),
  pool: artifact("Pool.sol", "Pool"),
  open: artifact("OpenDelegate.sol", "OpenDelegate"),
  self: artifact("SelfDelegate.sol", "SelfDelegate"),
  init: artifact("InitDelegate.sol", "InitDelegate"),
  initFixed: artifact("InitDelegateFixed.sol", "InitDelegateFixed"),
  delegateA: artifact("DelegateA.sol", "DelegateA"),
  delegateB: artifact("DelegateB.sol", "DelegateB"),
  delegateBFixed: artifact("DelegateBFixed.sol", "DelegateBFixed"),
  mintVuln: artifact("MintVuln.sol", "MintVuln"),
  mintFixed: artifact("MintFixed.sol", "MintFixed"),
  batch: artifact("BatchDelegate.sol", "BatchDelegate"),
};
export const abis = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi]));

let anvil;
export async function startChain() {
  // --hardfork prague: EIP-7702 type-4 transactions (authorizationList) need Prague.
  anvil = spawn("anvil", ["--silent", "--hardfork", "prague", "--port", "8545"], { stdio: "ignore" }); // automine
  for (let i = 0; i < 50; i++) {
    try { await pub.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("anvil did not start");
}
export function stopChain() { anvil?.kill(); }

export const nonceOf = (addr) => pub.getTransactionCount({ address: addr });

export async function deploy(name, args = [], from = roles.relayer) {
  const hash = await walletFor(from).deployContract({ abi: A[name].abi, bytecode: A[name].bytecode.object, args });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
}

/**
 * Install an EIP-7702 delegation on `authority` (an EOA) pointing at `delegate` (a
 * contract address), submitted by the relayer. The transaction targets a benign address
 * (the relayer itself) so only the delegation is applied — the new code is not invoked
 * here. Returns the authorization object that was signed.
 * `chainId` defaults to this chain; pass 0n for a "valid on every chain" authorization.
 */
export async function delegate(authority, delegateAddr, { chainId = chain.id } = {}) {
  const auth = await authority.signAuthorization({ chainId: Number(chainId), nonce: await nonceOf(authority.address), address: delegateAddr });
  const hash = await walletFor(roles.relayer).sendTransaction({ authorizationList: [auth], to: roles.relayer.address, value: 0n });
  await pub.waitForTransactionReceipt({ hash });
  return auth;
}

/** The delegation designator currently installed on an account (0xef0100 || delegate), or "0x". */
export const codeOf = (addr) => pub.getCode({ address: addr }).then((c) => c ?? "0x");

/** Send a transaction and wait for it. Throws on revert. */
export async function send(from, address, abi, functionName, args = [], value = 0n) {
  const { request } = await pub.simulateContract({ account: from, address, abi, functionName, args, value });
  const hash = await walletFor(from).writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}

/** Try a call as `from`. Sends it if it would succeed; returns the custom error if it would revert. */
export async function attempt(from, address, abi, functionName, args = [], value = 0n) {
  try {
    await send(from, address, abi, functionName, args, value);
    return { ok: true };
  } catch (e) {
    const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    if (!rev) throw e;
    // Custom errors surface their name; string reverts (require("msg")) surface the message.
    const custom = rev.data?.errorName && rev.data.errorName !== "Error" ? rev.data.errorName : null;
    return { ok: false, name: custom ?? rev.reason ?? rev.data?.args?.[0] ?? "revert", args: rev.data?.args ?? [] };
  }
}

/** Raw transaction from `from` (used for self-executed calls where tx.origin must be the account). */
export async function sendRaw(from, { to, data = "0x", value = 0n }) {
  const hash = await walletFor(from).sendTransaction({ to, data, value });
  return pub.waitForTransactionReceipt({ hash });
}

export const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
export const ethBalance = (addr) => pub.getBalance({ address: addr });
export const setEth = (addr, eth) => testClient.setBalance({ address: addr, value: parseEther(String(eth)) });

/** 18-decimal amount, whole units with thousands separators, trailing zeros trimmed (exact, from a bigint). */
export const fmtQnt = (v) => {
  const whole = (v / 10n ** 18n).toLocaleString("en-US");
  const frac = v % 10n ** 18n;
  return frac ? `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")}` : whole;
};
export const fmtEth = (v) => Number(formatEther(v)).toFixed(1);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export { parseEther };
