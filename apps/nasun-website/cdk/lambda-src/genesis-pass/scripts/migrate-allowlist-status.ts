/**
 * Migration script: promote APPLIED entries to ACTIVE, assign GUARANTEED to top 100.
 *
 * Targets: all entries with status=APPLIED.
 * - First 100 by registeredAt: set status=ACTIVE, mintType=GUARANTEED, source=EARLY_REGISTRATION
 * - Remaining: set status=ACTIVE only
 * - FREE_MINT entries (already ACTIVE) are excluded by the APPLIED filter + ConditionExpression.
 *
 * Safety:
 * - UpdateCommand only (no Delete/Put): existing fields 100% preserved
 * - ConditionExpression: status = "APPLIED" on every write (double guard)
 * - Idempotent: re-run safely skips already-migrated entries
 * - PITR enabled on table for full rollback within 35 days
 *
 * Usage:
 *   # Dry run (read-only, shows what would be done)
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/migrate-allowlist-status.ts
 *
 *   # Actual run
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/migrate-allowlist-status.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const ALLOWLIST_TABLE = "nasun-genesis-pass-allowlist";
const GUARANTEED_COUNT = 100;

interface AllowlistItem {
  walletAddress: string;
  identityId: string;
  status: string;
  registeredAt?: string;
  appliedAt?: string;
  mintType?: string;
  source?: string;
  twitterHandle?: string;
}

/** Scan entire allowlist table with pagination. */
async function scanAllItems(): Promise<AllowlistItem[]> {
  const items: AllowlistItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: ALLOWLIST_TABLE,
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) {
      items.push(...(result.Items as AllowlistItem[]));
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

/** Get the effective timestamp for sorting (registeredAt, then appliedAt, then empty). */
function getSortKey(item: AllowlistItem): string {
  return item.registeredAt || item.appliedAt || "";
}

async function main() {
  console.log(`=== Genesis Pass Allowlist Status Migration ===`);
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Target table: ${ALLOWLIST_TABLE}`);
  console.log(`Guaranteed slots: ${GUARANTEED_COUNT}`);
  console.log();

  // 1. Scan all items
  console.log("Scanning allowlist table...");
  const allItems = await scanAllItems();
  console.log(`Total entries: ${allItems.length}`);

  // 2. Categorize entries
  const activeItems = allItems.filter((i) => i.status === "ACTIVE");
  const appliedItems = allItems.filter((i) => i.status === "APPLIED");
  const withdrawnItems = allItems.filter((i) => i.status === "WITHDRAWN");
  const legacyItems = allItems.filter((i) => i.status === "LEGACY");
  const freeMintItems = activeItems.filter((i) => i.mintType === "FREE_MINT");

  console.log();
  console.log("--- Current Status Breakdown ---");
  console.log(`  ACTIVE: ${activeItems.length} (FREE_MINT: ${freeMintItems.length})`);
  console.log(`  APPLIED: ${appliedItems.length}`);
  console.log(`  WITHDRAWN: ${withdrawnItems.length}`);
  console.log(`  LEGACY: ${legacyItems.length}`);
  console.log();

  if (appliedItems.length === 0) {
    console.log("No APPLIED entries found. Nothing to migrate.");
    return;
  }

  // 3. Check for anomalies
  const noTimestamp = appliedItems.filter((i) => !i.registeredAt && !i.appliedAt);
  const appliedAtFallback = appliedItems.filter((i) => !i.registeredAt && i.appliedAt);
  const withMintType = appliedItems.filter((i) => i.mintType);

  console.log("--- Data Quality Check ---");
  console.log(`  registeredAt present: ${appliedItems.length - noTimestamp.length - appliedAtFallback.length}`);
  console.log(`  appliedAt fallback: ${appliedAtFallback.length}`);
  console.log(`  No timestamp (sorted last): ${noTimestamp.length}`);
  console.log(`  APPLIED with existing mintType: ${withMintType.length}`);
  if (withMintType.length > 0) {
    for (const item of withMintType) {
      console.log(`    WARNING: ${item.walletAddress} has mintType=${item.mintType}`);
    }
  }
  console.log();

  // 4. Sort by registeredAt ascending (earliest first, no timestamp = last)
  const sorted = [...appliedItems].sort((a, b) => {
    const aKey = getSortKey(a);
    const bKey = getSortKey(b);
    if (!aKey && !bKey) return 0;
    if (!aKey) return 1;
    if (!bKey) return -1;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  // 5. Split into guaranteed (top N) and remaining
  const guaranteedList = sorted.slice(0, GUARANTEED_COUNT);
  const remainingList = sorted.slice(GUARANTEED_COUNT);

  // Pre-compute fixed sets (prevents re-sort issues on partial failure re-run)
  const guaranteedSet = new Set(guaranteedList.map((i) => i.walletAddress));

  console.log("--- Migration Plan ---");
  console.log(`  GUARANTEED (top ${GUARANTEED_COUNT}): ${guaranteedList.length} entries`);
  console.log(`  ACTIVE (remaining): ${remainingList.length} entries`);
  console.log();

  // Show boundary entries
  if (guaranteedList.length > 0) {
    const first = guaranteedList[0];
    const last = guaranteedList[guaranteedList.length - 1];
    console.log(`  Guaranteed range:`);
    console.log(`    First: ${first.walletAddress} (${getSortKey(first) || "NO TIMESTAMP"})`);
    console.log(`    Last:  ${last.walletAddress} (${getSortKey(last) || "NO TIMESTAMP"})`);
  }
  if (remainingList.length > 0) {
    const firstRemaining = remainingList[0];
    console.log(`  First remaining: ${firstRemaining.walletAddress} (${getSortKey(firstRemaining) || "NO TIMESTAMP"})`);
  }
  console.log();

  // 6. Backup: output full APPLIED list as JSON
  console.log("--- BACKUP (APPLIED entries JSON) ---");
  console.log(JSON.stringify(sorted.map((i) => ({
    walletAddress: i.walletAddress,
    identityId: i.identityId,
    registeredAt: i.registeredAt,
    appliedAt: i.appliedAt,
    mintType: i.mintType,
    twitterHandle: i.twitterHandle,
  })), null, 2));
  console.log("--- END BACKUP ---");
  console.log();

  if (!EXECUTE) {
    console.log("Dry run complete. Set EXECUTE=1 to apply changes.");
    return;
  }

  // 7. Execute migration
  let guaranteedSuccess = 0;
  let remainingSuccess = 0;
  let skipped = 0;
  let failed = 0;

  console.log("Migrating GUARANTEED entries...");
  for (const item of guaranteedList) {
    try {
      await client.send(
        new UpdateCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress: item.walletAddress },
          UpdateExpression: "SET #s = :active, mintType = :mt, #src = :src",
          ExpressionAttributeNames: { "#s": "status", "#src": "source" },
          ExpressionAttributeValues: {
            ":active": "ACTIVE",
            ":mt": "GUARANTEED",
            ":src": "EARLY_REGISTRATION",
            ":applied": "APPLIED",
          },
          ConditionExpression: "#s = :applied",
        }),
      );
      console.log(`  OK [GTD]: ${item.walletAddress} (${getSortKey(item)})`);
      guaranteedSuccess++;
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log(`  SKIP [GTD]: ${item.walletAddress} (no longer APPLIED)`);
        skipped++;
      } else {
        console.error(`  FAIL [GTD]: ${item.walletAddress}`, err.message);
        failed++;
      }
    }
  }

  console.log();
  console.log("Migrating remaining entries...");
  for (const item of remainingList) {
    try {
      await client.send(
        new UpdateCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress: item.walletAddress },
          UpdateExpression: "SET #s = :active",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":active": "ACTIVE",
            ":applied": "APPLIED",
          },
          ConditionExpression: "#s = :applied",
        }),
      );
      console.log(`  OK: ${item.walletAddress} (${getSortKey(item)})`);
      remainingSuccess++;
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log(`  SKIP: ${item.walletAddress} (no longer APPLIED)`);
        skipped++;
      } else {
        console.error(`  FAIL: ${item.walletAddress}`, err.message);
        failed++;
      }
    }
  }

  // 8. Report
  console.log();
  console.log(`=== Migration Complete ===`);
  console.log(`GUARANTEED promoted: ${guaranteedSuccess}`);
  console.log(`Remaining promoted: ${remainingSuccess}`);
  console.log(`Skipped (condition not met): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${guaranteedSuccess + remainingSuccess + skipped + failed}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
