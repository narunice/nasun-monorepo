// Load .env file if present (for local dev without --env-file flag).
// This module must be imported FIRST in server.ts, before any module
// that reads process.env at the top level (e.g., auth.ts).
import { readFileSync } from 'node:fs';
import { lookup, setDefaultResultOrder } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

// Force IPv4 for all outbound fetch. The prod EC2 has no IPv6 default route,
// so undici's dual-stack fetch hangs on the AAAA address and surfaces as an
// AggregateError with cause_code=ETIMEDOUT. 2026-05-20 incident: every
// baram-tg sendMessage / banned-loader / identity-resolver refresh failed
// this way while shell curl on the same host worked because curl falls back
// aggressively to IPv4. We tried two milder fixes first:
//   1. NODE_OPTIONS=--dns-result-order=ipv4first on the ecosystem env — pm2
//      did not propagate this to the child reliably.
//   2. setDefaultResultOrder('ipv4first') — applied, but undici still hit
//      ETIMEDOUT in practice, so reorder-only is not enough on this host.
// Hard-pinning the dispatcher's connect family to 4 is the smallest change
// that conclusively kills the IPv6 attempt. Keep setDefaultResultOrder as
// belt-and-braces for any code paths that bypass the global dispatcher.
setDefaultResultOrder('ipv4first');
setGlobalDispatcher(
  new Agent({
    connect: {
      // Force family=4 by overriding the DNS lookup undici uses for every
      // connect. We can't pass `family: 4` directly because undici v6's
      // TcpNetConnectOpts type requires `port`, which is supplied at call
      // time, not on the agent.
      lookup: (hostname, opts, callback) => {
        // Preserve `all`, `hints` and other flags undici passes through;
        // overriding the lookup callback shape (single vs array result)
        // breaks every fetch (2026-05-20 incident: stripping `_opts` caused
        // 100% indexer/banned-loader/baram-tg failure on the next boot).
        lookup(hostname, { ...opts, family: 4 }, callback);
      },
    },
  }),
);

/**
 * Strip wrapping single or double quotes that bash-style .env files
 * commonly use to delimit a value containing whitespace, brackets, or
 * embedded quotes. dotenv does this automatically; our hand-rolled
 * parser did not, so values like `CHAT_LLM_PROVIDERS='[{...}]'` leaked
 * the literal `'` into process.env and downstream `JSON.parse` blew up
 * (chat preset silently fell back, observed 2026-05-24 staging Santa
 * chat). Matching pair only — odd `it's` or unclosed `"...` is left
 * as-is rather than corrupting the value.
 */
function unwrapEnvValue(v: string): string {
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === "'" || first === '"') && first === last) {
      return v.slice(1, -1);
    }
  }
  return v;
}

try {
  const content = readFileSync('.env', 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = unwrapEnvValue(trimmed.slice(eqIdx + 1).trim());
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // No .env file -- rely on existing environment variables (e.g., PM2 --env-file)
}
