import { createHmac, timingSafeEqual } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let cachedSecret: string | null = null;
const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

async function getWalletProofSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const secretName = process.env.WALLET_PROOF_SECRET_NAME;
  if (!secretName) {
    throw new Error('WALLET_PROOF_SECRET_NAME environment variable not set.');
  }

  const data = await smClient.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!data.SecretString) {
    throw new Error('SecretString is empty in Secrets Manager response.');
  }

  let secrets: any;
  try {
    secrets = JSON.parse(data.SecretString);
  } catch {
    throw new Error('Failed to parse Secrets Manager response as JSON.');
  }

  if (!secrets.secret || secrets.secret.length < 32) {
    throw new Error('Invalid wallet proof secret in Secrets Manager (must be 32+ chars).');
  }

  cachedSecret = secrets.secret as string;
  console.log('[wallet-proof] HMAC secret loaded from Secrets Manager');
  return cachedSecret!;
}

const PROOF_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify walletProof HMAC issued by auth-sui connect-verify.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export async function verifyWalletProof(
  walletAddress: string,
  walletProof: string,
  proofIssuedAt: string,
): Promise<{ valid: boolean; reason?: string }> {
  // Validate proofIssuedAt freshness
  const issuedTime = new Date(proofIssuedAt).getTime();
  if (isNaN(issuedTime)) {
    return { valid: false, reason: 'Invalid proofIssuedAt format' };
  }
  if (Date.now() - issuedTime > PROOF_MAX_AGE_MS) {
    return { valid: false, reason: 'walletProof expired (>5 min)' };
  }

  const secret = await getWalletProofSecret();
  const expected = createHmac('sha256', secret)
    .update(`${walletAddress}:${proofIssuedAt}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(walletProof, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'walletProof mismatch' };
  }

  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: 'walletProof mismatch' };
  }

  return { valid: true };
}
