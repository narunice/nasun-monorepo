import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const dynamoClient = DynamoDBDocumentClient.from(client);
// Shared MetaMaskAuthNonces table — Solana entries are namespaced by
// the `solana_additional:{nonce}` key prefix so primary EVM challenges,
// additional EVM challenges, and Solana additional challenges never collide.
const tableName = process.env.NONCE_TABLE_NAME || 'MetaMaskAuthNonces';

const NONCE_TTL_SECONDS = 300;
const KEY_PREFIX = 'solana_additional:';

export interface AdditionalSolanaNonceRecord {
  identityId: string;
  walletAddress: string;
  appId?: string;
  message: string;
  expiresAt: number;
}

function key(nonce: string): string {
  return `${KEY_PREFIX}${nonce}`;
}

export async function putAdditionalSolNonce(nonce: string, record: AdditionalSolanaNonceRecord): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        walletAddress: key(nonce),
        nonce,
        identityId: record.identityId,
        challengeWalletAddress: record.walletAddress,
        appId: record.appId ?? null,
        message: record.message,
        expiresAt: record.expiresAt,
      },
    })
  );
}

/**
 * Atomic get+delete by nonce. Returns null if the nonce was never stored
 * or has already been consumed. ReturnValues=ALL_OLD makes only the first
 * caller see Attributes — concurrent verify requests cannot replay.
 */
export async function consumeAdditionalSolNonce(nonce: string): Promise<AdditionalSolanaNonceRecord | null> {
  const result = await dynamoClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { walletAddress: key(nonce) },
      ReturnValues: 'ALL_OLD',
    })
  );

  if (!result.Attributes) return null;

  return {
    identityId: result.Attributes.identityId as string,
    walletAddress: result.Attributes.challengeWalletAddress as string,
    appId: (result.Attributes.appId as string | null) || undefined,
    message: result.Attributes.message as string,
    expiresAt: result.Attributes.expiresAt as number,
  };
}

export { NONCE_TTL_SECONDS };
