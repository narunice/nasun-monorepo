#!/usr/bin/env npx tsx
/**
 * Tag bot accounts in DynamoDB production tables.
 *
 * Adds two fields to matching records:
 *   - probableBot: true (Boolean)
 *   - botTier: 1 or 2 (Number)
 *
 * Tables:
 *   - nasun-airdrop-registrations (PK: identityId)
 *   - UserProfiles (PK: identityId)
 *   - nasun-genesis-pass-allowlist (PK: walletAddress, lookup via identityId field)
 *
 * Usage:
 *   npx tsx scripts/tag-bot-accounts.ts --dry-run   # preview only
 *   npx tsx scripts/tag-bot-accounts.ts              # apply to prod
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";

const AWS_PROFILE = "nasun-prod";
const AWS_REGION = "ap-northeast-2";
const DRY_RUN = process.argv.includes("--dry-run");

interface TableConfig {
  tableName: string;
  pkField: string;
  lookupField: string; // field to match against botMap keys (identityId)
}

const TABLE_CONFIGS: TableConfig[] = [
  { tableName: "nasun-airdrop-registrations", pkField: "identityId", lookupField: "identityId" },
  { tableName: "UserProfiles", pkField: "identityId", lookupField: "identityId" },
  { tableName: "nasun-genesis-pass-allowlist", pkField: "walletAddress", lookupField: "identityId" },
];

// ========== Load bot data ==========

function loadBotIdentityIds(): Map<string, number> {
  const tier1Wallets = new Set(
    readFileSync("/tmp/tier1-bots.txt", "utf-8").trim().split("\n"),
  );
  const tier2Wallets = new Set(
    readFileSync("/tmp/tier2-bots.txt", "utf-8").trim().split("\n"),
  );
  const mapping = readFileSync("/tmp/wallet-identity-map.txt", "utf-8")
    .trim()
    .split("\n");

  const botMap = new Map<string, number>(); // identityId -> tier

  for (const line of mapping) {
    const [wallet, identityId] = line.split("\t");
    if (tier1Wallets.has(wallet)) {
      botMap.set(identityId, 1);
    } else if (tier2Wallets.has(wallet)) {
      botMap.set(identityId, 2);
    }
  }

  return botMap;
}

// ========== DynamoDB helpers ==========

function dynamoScanForBotMatches(
  config: TableConfig,
  botMap: Map<string, number>,
): Array<{ pk: string; tier: number }> {
  const matches: Array<{ pk: string; tier: number }> = [];
  let startKey: string | undefined;

  // Project only the fields we need
  const fields = new Set([config.pkField, config.lookupField]);
  const projection = [...fields].join(", ");

  for (let page = 0; page < 200; page++) {
    let cmd = `aws dynamodb scan --table-name "${config.tableName}" --projection-expression "${projection}" --region ${AWS_REGION} --profile ${AWS_PROFILE} --no-paginate`;
    if (startKey) cmd += ` --exclusive-start-key '${startKey}'`;

    try {
      const out = execSync(cmd, { encoding: "utf-8", timeout: 60_000 });
      const parsed = JSON.parse(out);
      for (const item of parsed.Items || []) {
        const lookupId = item[config.lookupField]?.S;
        const pkValue = item[config.pkField]?.S;
        if (!lookupId || !pkValue) continue;

        const tier = botMap.get(lookupId);
        if (tier) {
          matches.push({ pk: pkValue, tier });
        }
      }
      if (!parsed.LastEvaluatedKey) break;
      startKey = JSON.stringify(parsed.LastEvaluatedKey);
    } catch {
      break;
    }
  }
  return matches;
}

function dynamoUpdateBotFlag(
  tableName: string,
  pkField: string,
  pkValue: string,
  tier: number,
): boolean {
  const key = JSON.stringify({ [pkField]: { S: pkValue } });
  const cmd = `aws dynamodb update-item --table-name "${tableName}" --key '${key}' --update-expression "SET probableBot = :b, botTier = :t" --expression-attribute-values '{":b":{"BOOL":true},":t":{"N":"${tier}"}}' --region ${AWS_REGION} --profile ${AWS_PROFILE}`;

  try {
    execSync(cmd, { encoding: "utf-8", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

// ========== Main ==========

async function main() {
  console.log(`=== Tag Bot Accounts in DynamoDB ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE (production)"}\n`);

  console.log("[1] Loading bot identity mapping...");
  const botMap = loadBotIdentityIds();

  const tier1Count = [...botMap.values()].filter((t) => t === 1).length;
  const tier2Count = [...botMap.values()].filter((t) => t === 2).length;
  console.log(`  Tier 1 (confirmed): ${tier1Count}`);
  console.log(`  Tier 2 (probable):  ${tier2Count}`);
  console.log(`  Total:              ${botMap.size}\n`);

  for (const config of TABLE_CONFIGS) {
    console.log(`[${config.tableName}] (PK: ${config.pkField}, lookup: ${config.lookupField})`);

    console.log("  Scanning for bot matches...");
    const matches = dynamoScanForBotMatches(config, botMap);

    const t1 = matches.filter((m) => m.tier === 1).length;
    const t2 = matches.filter((m) => m.tier === 2).length;
    console.log(`  Bots found: ${matches.length} (tier1=${t1}, tier2=${t2})`);

    if (DRY_RUN) {
      console.log("  [DRY RUN] Skipping updates.\n");
      continue;
    }

    let success = 0;
    let fail = 0;
    for (let i = 0; i < matches.length; i++) {
      const { pk, tier } = matches[i];
      if (dynamoUpdateBotFlag(config.tableName, config.pkField, pk, tier)) {
        success++;
      } else {
        fail++;
        console.error(`  FAIL: ${pk}`);
      }
      if ((i + 1) % 500 === 0) {
        console.log(`  Progress: ${i + 1}/${matches.length}`);
      }
    }
    console.log(`  Done: ${success} updated, ${fail} failed\n`);
  }

  console.log("=== Complete ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
