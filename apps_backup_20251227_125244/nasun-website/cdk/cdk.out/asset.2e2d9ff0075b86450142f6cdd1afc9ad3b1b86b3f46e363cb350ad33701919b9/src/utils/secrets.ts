import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

// Cache for secrets
let cachedSecrets: { [key: string]: any } | null = null;

export async function getTwitterSecrets() {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const secretName = process.env.SECRET_NAME;
  if (!secretName) {
    throw new Error('SECRET_NAME environment variable not set.');
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  const command = new GetSecretValueCommand({ SecretId: secretName });

  try {
    const data = await client.send(command);
    if (data.SecretString) {
      cachedSecrets = JSON.parse(data.SecretString);
      return cachedSecrets;
    } else {
      throw new Error('SecretString is empty or not found in Secrets Manager response.');
    }
  } catch (error) {
    console.error('Failed to retrieve secrets from Secrets Manager:', error);
    throw new Error('Could not retrieve secrets.');
  }
}

export async function updateTwitterSecrets(newOauth2Data: any): Promise<void> {
  const secretName = process.env.SECRET_NAME;
  if (!secretName) {
    throw new Error('SECRET_NAME environment variable not set.');
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

  try {
    // It's better to get the freshest value before updating
    const getCommand = new GetSecretValueCommand({ SecretId: secretName });
    const currentSecretData = await client.send(getCommand);
    const currentSecret = JSON.parse(currentSecretData.SecretString || '{}');

    // Create the new secret value by merging
    const newSecret = {
      ...currentSecret,
      oauth2: newOauth2Data,
    };

    const updateCommand = new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(newSecret, null, 2),
    });

    await client.send(updateCommand);

    // Invalidate the cache since we just updated the secret
    cachedSecrets = null;
    console.log('Successfully updated Twitter secrets in Secrets Manager.');

  } catch (error) {
    console.error('Failed to update secrets in Secrets Manager:', error);
    throw new Error('Could not update secrets.');
  }
}
