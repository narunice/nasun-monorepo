import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.NONCE_TABLE_NAME || 'MetaMaskAuthNonces';

const NONCE_TTL_SECONDS = 300;
const KEY_PREFIX = 'additional:';

export interface AdditionalNonceRecord {
  identityId: string;
  walletAddress: string;
  appId?: string;
  message: string;
  expiresAt: number;
}

function key(nonce: string): string {
  return `${KEY_PREFIX}${nonce}`;
}

/**
 * Persist a freshly generated nonce. The table is keyed by walletAddress
 * (legacy schema reused from the metamask auth Lambda) but we namespace
 * by `additional:{nonce}` so primary metamask challenges and additional
 * challenges never collide.
 */
export async function putAdditionalNonce(nonce: string, record: AdditionalNonceRecord): Promise<void> {
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
 * or has already been consumed. Race condition note: even if multiple
 * concurrent verify requests arrive, DeleteItem with ReturnValues=ALL_OLD
 * only returns Attributes to the first caller.
 */
export async function consumeAdditionalNonce(nonce: string): Promise<AdditionalNonceRecord | null> {
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
