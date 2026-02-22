import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Module-level cache (persists across warm Lambda invocations)
let cachedSecret: string | null = null;

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

/**
 * Get wallet proof HMAC secret from Secrets Manager with module-level caching.
 * Reads secret field from the wallet proof secret.
 */
export async function getWalletProofSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secretName = process.env.WALLET_PROOF_SECRET_NAME;
  if (!secretName) {
    throw new Error('WALLET_PROOF_SECRET_NAME environment variable not set.');
  }

  const data = await client.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );

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

  cachedSecret = secrets.secret;
  console.log('[wallet-proof] HMAC secret loaded from Secrets Manager');
  return cachedSecret;
}
