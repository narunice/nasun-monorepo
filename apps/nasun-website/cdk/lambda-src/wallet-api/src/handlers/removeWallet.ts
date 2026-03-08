import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export interface RemoveWalletInput {
  identityId: string;
  walletAddress: string;
}

export interface RemoveWalletResult {
  statusCode: number;
  body: Record<string, unknown>;
}

export async function removeWallet(input: RemoveWalletInput): Promise<RemoveWalletResult> {
  const tableName = process.env.USER_WALLETS_TABLE;
  const userProfilesTable = process.env.USER_PROFILES_TABLE;
  if (!tableName) throw new Error('USER_WALLETS_TABLE environment variable not set');
  if (!userProfilesTable) throw new Error('USER_PROFILES_TABLE environment variable not set');

  const { identityId } = input;
  const walletAddress = input.walletAddress.toLowerCase();

  // Check if user is logged in via Nasun Wallet and this is their last wallet
  const [profileResult, walletCountResult] = await Promise.all([
    docClient.send(new GetCommand({
      TableName: userProfilesTable,
      Key: { identityId },
    })),
    docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'identityId = :id AND begins_with(walletAddress, :prefix)',
      ExpressionAttributeValues: { ':id': identityId, ':prefix': '0x' },
      Select: 'COUNT',
    })),
  ]);

  const provider = profileResult.Item?.provider;
  const walletCount = walletCountResult.Count || 0;

  if (provider === 'Nasun Wallet' && walletCount <= 1) {
    return {
      statusCode: 400,
      body: { error: 'Cannot remove the last registered wallet for a Nasun Wallet account' },
    };
  }

  // Check if wallet exists in USER_WALLETS_TABLE
  const walletExists = walletCount > 0;

  if (walletExists) {
    // Normal path: wallet is registered in USER_WALLETS_TABLE
    try {
      await docClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: tableName,
              Key: { identityId, walletAddress },
            },
          },
          {
            Delete: {
              TableName: tableName,
              Key: { identityId: 'WALLET_OWNER', walletAddress },
              ConditionExpression: 'ownerIdentityId = :owner',
              ExpressionAttributeValues: { ':owner': identityId },
            },
          },
        ],
      }));
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        return { statusCode: 403, body: { error: 'You do not own this wallet' } };
      }
      throw error;
    }
  }

  // Clean up UserProfiles references to the removed wallet
  // For legacy users the wallet may only exist in UserProfiles (top-level or linkedAccounts)
  const storedWallet = profileResult.Item?.walletAddress;
  const linkedNasunAddr = profileResult.Item?.linkedAccounts?.['nasun wallet']?.walletAddress;
  let cleanedUp = false;

  // Clean up top-level walletAddress
  if (storedWallet && storedWallet.toLowerCase() === walletAddress) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: userProfilesTable,
        Key: { identityId },
        UpdateExpression: 'REMOVE walletAddress',
        ConditionExpression: 'walletAddress = :addr',
        ExpressionAttributeValues: { ':addr': storedWallet },
      }));
      cleanedUp = true;
    } catch (cleanupErr) {
      console.warn('Failed to clean up UserProfiles.walletAddress (best-effort):', cleanupErr);
    }
  }

  // Clean up linkedAccounts['nasun wallet'] if it references the removed wallet
  if (linkedNasunAddr && linkedNasunAddr.toLowerCase() === walletAddress) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: userProfilesTable,
        Key: { identityId },
        UpdateExpression: 'REMOVE linkedAccounts.#nw',
        ExpressionAttributeNames: { '#nw': 'nasun wallet' },
      }));
      cleanedUp = true;
    } catch (cleanupErr) {
      console.warn('Failed to clean up linkedAccounts nasun wallet (best-effort):', cleanupErr);
    }
  }

  if (!walletExists && !cleanedUp) {
    return { statusCode: 404, body: { error: 'Wallet not found' } };
  }

  return { statusCode: 200, body: { message: 'Wallet removed successfully' } };
}
