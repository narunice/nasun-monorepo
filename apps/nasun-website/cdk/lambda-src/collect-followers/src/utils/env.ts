// Environment configuration for collect-followers Lambda

export interface TargetAccount {
  userId: string;
  username: string;
}

export interface EnvConfig {
  // Target accounts
  targetAccounts: TargetAccount[];

  // DynamoDB
  followersTableName: string;

  // Twitter API
  twitterBearerToken: string;

  // AWS
  awsRegion: string;
}

export function getEnvConfig(): EnvConfig {
  const targetAccountsJson = process.env.TARGET_ACCOUNTS || '[]';
  let targetAccounts: TargetAccount[];

  try {
    targetAccounts = JSON.parse(targetAccountsJson);
  } catch (error) {
    console.error('Failed to parse TARGET_ACCOUNTS:', error);
    targetAccounts = [];
  }

  return {
    targetAccounts,
    followersTableName: process.env.FOLLOWERS_TABLE_NAME || 'NasunTargetFollowers',
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    awsRegion: process.env.AWS_REGION || 'ap-northeast-2',
  };
}

export function validateEnvConfig(config: EnvConfig): string[] {
  const errors: string[] = [];

  if (config.targetAccounts.length === 0) {
    errors.push('TARGET_ACCOUNTS is empty or invalid');
  }

  if (!config.twitterBearerToken) {
    errors.push('TWITTER_BEARER_TOKEN is required');
  }

  if (!config.followersTableName) {
    errors.push('FOLLOWERS_TABLE_NAME is required');
  }

  return errors;
}
