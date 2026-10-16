// The fix for attack #4: a SEPARATE signer process. It is the only thing that holds the key.
// It listens on a unix-domain socket and will sign+broadcast a tUSDC transfer on request, but
// it never hands the key back. The agent process is started with NO key in its environment,
// so a helper that scans env/.env finds nothing — yet the agent can still sign, through here.
//
// Run as a child: node lib/signer-process.mjs <sockPath> <privateKey> <usdcAddress>
import net from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const [sockPath, pk, usdc] = process.argv.slice(2);
const RPC = "http://127.0.0.1:8545";
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 100 });
const wallet = createWalletClient({ account, chain, transport: http(RPC), pollingInterval: 100 });
const ERC20_TRANSFER = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }];

if (existsSync(sockPath)) unlinkSync(sockPath);
const server = net.createServer((conn) => {
  conn.on("data", async (buf) => {
    const req = JSON.parse(buf.toString());
    // The signer signs; it never returns the key. Only a bounded action (a transfer) crosses the socket.
    const hash = await wallet.writeContract({ address: usdc, abi: ERC20_TRANSFER, functionName: "transfer", args: [req.to, BigInt(req.amount)] });
    await pub.waitForTransactionReceipt({ hash });
    conn.end(JSON.stringify({ hash }));
  });
});
server.listen(sockPath, () => process.stdout.write("ready\n"));
process.on("SIGTERM", () => { try { unlinkSync(sockPath); } catch {} process.exit(0); });
