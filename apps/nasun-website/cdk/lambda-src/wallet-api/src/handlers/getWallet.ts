import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetWalletRequest, WalletAddress } from '../types/wallet';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function getWallet(request: GetWalletRequest): Promise<WalletAddress | null> {
  const tableName = process.env.USER_PROFILES_TABLE;

  if (!tableName) {
    throw new Error('USER_PROFILES_TABLE environment variable not set');
  }

  console.log('Getting wallet for identityId:', request.identityId);

  try {
    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      }
    }));

    if (!result.Item || !result.Item.walletAddress) {
      console.log('No wallet address found for identityId:', request.identityId);
      return null;
    }

    return {
      identityId: result.Item.identityId,
      walletAddress: result.Item.walletAddress,
      blockchain: result.Item.blockchain,
      createdAt: result.Item.walletCreatedAt || new Date().toISOString(),
      updatedAt: result.Item.walletUpdatedAt || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting wallet:', error);
    throw error;
  }
}
