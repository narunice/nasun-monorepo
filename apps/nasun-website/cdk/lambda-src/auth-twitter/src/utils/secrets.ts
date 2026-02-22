import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

// Module-level cache (persists across warm Lambda invocations)
let cachedCredentials: OAuthClientCredentials | null = null;

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

/**
 * Get OAuth2 client credentials from Secrets Manager with module-level caching.
 * Reads oauth2.clientId and oauth2.clientSecret from the secret.
 */
export async function getOAuthClientCredentials(): Promise<OAuthClientCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
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

  if (!secrets.oauth2?.clientId || !secrets.oauth2?.clientSecret) {
    throw new Error('Missing oauth2.clientId or oauth2.clientSecret in Secrets Manager.');
  }

  cachedCredentials = {
    clientId: secrets.oauth2.clientId,
    clientSecret: secrets.oauth2.clientSecret,
  };

  console.log('[AUTH_TWITTER] OAuth2 client credentials loaded from Secrets Manager');
  return cachedCredentials;
}
