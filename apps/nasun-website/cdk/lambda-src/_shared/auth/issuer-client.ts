/**
 * Low-level client for the self-hosted issuer box (AWS-exit grace, Stage 2 §A).
 *
 * One shared bearer (ISSUER_MINT_SECRET) authenticates every lambda-facing endpoint the issuer exposes
 * (`/mint`, `/zklogin/salt`). This centralizes the fetch + timeout + status handling so each endpoint
 * wrapper (issuer-mint.ts, issuer-salt.ts) only shapes its own request/response. The bearer is read at
 * call time so a warm lambda picks up the value once it is wired at cutover.
 */

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * POST `payload` as JSON to an issuer-box endpoint and return the parsed JSON body. Throws on a missing
 * secret, a non-2xx status (status only, never the body — it may carry identifiers), or an unparseable
 * body. Caller passes the full endpoint URL (from its own ISSUER_*_URL env var).
 */
export async function issuerPost<T>(url: string, payload: unknown): Promise<T> {
  const secret = process.env.ISSUER_MINT_SECRET;
  if (!secret) throw new Error('ISSUER_MINT_SECRET is not set');
  // Fall back to the default for unset / non-numeric / non-positive overrides so a bad config never
  // reaches AbortSignal.timeout() (which throws on negative/NaN).
  const overrideMs = Number(process.env.ISSUER_MINT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(overrideMs) && overrideMs > 0 ? overrideMs : DEFAULT_TIMEOUT_MS;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`issuer ${pathOf(url)} returned HTTP ${res.status}`);
  }

  const data = (await res.json().catch(() => null)) as T | null;
  if (data === null) {
    throw new Error(`issuer ${pathOf(url)} returned an unparseable response`);
  }
  return data;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return 'endpoint';
  }
}
