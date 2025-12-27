import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SaveWalletRequest, WalletAddress } from '../types/wallet';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function saveWallet(request: SaveWalletRequest): Promise<WalletAddress> {
  const tableName = process.env.USER_PROFILES_TABLE;

  if (!tableName) {
    throw new Error('USER_PROFILES_TABLE environment variable not set');
  }

  console.log('Saving wallet for identityId:', request.identityId);

  const now = new Date().toISOString();

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      },
      UpdateExpression: 'SET walletAddress = :wallet, blockchain = :blockchain, walletUpdatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':wallet': request.walletAddress,
        ':blockchain': request.blockchain || 'sui',
        ':updatedAt': now
      },
      ReturnValues: 'ALL_NEW'
    }));

    return {
      identityId: result.Attributes!.identityId,
      walletAddress: result.Attributes!.walletAddress,
      blockchain: result.Attributes!.blockchain,
      createdAt: result.Attributes!.walletCreatedAt || now,
      updatedAt: result.Attributes!.walletUpdatedAt
    };
  } catch (error) {
    console.error('Error saving wallet:', error);
    throw error;
  }
}
