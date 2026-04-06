/**
 * Script: insert admin wallet addresses directly into the Genesis Pass allowlist table.
 *
 * Environment variables:
 *   EXECUTE=1   Actually write to DynamoDB (default: dry run)
 *
 * Usage:
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *
 *   # Dry run
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/insert-admin-allowlist.ts
 *
 *   # Execute
 *   EXECUTE=1 AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/insert-admin-allowlist.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const ALLOWLIST_TABLE = "nasun-genesis-pass-allowlist";

interface AdminEntry {
  walletAddress: string;
  mintType: string | null;
  label: string;
}

const ADMIN_ENTRIES: AdminEntry[] = [
  {
    walletAddress: "0xE6828A10190b0360d75A1731C495FdEF604D4c5E",
    mintType: "FREE_MINT",
    label: "Admin 1 (Free Mint)",
  },
  {
    walletAddress: "0xe94978A2022CD517dCf578cD9BE1e4a6bd6B0828",
    mintType: "FREE_MINT",
    label: "Admin 2 (Free Mint)",
  },
  {
    walletAddress: "0xfEC9Dc32Fc39A0fCd800bAc4e8068EE4bFB8397a",
    mintType: "GUARANTEED",
    label: "Admin 3 (GTD)",
  },
  {
    walletAddress: "0x963b77F425CD0F20456E1099b4061d59882DfD3E",
    mintType: null,
    label: "Admin 4 (FCFS)",
  },
];

async function main() {
  console.log(`=== Insert Admin Allowlist (${EXECUTE ? "EXECUTE" : "DRY RUN"}) ===\n`);
  console.log(`Target table: ${ALLOWLIST_TABLE}\n`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of ADMIN_ENTRIES) {
    const normalizedAddress = entry.walletAddress.toLowerCase();

    const existing = await client.send(
      new GetCommand({ TableName: ALLOWLIST_TABLE, Key: { walletAddress: normalizedAddress } }),
    );

    if (existing.Item) {
      const currentMintType = existing.Item.mintType || null;
      const desiredMintType = entry.mintType || null;

      if (currentMintType === desiredMintType) {
        console.log(`  SKIP ${entry.label} (${normalizedAddress}) - already correct (status: ${existing.Item.status}, mintType: ${currentMintType})`);
        skipped++;
        continue;
      }

      // Update mintType for existing entry
      console.log(`  UPDATE ${entry.label} (${normalizedAddress}) -> mintType: ${currentMintType} => ${desiredMintType || "(none/FCFS)"}`);
      if (EXECUTE) {
        if (desiredMintType) {
          await client.send(
            new UpdateCommand({
              TableName: ALLOWLIST_TABLE,
              Key: { walletAddress: normalizedAddress },
              UpdateExpression: "SET mintType = :mt",
              ExpressionAttributeValues: { ":mt": desiredMintType },
            }),
          );
        } else {
          await client.send(
            new UpdateCommand({
              TableName: ALLOWLIST_TABLE,
              Key: { walletAddress: normalizedAddress },
              UpdateExpression: "REMOVE mintType",
            }),
          );
        }
      }
      updated++;
      continue;
    }

    const item: Record<string, unknown> = {
      walletAddress: normalizedAddress,
      identityId: "ADMIN",
      registeredAt: new Date().toISOString(),
      status: "ACTIVE",
      source: "ADMIN_MANUAL",
    };

    if (entry.mintType) {
      item.mintType = entry.mintType;
    }

    console.log(`  INSERT ${entry.label} (${normalizedAddress}) -> mintType: ${entry.mintType || "(none/FCFS)"}`);

    if (EXECUTE) {
      await client.send(
        new PutCommand({ TableName: ALLOWLIST_TABLE, Item: item }),
      );
    }

    inserted++;
  }

  console.log("\n=== Report ===");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  if (!EXECUTE) {
    console.log("\n(DRY RUN - no changes made. Set EXECUTE=1 to apply.)");
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
