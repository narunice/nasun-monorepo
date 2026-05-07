#!/usr/bin/env npx tsx
/**
 * Backfill telegramUsername to lowercase in UserProfiles.
 *
 * Scans all records with a non-null telegramUsername and updates any that
 * contain uppercase characters, normalizing to lowercase.
 *
 * Usage:
 *   npx tsx scripts/backfill-telegram-username-lowercase.ts --dry-run
 *   npx tsx scripts/backfill-telegram-username-lowercase.ts
 */

import { execSync } from "child_process";

const AWS_PROFILE = "nasun-prod";
const AWS_REGION = "ap-northeast-2";
const TABLE_NAME = "UserProfiles";
const DRY_RUN = process.argv.includes("--dry-run");

function awsCli(args: string): string {
  return execSync(
    `aws ${args} --region ${AWS_REGION} --profile ${AWS_PROFILE} --output json`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString();
}

interface UserProfileItem {
  identityId: { S: string };
  telegramUsername?: { S: string };
}

interface ScanResult {
  Items: UserProfileItem[];
  LastEvaluatedKey?: unknown;
}

async function run() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Table: ${TABLE_NAME}\n`);

  let totalScanned = 0;
  let totalNeedsUpdate = 0;
  let totalUpdated = 0;
  let startKey: string | undefined;
  let page = 0;

  do {
    page++;
    const startKeyArg = startKey
      ? `--exclusive-start-key '${startKey}'`
      : "";

    const raw = awsCli(
      `dynamodb scan --table-name ${TABLE_NAME} ` +
      `--filter-expression "attribute_exists(telegramUsername)" ` +
      `--projection-expression "identityId, telegramUsername" ` +
      `${startKeyArg}`
    );

    const result: ScanResult = JSON.parse(raw);
    const items = result.Items ?? [];
    totalScanned += items.length;

    for (const item of items) {
      const identityId = item.identityId?.S;
      const username = item.telegramUsername?.S;

      if (!identityId || !username) continue;

      const lowered = username.toLowerCase();
      if (lowered === username) continue;

      totalNeedsUpdate++;
      console.log(`  [UPDATE] ${identityId}: "${username}" -> "${lowered}"`);

      if (!DRY_RUN) {
        const key = JSON.stringify({ identityId: { S: identityId } });
        const vals = JSON.stringify({ ":u": { S: lowered } });
        awsCli(
          `dynamodb update-item --table-name ${TABLE_NAME} ` +
          `--key '${key}' ` +
          `--update-expression "SET telegramUsername = :u" ` +
          `--expression-attribute-values '${vals}'`
        );
        totalUpdated++;
      }
    }

    process.stdout.write(`  Page ${page}: scanned ${totalScanned} total\r`);
    startKey = result.LastEvaluatedKey
      ? JSON.stringify(result.LastEvaluatedKey)
      : undefined;
  } while (startKey);

  console.log(`\n\nDone.`);
  console.log(`  Total scanned : ${totalScanned}`);
  console.log(`  Needs update  : ${totalNeedsUpdate}`);
  if (!DRY_RUN) {
    console.log(`  Updated       : ${totalUpdated}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
