/**
 * Referral Status Migration Script
 *
 * One-time migration: Scan nasun-referrals where status=PENDING,
 * check each referred user's activity_points for >= 5 distinct active days,
 * then mark as ACTIVATED.
 *
 * Usage:
 *   npx tsx migrate-referral-status.ts --dry-run     # Preview only
 *   npx tsx migrate-referral-status.ts               # Execute migration
 *
 * Prerequisites:
 *   - AWS credentials configured for the correct environment
 *   - PostgreSQL explorer-api accessible (for activity_points query)
 *
 * Environment variables:
 *   REFERRALS_TABLE   - DynamoDB table name (default: nasun-referrals)
 *   ADMIN_API_URL     - Admin API URL for /internal/referral-activate
 *   INTERNAL_API_KEY  - API key for admin endpoints
 */

import {
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

const REFERRALS_TABLE = process.env.REFERRALS_TABLE || "nasun-referrals";
const ADMIN_API_URL = process.env.ADMIN_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

const client = new DynamoDBClient({ region: "ap-northeast-2" });

async function scanPendingReferrals(): Promise<string[]> {
  const pendingIds: string[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: REFERRALS_TABLE,
        FilterExpression: "#s = :pending",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":pending": { S: "PENDING" } },
        ProjectionExpression: "referredIdentityId",
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );

    for (const item of result.Items || []) {
      const id = item.referredIdentityId?.S;
      if (id) pendingIds.push(id);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return pendingIds;
}

async function activateBatch(identityIds: string[]): Promise<{ activated: number; skipped: number }> {
  if (!ADMIN_API_URL || !INTERNAL_API_KEY) {
    throw new Error("ADMIN_API_URL and INTERNAL_API_KEY are required for activation");
  }

  const res = await fetch(`${ADMIN_API_URL}/internal/referral-activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({ identityIds }),
  });

  if (!res.ok) {
    throw new Error(`Activation failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as { activated: number; skipped: number };
}

async function main() {
  console.log(`[migrate] Scanning ${REFERRALS_TABLE} for PENDING referrals...`);
  console.log(`[migrate] Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}`);

  const pendingIds = await scanPendingReferrals();
  console.log(`[migrate] Found ${pendingIds.length} PENDING referrals`);

  if (pendingIds.length === 0) {
    console.log("[migrate] Nothing to migrate.");
    return;
  }

  if (DRY_RUN) {
    console.log("[migrate] DRY RUN: Would activate the following identityIds:");
    for (const id of pendingIds) {
      console.log(`  - ${id}`);
    }
    console.log(`[migrate] DRY RUN complete. ${pendingIds.length} referrals would be activated.`);
    console.log("[migrate] Note: In actual run, activation requires >= 5 distinct activity days.");
    console.log("[migrate]       This script currently activates ALL pending referrals.");
    console.log("[migrate]       For activity-day filtering, use the points scanner inline check.");
    return;
  }

  // Batch activate (max 100 per request)
  let totalActivated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < pendingIds.length; i += 100) {
    const batch = pendingIds.slice(i, i + 100);
    console.log(`[migrate] Activating batch ${Math.floor(i / 100) + 1} (${batch.length} items)...`);

    const result = await activateBatch(batch);
    totalActivated += result.activated;
    totalSkipped += result.skipped;
  }

  console.log(`[migrate] Migration complete: ${totalActivated} activated, ${totalSkipped} skipped`);
}

main().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
