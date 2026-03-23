/**
 * Migration script: mark pre-existing non-free-mint registrants as LEGACY.
 *
 * Targets: entries with status=ACTIVE and NO mintType attribute (45 entries).
 * FREE_MINT entries (23) are protected by attribute_not_exists(mintType) filter.
 *
 * Usage:
 *   # Dry run (read-only, shows what would be done)
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/migrate-legacy.ts
 *
 *   # Actual run
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/migrate-legacy.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const ALLOWLIST_TABLE = "nasun-genesis-pass-allowlist";

async function main() {
  console.log(`=== Genesis Pass LEGACY Migration ===`);
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log();

  // Scan for ACTIVE entries without mintType
  const result = await client.send(
    new ScanCommand({
      TableName: ALLOWLIST_TABLE,
      FilterExpression: "#s = :active AND attribute_not_exists(mintType)",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":active": "ACTIVE" },
    })
  );

  const items = result.Items || [];
  console.log(`Found ${items.length} entries to migrate (ACTIVE without mintType)`);
  console.log();

  if (items.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // Log all addresses for audit
  const addresses = items.map((item) => item.walletAddress as string);
  console.log("Addresses to migrate:");
  for (const addr of addresses) {
    console.log(`  ${addr}`);
  }
  console.log();

  if (!EXECUTE) {
    console.log("Dry run complete. Set EXECUTE=1 to apply changes.");
    return;
  }

  const migratedAt = new Date().toISOString();
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const walletAddress = item.walletAddress as string;
    try {
      await client.send(
        new UpdateCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress },
          UpdateExpression: "SET #s = :legacy, migratedAt = :ts",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":legacy": "LEGACY",
            ":ts": migratedAt,
            ":active": "ACTIVE",
          },
          // Double guard: only update if still ACTIVE and has no mintType
          ConditionExpression: "#s = :active AND attribute_not_exists(mintType)",
        })
      );
      console.log(`  OK: ${walletAddress}`);
      success++;
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log(`  SKIP: ${walletAddress} (condition not met, possibly already migrated or has mintType)`);
        skipped++;
      } else {
        console.error(`  FAIL: ${walletAddress}`, err.message);
        failed++;
      }
    }
  }

  console.log();
  console.log(`=== Migration Complete ===`);
  console.log(`Success: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Migration timestamp: ${migratedAt}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
