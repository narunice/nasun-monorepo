import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.NONCE_TABLE_NAME || 'MetaMaskAuthNonces';

export interface NonceData {
  nonce: string;
  expiresAt: number;
}

/**
 * DynamoDB에 nonce 저장
 */
export async function saveNonce(
  walletAddress: string,
  nonce: string,
  expiresAt: number
): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        walletAddress,
        nonce,
        expiresAt,
      },
    })
  );
}

/**
 * DynamoDB에서 nonce 조회
 */
export async function getNonce(walletAddress: string): Promise<NonceData | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { walletAddress },
    })
  );

  if (!result.Item) {
    return null;
  }

  return {
    nonce: result.Item.nonce,
    expiresAt: result.Item.expiresAt,
  };
}

/**
 * DynamoDB에서 nonce 삭제
 */
export async function deleteNonce(walletAddress: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { walletAddress },
    })
  );
}

/**
 * DynamoDB에서 nonce 조회 후 즉시 삭제 (원자적 연산)
 * Race condition 방지: 동시 요청 시 하나만 성공
 */
export async function getAndDeleteNonce(walletAddress: string): Promise<NonceData | null> {
  const result = await dynamoClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { walletAddress },
      ReturnValues: 'ALL_OLD', // Return the item that was deleted
    })
  );

  if (!result.Attributes) {
    return null;
  }

  return {
    nonce: result.Attributes.nonce,
    expiresAt: result.Attributes.expiresAt,
  };
}
