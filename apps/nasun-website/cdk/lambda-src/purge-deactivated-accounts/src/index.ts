import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityClient, UnlinkIdentityCommand, DescribeIdentityCommand } from "@aws-sdk/client-cognito-identity";
import { mirrorIdentityWrite, authoritativeIdentityWrite, IDENTITY_ROUTES } from "../../_shared/auth/identity-write";

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

        // AWS-exit DAL 3d step-2: mirror the row deletion to the box nasun-identity service AFTER the
        // authoritative DynamoDB DeleteItem. Best-effort (mirrorIdentityWrite never throws; dal-reload
        // backstops) until /profile/delete is in IDENTITY_WRITE_FLIP_ROUTES, then authoritative. The
        // box route deletes only user_profiles (parity with this job, which leaves UserWallets orphaned)
        // and is idempotent, so retries are safe. ★ Authoritative-flip prerequisite: the per-account
        // catch below SWALLOWS errors, so an authoritative box-delete failure would be silently dropped
        // (persistent extra_in_box once dal-reload is stopped). Before adding /profile/delete to
        // FLIP_ROUTES, surface/record box-delete failures here (and add an extra_in_box sweep).
        const flipRoutes = (process.env.IDENTITY_WRITE_FLIP_ROUTES || '').split(',').map((s) => s.trim());
        if (flipRoutes.includes(IDENTITY_ROUTES.profileDelete)) {
          await authoritativeIdentityWrite(IDENTITY_ROUTES.profileDelete, { identityId }, { timeoutMs: 2500, retries: 1 });
        } else {
          await mirrorIdentityWrite(IDENTITY_ROUTES.profileDelete, { identityId });
        }

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