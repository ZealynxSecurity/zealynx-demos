// Client side of the fix for attack #4. The agent reaches the signer process over a unix
// socket and asks it to move value. The agent holds no key of its own.
import net from "node:net";

export function connectSigner(sockPath) {
  return {
    /** Ask the signer to transfer `amount` (base units) of tUSDC to `to`. Returns the tx hash. */
    transfer(to, amount) {
      return new Promise((resolve, reject) => {
        const conn = net.connect(sockPath);
        let out = "";
        conn.on("connect", () => conn.write(JSON.stringify({ to, amount: String(amount) })));
        conn.on("data", (b) => { out += b.toString(); });
        conn.on("end", () => { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
        conn.on("error", reject);
      });
    },
  };
}
