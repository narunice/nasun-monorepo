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
  return env;
}
