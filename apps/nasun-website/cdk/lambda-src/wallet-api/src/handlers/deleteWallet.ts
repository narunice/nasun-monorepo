import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteWalletRequest } from '../types/wallet';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function deleteWallet(request: DeleteWalletRequest): Promise<void> {
  const tableName = process.env.USER_PROFILES_TABLE;

  if (!tableName) {
    throw new Error('USER_PROFILES_TABLE environment variable not set');
  }

  console.log('Deleting wallet for identityId:', request.identityId);

  try {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        identityId: request.identityId
      },
      UpdateExpression: 'REMOVE walletAddress, blockchain, walletCreatedAt, walletUpdatedAt'
    }));

    console.log('Wallet deleted successfully for identityId:', request.identityId);
  } catch (error) {
    console.error('Error deleting wallet:', error);
    throw error;
  }
}
