/**
 * Migration script: promote all APPLIED entries to ACTIVE (FCFS allowlist).
 *
 * Targets: all entries with status=APPLIED.
 * - Sets status=ACTIVE only (no mintType assigned = FCFS standard mint).
 * - FREE_MINT / GUARANTEED entries are unaffected (already ACTIVE).
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
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/migrate-applied-to-fcfs.ts
 *
 *   # Actual run
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/migrate-applied-to-fcfs.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const ALLOWLIST_TABLE = "nasun-genesis-pass-allowlist";

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

async function main() {
  console.log(`=== Genesis Pass: Promote APPLIED to ACTIVE (FCFS) ===`);
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Target table: ${ALLOWLIST_TABLE}`);
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
  const guaranteedItems = activeItems.filter((i) => i.mintType === "GUARANTEED");

  console.log();
  console.log("--- Current Status Breakdown ---");
  console.log(`  ACTIVE: ${activeItems.length} (FREE_MINT: ${freeMintItems.length}, GUARANTEED: ${guaranteedItems.length})`);
  console.log(`  APPLIED: ${appliedItems.length}`);
  console.log(`  WITHDRAWN: ${withdrawnItems.length}`);
  console.log(`  LEGACY: ${legacyItems.length}`);
  console.log();

  if (appliedItems.length === 0) {
    console.log("No APPLIED entries found. Nothing to migrate.");
    return;
  }

  console.log(`--- Migration Plan ---`);
  console.log(`  ${appliedItems.length} APPLIED entries will be promoted to ACTIVE (FCFS, no mintType)`);
  console.log();

  // 3. Backup: output full APPLIED list as JSON
  console.log("--- BACKUP (APPLIED entries JSON) ---");
  console.log(JSON.stringify(appliedItems.map((i) => ({
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

  // 4. Execute migration
  let success = 0;
  let skipped = 0;
  let failed = 0;

  console.log("Promoting APPLIED entries to ACTIVE...");
  for (const item of appliedItems) {
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
      console.log(`  OK: ${item.walletAddress}`);
      success++;
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

  // 5. Report
  console.log();
  console.log(`=== Migration Complete ===`);
  console.log(`Promoted to ACTIVE: ${success}`);
  console.log(`Skipped (condition not met): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${success + skipped + failed}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
