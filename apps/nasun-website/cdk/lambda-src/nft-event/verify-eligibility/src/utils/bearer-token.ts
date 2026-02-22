import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Module-level cache (persists across warm Lambda invocations)
let cachedBearerToken: string | null = null;

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

/**
 * Get X API bearer token from Secrets Manager with module-level caching.
 * Reads bearerToken field from the Twitter tokens secret.
 */
export async function getBearerToken(): Promise<string> {
  if (cachedBearerToken) {
    return cachedBearerToken;
  }

  const secretName = process.env.TWITTER_TOKENS_SECRET_NAME;
  if (!secretName) {
    throw new Error('TWITTER_TOKENS_SECRET_NAME environment variable not set.');
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

  if (!secrets.bearerToken) {
    throw new Error('Missing bearerToken in Secrets Manager secret.');
  }

  cachedBearerToken = secrets.bearerToken;
  console.log('[verify-eligibility] Bearer token loaded from Secrets Manager');
  return cachedBearerToken;
}
