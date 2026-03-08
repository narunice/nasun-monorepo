import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export interface RegisteredWallet {
  walletAddress: string;
  blockchain: string;
  label?: string;
  registeredAt: string;
}

export async function listWallets(identityId: string): Promise<RegisteredWallet[]> {
  const tableName = process.env.USER_WALLETS_TABLE;
  if (!tableName) throw new Error('USER_WALLETS_TABLE environment variable not set');

  const result = await docClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'identityId = :id AND begins_with(walletAddress, :prefix)',
    ExpressionAttributeValues: {
      ':id': identityId,
      ':prefix': '0x',
    },
  }));

  return (result.Items || []).map(item => ({
    walletAddress: item.walletAddress,
    blockchain: item.blockchain || 'sui',
    ...(item.label && { label: item.label }),
    registeredAt: item.registeredAt,
  }));
}
