import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { mirrorIdentityWrite, authoritativeIdentityWrite, readIdentityRouteOrThrow, IDENTITY_ROUTES } from "../../_shared/auth/identity-write";

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;

const ddbClient = new DynamoDBClient({});

export const handler = async (_event?: unknown, context?: { callbackWaitsForEmptyEventLoop?: boolean }): Promise<void> => {
  // The box-scan read (PURGE_SCAN_SOURCE=box) uses Node fetch (undici); a kept-alive socket or an aborted-fetch
  // timer can leave the event loop non-empty, which under the default callbackWaitsForEmptyEventLoop=true abends
  // the runtime ("Runtime.NodeJsExit: Promise never settled") instead of returning. Every real operation below
  // is awaited, so finalizing as soon as the handler promise settles is safe (and matches the DynamoDB path).
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  console.log("[AccountPurge] Starting job to purge deactivated accounts.");

  const now = Math.floor(Date.now() / 1000);
  let accountsToPurge: any[] = [];
  let lastEvaluatedKey: any = undefined;

  try {
    // 1. Enumerate accounts due for deletion (status=DEACTIVATED AND deletionScheduledAt<=now).
    const scanSource = (process.env.PURGE_SCAN_SOURCE || "ddb").toLowerCase();
    if (scanSource === "box") {
      // #3a-1: enumerate the box (the box-only deactivate queue once #3a-2 flips) instead of the frozen
      // DynamoDB follower. The box /profile/deactivated-due route returns every status=DEACTIVATED row with
      // deletionScheduledAt<=before. The purge needs ONLY identityId -- the box /profile/delete + DynamoDB
      // DeleteItem below both key on identityId; the DynamoDB item never carried login-provider
      // attributes, so the per-login `account[login]?.S` was already always undefined (-> ''), so a box item
      // carrying only identityId is byte-faithful. A box read failure THROWS -> the run aborts and retries next
      // day (parity with the DynamoDB Scan's throw; deleting nothing is safe, a half-read deletion is NOT).
      // Reversible: PURGE_SCAN_SOURCE unset/"ddb" falls back to the DynamoDB Scan below.
      const out = await readIdentityRouteOrThrow(IDENTITY_ROUTES.deactivatedDue, { before: String(now) });
      const accounts = Array.isArray(out?.accounts) ? out.accounts : [];
      for (const a of accounts) {
        if (a && typeof a.identityId === "string" && a.identityId) {
          accountsToPurge.push({ identityId: { S: a.identityId } });
        }
      }
    } else {
      // DynamoDB Scan (default; pre-#3a-1 and the rollback path).
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
    }

    console.log(`[AccountPurge] Found ${accountsToPurge.length} accounts to purge (source=${scanSource}).`);

    // 2. Process each account for deletion. ORDER (AWS-exit DAL 3d step-2): the box delete runs BEFORE
    //    the DynamoDB DeleteItem -- the opposite of the dual-write routes -- so DynamoDB (this job's
    //    Scan source) is the LAST store cleared. A partial failure therefore leaves the account fully
    //    present in DynamoDB, so the next daily run re-Scans and retries it (the box /profile/delete
    //    route is idempotent). This converts a would-be PERMANENT extra_in_box (a box orphan that is
    //    never re-Scanned once the DynamoDB row is gone, unhealable after dal-reload stops) into a
    //    self-healing transient. If box is down, every box delete throws -> every DynamoDB delete is
    //    skipped -> the run purges nothing (no inconsistent half-deletes) and recovers on a later run.
    const purgeFailures: string[] = [];
    for (const account of accountsToPurge) {
      const identityId = account.identityId.S;
      if (!identityId) continue;

      try {
        // 2a. Delete from the box nasun-identity mirror FIRST (see order note above). Best-effort
        //     (mirrorIdentityWrite never throws; dal-reload backstops) until /profile/delete is in
        //     IDENTITY_WRITE_FLIP_ROUTES, then authoritative (throws -> the DynamoDB delete below is
        //     skipped, leaving the account in DynamoDB to be retried next run). The box route deletes
        //     only user_profiles (parity with this job, which leaves UserWallets orphaned), is
        //     idempotent (re-delete of a missing row is a 200 no-op), so retries are safe.
        const flipRoutes = (process.env.IDENTITY_WRITE_FLIP_ROUTES || '').split(',').map((s) => s.trim());
        if (flipRoutes.includes(IDENTITY_ROUTES.profileDelete)) {
          await authoritativeIdentityWrite(IDENTITY_ROUTES.profileDelete, { identityId }, { timeoutMs: 2500, retries: 1 });
        } else {
          await mirrorIdentityWrite(IDENTITY_ROUTES.profileDelete, { identityId });
        }

        // 2b. Delete from DynamoDB LAST (the Scan source).
        const deleteCmd = new DeleteItemCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: { S: identityId } },
        });
        await ddbClient.send(deleteCmd);
        console.log(`[AccountPurge] Purged ${identityId} (box then DynamoDB).`);

      } catch (error) {
        console.error(`[AccountPurge] Failed to fully purge ${identityId} (left in DynamoDB for the next run):`, error);
        purgeFailures.push(identityId);
        // Continue; the account remains fully present in DynamoDB and is retried on the next run.
      }
    }

    if (purgeFailures.length > 0) {
      // Surface (record, do NOT throw): log the affected ids without failing the invocation. Throwing
      // would trip EventBridge's default async auto-retries (2x immediate full-table re-Scans) and turn
      // a permanently-stuck account (e.g. a Cognito identity already gone) into a perpetual alarm. The
      // reorder above already leaves these accounts fully present in DynamoDB to be cleanly re-Scanned on
      // the next daily run, and dal-reconcile independently catches any resulting box<->DynamoDB drift.
      console.error(`[AccountPurge] ${purgeFailures.length} of ${accountsToPurge.length} account(s) not fully purged, retried next run: ${purgeFailures.join(', ')}`);
    }

    console.log("[AccountPurge] Job finished.");

  } catch (error) {
    console.error("[AccountPurge] Job failed with an error:", error);
    throw error; // Throw error to indicate failure to the invoker (EventBridge)
  }
};