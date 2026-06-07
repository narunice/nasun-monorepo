/**
 * Self-hosted issuer env injection for the AWS-exit grace period (Stage 2 §A.3/§A.4,
 * handoff ③b/③c-2). Spread these fragments into a Lambda's `environment: {}` block.
 *
 * FAIL-SAFE: when the corresponding synth-time process.env is unset (today's default
 * state), each helper returns {} — so the deployed Lambda keeps its Cognito/DynamoDB
 * behavior, byte-equivalent to current prod, with no diff and no redeploy. The handler
 * code already gates on these vars (issuer-mint.ts / issuer-salt.ts / dual-jwks.ts):
 * present -> route to the self-hosted issuer; absent -> Cognito.
 *
 * At cutover, set the vars in the CDK synth env (gitignored cdk .env) and redeploy;
 * only the wired Lambdas change. Roll back by unsetting them and redeploying. The mint
 * secret is a shared bearer the box issuer checks in constant time; plain Lambda env is
 * the accepted grace-period delivery (handoff session 7/8).
 *
 * Values:
 *   NASUN_ISSUER_JWKS_URL = https://issuer.nasun.io/.well-known/jwks.json
 *   ISSUER_MINT_URL       = https://issuer.nasun.io/mint
 *   ISSUER_SALT_URL       = https://issuer.nasun.io/zklogin/salt
 *   ISSUER_MINT_SECRET    = (box /etc/nasun/issuer-secrets.env ISSUER_MINT_SECRET)
 *   NASUN_ISSUER_ID       = nasun-issuer (optional; helper code defaults to this)
 */

/**
 * VERIFY sites (dual-jwks): the public JWKS URL the verify helper fetches for the
 * nasun-issuer branch during the dual-JWKS grace. Cognito JWKS stays the fallback.
 */
export function issuerVerifyEnv(): Record<string, string> {
  const jwks = process.env.NASUN_ISSUER_JWKS_URL;
  if (!jwks) return {};
  const env: Record<string, string> = { NASUN_ISSUER_JWKS_URL: jwks };
  if (process.env.NASUN_ISSUER_ID) env.NASUN_ISSUER_ID = process.env.NASUN_ISSUER_ID;
  return env;
}

/**
 * MINT sites (auth-sui / auth-metamask): the issuer /mint endpoint + shared bearer.
 * Fail-closed — both url and secret must be present, else {} (no half-configuration).
 */
export function issuerMintEnv(): Record<string, string> {
  const url = process.env.ISSUER_MINT_URL;
  const secret = process.env.ISSUER_MINT_SECRET;
  if (!url || !secret) return {};
  return { ISSUER_MINT_URL: url, ISSUER_MINT_SECRET: secret };
}

/**
 * SALT site (zklogin-salt): the issuer /zklogin/salt endpoint + shared bearer (reuses
 * ISSUER_MINT_SECRET — single box bearer). Fail-closed like issuerMintEnv.
 */
export function issuerSaltEnv(): Record<string, string> {
  const url = process.env.ISSUER_SALT_URL;
  const secret = process.env.ISSUER_MINT_SECRET;
  if (!url || !secret) return {};
  return { ISSUER_SALT_URL: url, ISSUER_MINT_SECRET: secret };
}
