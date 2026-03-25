import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyWalletProof } from '../utils/walletProof';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SUI_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;
const MAX_WALLETS_PER_ACCOUNT = 10;

export interface RegisterWalletInput {
  identityId: string;
  walletAddress: string;
  walletProof: string;
  proofIssuedAt: string;
}

export interface RegisterWalletResult {
  statusCode: number;
  body: Record<string, unknown>;
}

export async function registerWallet(input: RegisterWalletInput): Promise<RegisterWalletResult> {
  const tableName = process.env.USER_WALLETS_TABLE;
  const userProfilesTable = process.env.USER_PROFILES_TABLE;
  if (!tableName) throw new Error('USER_WALLETS_TABLE environment variable not set');
  if (!userProfilesTable) throw new Error('USER_PROFILES_TABLE environment variable not set');

  const { identityId, walletProof, proofIssuedAt } = input;
  const walletAddress = input.walletAddress.toLowerCase();

  // Validate address format
  if (!SUI_ADDRESS_REGEX.test(walletAddress)) {
    return { statusCode: 400, body: { error: 'Invalid Sui wallet address format' } };
  }

  // Verify wallet ownership via HMAC proof
  const proofResult = await verifyWalletProof(walletAddress, walletProof, proofIssuedAt);
  if (!proofResult.valid) {
    return { statusCode: 403, body: { error: 'Wallet proof verification failed', reason: proofResult.reason } };
  }

  // Enforce per-account wallet limit
  const existingWallets = await docClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'identityId = :id',
    ExpressionAttributeValues: { ':id': identityId },
    Select: 'COUNT',
  }));
  if ((existingWallets.Count ?? 0) >= MAX_WALLETS_PER_ACCOUNT) {
    return { statusCode: 429, body: { error: `Maximum ${MAX_WALLETS_PER_ACCOUNT} wallets per account` } };
  }

  const now = new Date().toISOString();

  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              identityId,
              walletAddress,
              blockchain: 'sui',
              registeredAt: now,
              updatedAt: now,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              identityId: 'WALLET_OWNER',
              walletAddress,
              ownerIdentityId: identityId,
            },
            ConditionExpression: 'attribute_not_exists(walletAddress)',
          },
        },
      ],
    }));

    return { statusCode: 200, body: { walletAddress, blockchain: 'sui', registeredAt: now } };
  } catch (error: any) {
    if (error.name === 'TransactionCanceledException') {
      const reasons = error.CancellationReasons || [];
      // Check if the ownership item condition failed (second item)
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        // Check if it's the same user re-registering (idempotent)
        const existing = await docClient.send(new GetCommand({
          TableName: tableName,
          Key: { identityId: 'WALLET_OWNER', walletAddress },
        }));

        if (existing.Item?.ownerIdentityId === identityId) {
          // Same user, idempotent success
          const walletItem = await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { identityId, walletAddress },
          }));
          return {
            statusCode: 200,
            body: {
              walletAddress,
              blockchain: walletItem.Item?.blockchain || 'sui',
              registeredAt: walletItem.Item?.registeredAt || now,
            },
          };
        }

        // Wallet owned by different user — transfer ownership (walletProof already verified)
        const previousOwner = existing.Item!.ownerIdentityId as string;

        console.warn(JSON.stringify({
          event: 'WALLET_OWNERSHIP_TRANSFER',
          walletAddress,
          previousOwner,
          newOwner: identityId,
          timestamp: now,
        }));

        await docClient.send(new TransactWriteCommand({
          TransactItems: [
            // Remove wallet from previous owner
            { Delete: { TableName: tableName, Key: { identityId: previousOwner, walletAddress } } },
            // Add wallet to new owner
            {
              Put: {
                TableName: tableName,
                Item: { identityId, walletAddress, blockchain: 'sui', registeredAt: now, updatedAt: now },
              },
            },
            // Transfer ownership — Update with CAS to prevent race conditions
            {
              Update: {
                TableName: tableName,
                Key: { identityId: 'WALLET_OWNER', walletAddress },
                UpdateExpression: 'SET ownerIdentityId = :newOwner',
                ConditionExpression: 'ownerIdentityId = :oldOwner',
                ExpressionAttributeValues: {
                  ':newOwner': identityId,
                  ':oldOwner': previousOwner,
                },
              },
            },
          ],
        }));

        // Best-effort: clean up previous owner's UserProfiles.walletAddress if it references the transferred wallet
        // Separate from TransactWrite to avoid rollback risk on condition failure
        try {
          const prevProfile = await docClient.send(new GetCommand({
            TableName: userProfilesTable,
            Key: { identityId: previousOwner },
            ProjectionExpression: 'walletAddress',
          }));
          if (prevProfile.Item?.walletAddress?.toLowerCase() === walletAddress) {
            await docClient.send(new UpdateCommand({
              TableName: userProfilesTable,
              Key: { identityId: previousOwner },
              UpdateExpression: 'REMOVE walletAddress',
              ConditionExpression: 'walletAddress = :addr',
              ExpressionAttributeValues: { ':addr': prevProfile.Item.walletAddress },
            }));
          }
        } catch (cleanupErr) {
          console.warn('Failed to clean up previous owner UserProfiles.walletAddress (best-effort):', cleanupErr);
        }

        return { statusCode: 200, body: { walletAddress, blockchain: 'sui', registeredAt: now, transferred: true } };
      }
    }
    throw error;
  }
}
