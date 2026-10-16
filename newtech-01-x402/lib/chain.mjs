// Local chain for the demos: spawns anvil, deploys the test contracts, funds wallets.
// Everything here is local and disposable. No live network is ever touched.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseUnits, parseEther, defineChain } from "viem";
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
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
];
export const accounts = KEYS.map((k) => privateKeyToAccount(k));
export const roles = { facilitator: accounts[0], seller: accounts[1], buyer: accounts[2], attacker: accounts[3], victims: accounts.slice(4, 9) };
export const keyOf = (acct) => KEYS[accounts.indexOf(acct)];

export const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 100 });
export const walletFor = (acct) => createWalletClient({ account: acct, chain, transport: http(RPC), pollingInterval: 100 });

const artifact = (file, name) => JSON.parse(readFileSync(`${HERE}contracts/out/${file}/${name}.json`, "utf8"));
export const abis = {
  usdc: artifact("TestUSDC.sol", "TestUSDC").abi,
  bridge: artifact("PayBridge.sol", "PayBridge").abi,
  bridgeFixed: artifact("PayBridge.sol", "PayBridgeFixed").abi,
};

let anvil;
export async function startChain() {
  anvil = spawn("anvil", ["--silent", "--port", "8545"], { stdio: "ignore" }); // automine: one block per tx
  for (let i = 0; i < 50; i++) {
    try { await pub.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("anvil did not start");
}
export function stopChain() { anvil?.kill(); }

async function deploy(file, name) {
  const a = artifact(file, name);
  const hash = await walletFor(roles.facilitator).deployContract({ abi: a.abi, bytecode: a.bytecode.object });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
}

/** Deploy TestUSDC and mint to the buyer and victims. Returns addresses. */
export async function setup({ bridge = false } = {}) {
  const usdc = await deploy("TestUSDC.sol", "TestUSDC");
  const w = walletFor(roles.facilitator);
  for (const a of [roles.buyer, ...roles.victims]) {
    const h = await w.writeContract({ address: usdc, abi: abis.usdc, functionName: "mint", args: [a.address, parseUnits("1000", 6)] });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  const out = { usdc };
  if (bridge) { out.bridge = await deploy("PayBridge.sol", "PayBridge"); out.bridgeFixed = await deploy("PayBridge.sol", "PayBridgeFixed"); }
  return out;
}

export const usdcBalance = (usdc, addr) => pub.readContract({ address: usdc, abi: abis.usdc, functionName: "balanceOf", args: [addr] });
export const fmtUsdc = (v) => (Number(v) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
export { parseUnits, parseEther };
