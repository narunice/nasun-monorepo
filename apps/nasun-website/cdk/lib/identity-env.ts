/**
 * Self-hosted identity-write env injection for the AWS-exit DAL S1.2 grace. Separate from the
 * issuer (issuer-env.ts): the box `nasun-identity` service does identity-table CRUD, not JWT
 * signing, and uses its own bearer. Spread the fragment into a Lambda's `environment: {}` block.
 *
 * FAIL-SAFE: when IDENTITY_WRITE_URL or IDENTITY_WRITE_SECRET is unset at synth time (today's
 * default), the helper returns {} -- so the deployed Lambda keeps its DynamoDB-only behavior,
 * byte-equivalent to current prod, with no diff and no redeploy. The handler code already gates
 * on these vars (_shared/auth/identity-write.ts): both present -> additionally mirror the write to
 * the box (best-effort follower, DynamoDB stays SoT); absent -> no-op.
 *
 * At cutover, set the vars in the CDK synth env (gitignored cdk .env) and redeploy; only the wired
 * Lambdas (auth-sui, auth-metamask, wallet-api) change. Roll back by unsetting them and redeploying.
 * The bearer is a dedicated box secret (identity-bearer), distinct from ISSUER_MINT_SECRET.
 *
 * Values:
 *   IDENTITY_WRITE_URL        = https://issuer.nasun.io/identity   (box nasun-identity, nginx-routed)
 *   IDENTITY_WRITE_SECRET     = (box /srv/nasun/identity/secrets/identity-bearer.cred decrypted)
 *   IDENTITY_WRITE_TIMEOUT_MS = (optional; helper defaults to 4000)
 */
export function identityWriteEnv(): Record<string, string> {
  const url = process.env.IDENTITY_WRITE_URL;
  const secret = process.env.IDENTITY_WRITE_SECRET;
  if (!url || !secret) return {};
  const env: Record<string, string> = { IDENTITY_WRITE_URL: url, IDENTITY_WRITE_SECRET: secret };
  if (process.env.IDENTITY_WRITE_TIMEOUT_MS) {
    env.IDENTITY_WRITE_TIMEOUT_MS = process.env.IDENTITY_WRITE_TIMEOUT_MS;
  }
  // AWS-exit DAL 3d write-path inversion: per-route opt-in (comma-list of box routes whose write is
  // AUTHORITATIVE, not best-effort). A route only flips when added here, so deploying a new slice's
  // handler code does not prematurely activate it. Unset (today) = every route stays best-effort.
  if (process.env.IDENTITY_WRITE_FLIP_ROUTES) {
    env.IDENTITY_WRITE_FLIP_ROUTES = process.env.IDENTITY_WRITE_FLIP_ROUTES;
  }
  return env;
}

/**
 * Self-hosted identity-READ env injection for the AWS-exit DAL S2.C get-user-profile reader
 * cutover. Counterpart of identityWriteEnv: the box `nasun-identity` GET routes (/profile/by-wallet,
 * /profile/by-identity) compute the SAME response body, so get-user-profile can shadow-compare its
 * DynamoDB read against the box, then flip to serving the box for /by-wallet.
 *
 * FAIL-SAFE: when IDENTITY_READ_URL or IDENTITY_READ_SECRET is unset at synth time (today's
 * default) the helper returns {} -- the Lambda keeps DynamoDB-only behavior, no diff, no redeploy.
 * The handler (get-user-profile/index.ts) further gates: readProfileFromBox no-ops unless both URL
 * and SECRET are present, and IDENTITY_READ_MODE selects the behavior (unset/'' = DynamoDB only,
 * 'shadow' = compare+log+serve DynamoDB, 'flip' = serve box with DynamoDB fallback, /by-wallet only).
 * Roll back by unsetting the vars (or just IDENTITY_READ_MODE) and redeploying.
 *
 * Values (the same box base + bearer as the write side may be reused):
 *   IDENTITY_READ_URL        = https://issuer.nasun.io/identity
 *   IDENTITY_READ_SECRET     = (box identity-bearer)
 *   IDENTITY_READ_MODE       = '' | 'shadow' | 'flip'
 *   IDENTITY_READ_TIMEOUT_MS = (optional; handler defaults to 4000)
 */
export function identityReadEnv(): Record<string, string> {
  const url = process.env.IDENTITY_READ_URL;
  const secret = process.env.IDENTITY_READ_SECRET;
  if (!url || !secret) return {};
  const env: Record<string, string> = { IDENTITY_READ_URL: url, IDENTITY_READ_SECRET: secret };
  if (process.env.IDENTITY_READ_MODE) env.IDENTITY_READ_MODE = process.env.IDENTITY_READ_MODE;
  if (process.env.IDENTITY_READ_TIMEOUT_MS) env.IDENTITY_READ_TIMEOUT_MS = process.env.IDENTITY_READ_TIMEOUT_MS;
  return env;
}
