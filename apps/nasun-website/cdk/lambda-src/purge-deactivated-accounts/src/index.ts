import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityClient, UnlinkIdentityCommand, DescribeIdentityCommand } from "@aws-sdk/client-cognito-identity";

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;

const ddbClient = new DynamoDBClient({});
const cognitoClient = new CognitoIdentityClient({});

export const handler = async (): Promise<void> => {
  console.log("[AccountPurge] Starting job to purge deactivated accounts.");

  const now = Math.floor(Date.now() / 1000);
  let accountsToPurge: any[] = [];
  let lastEvaluatedKey: any = undefined;

  try {
    // 1. Scan for accounts due for deletion
    do {
      const scanCmd = new ScanCommand({
        TableName: USER_PROFILES_TABLE,
        FilterExpression: "#status = :status AND #deletionScheduledAt <= :now",
        ExpressionAttributeNames: {
          "#status": "status",
          "#deletionScheduledAt": "deletionScheduledAt",
        },
        ExpressionAttributeValues: {
          ":status": { S: "DEACTIVATED" },
          ":now": { N: String(now) },
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const { Items, LastEvaluatedKey } = await ddbClient.send(scanCmd);
      if (Items) {
        accountsToPurge.push(...Items);
      }
      lastEvaluatedKey = LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`[AccountPurge] Found ${accountsToPurge.length} accounts to purge.`);

    // 2. Process each account for deletion
    for (const account of accountsToPurge) {
      const identityId = account.identityId.S;
      if (!identityId) continue;

      try {
        // 2a. Unlink from Cognito
        const describeCmd = new DescribeIdentityCommand({ IdentityId: identityId });
        const { Logins: currentLogins } = await cognitoClient.send(describeCmd);

        if (currentLogins && currentLogins.length > 0) {
          const unlinkCmd = new UnlinkIdentityCommand({
            IdentityId: identityId,
            Logins: currentLogins.reduce((acc, login) => ({ ...acc, [login]: account[login]?.S || '' }), {}),
            LoginsToRemove: currentLogins,
          });
          await cognitoClient.send(unlinkCmd);
          console.log(`[AccountPurge] Unlinked logins for IdentityId: ${identityId}`);
        }

        // 2b. Delete from DynamoDB
        const deleteCmd = new DeleteItemCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: { S: identityId } },
        });
        await ddbClient.send(deleteCmd);
        console.log(`[AccountPurge] Deleted profile from DynamoDB for IdentityId: ${identityId}`);

      } catch (error) {
        console.error(`[AccountPurge] Failed to process account ${identityId}:`, error);
        // Continue to next account
      }
    }

    console.log("[AccountPurge] Job finished.");

  } catch (error) {
    console.error("[AccountPurge] Job failed with an error:", error);
    throw error; // Throw error to indicate failure to the invoker (EventBridge)
  }
};