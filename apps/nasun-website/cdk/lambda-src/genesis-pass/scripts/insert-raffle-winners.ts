/**
 * Script: insert allowlist entries into Genesis Pass allowlist by X handle.
 *
 * Scans UserProfiles to match X handles, extracts MetaMask wallet addresses,
 * and inserts into genesis-pass-allowlist with the configured mintType.
 *
 * Environment variables:
 *   EXECUTE=1        Actually write to DynamoDB (default: dry run)
 *   MINT_TYPE=...    mintType value (default: FREE_MINT)
 *   SOURCE=...       source value (default: RAFFLE)
 *   HANDLES=...      Comma-separated X handles (default: built-in raffle list)
 *
 * Usage:
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *
 *   # Raffle winners (default)
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/insert-raffle-winners.ts
 *
 *   # GTD allowlist
 *   HANDLES="handle1,handle2" MINT_TYPE=GUARANTEED SOURCE=MANUAL_GTD \
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/insert-raffle-winners.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const MINT_TYPE = process.env.MINT_TYPE || "FREE_MINT";
const SOURCE = process.env.SOURCE || "RAFFLE";
const USER_PROFILES_TABLE = "UserProfiles";
const ALLOWLIST_TABLE = "nasun-genesis-pass-allowlist";

// Default: raffle winners (37 X handles, without @ prefix)
const DEFAULT_HANDLES = [
  "theJediworld77", "ApexSeek", "sch_stev", "igangsan54078", "hyonggoo93",
  "ccboomer_", "thatboytimiyy", "ShanQuesq", "saera84", "Pressure_404",
  "kangtaehong88", "iam_aesir", "HUR_YG", "D33n_web3", "Altra_Beta7",
  "lmslms1004", "munchanghw98379", "Jeyyderh", "likebluesky88", "JH_929292",
  "akeu19017403", "zzangddoru", "baegseungh7061", "fomodegen2424", "0xdulham",
  "spiral_xx", "bliss_rh", "wiyeonsug", "ihuisang5", "jeongseonmun2",
  "ashrai78", "CoinmasterPeace", "ausbro80", "hayandaejang", "TripleNineGate",
  "ReopaahScrin", "0xjtrade",
];

const HANDLES = process.env.HANDLES
  ? process.env.HANDLES.split(",").map((h) => h.trim()).filter(Boolean)
  : DEFAULT_HANDLES;

// Build a lowercase Set for case-insensitive matching
const handleSet = new Set(HANDLES.map((h) => h.toLowerCase()));

interface UserProfile {
  identityId: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  provider?: string;
  walletAddress?: string;
  linkedAccounts?: {
    twitter?: { twitterHandle?: string; originalTwitterHandle?: string };
    metamask?: { walletAddress?: string };
  };
}

/** Extract EVM wallet address from a UserProfile item. */
function extractEvmWallet(profile: UserProfile): string | undefined {
  const linked = profile.linkedAccounts?.metamask?.walletAddress;
  if (linked) return linked.toLowerCase();
  if (profile.provider === "MetaMask" && profile.walletAddress) {
    return profile.walletAddress.toLowerCase();
  }
  return undefined;
}

/** Extract all possible twitter handles from a profile for matching. */
function extractHandles(profile: UserProfile): string[] {
  const handles: string[] = [];
  if (profile.twitterHandle) handles.push(profile.twitterHandle);
  if (profile.originalTwitterHandle) handles.push(profile.originalTwitterHandle);
  const linked = profile.linkedAccounts?.twitter;
  if (linked?.twitterHandle) handles.push(linked.twitterHandle);
  if (linked?.originalTwitterHandle) handles.push(linked.originalTwitterHandle);
  return handles;
}

/** Scan entire UserProfiles table with pagination. */
async function scanAllUserProfiles(): Promise<UserProfile[]> {
  const items: UserProfile[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: USER_PROFILES_TABLE,
        ProjectionExpression:
          "identityId, twitterHandle, originalTwitterHandle, provider, walletAddress, linkedAccounts",
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) {
      items.push(...(result.Items as UserProfile[]));
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

interface MatchResult {
  handle: string;
  identityId: string;
  walletAddress: string;
  matchedField: string;
}

async function main() {
  console.log(`=== Insert Allowlist Entries (${EXECUTE ? "EXECUTE" : "DRY RUN"}) ===\n`);
  console.log(`Handles: ${HANDLES.length} (${process.env.HANDLES ? "custom" : "default raffle list"})`);
  console.log(`mintType: ${MINT_TYPE}, source: ${SOURCE}`);
  console.log(`Target table: ${ALLOWLIST_TABLE}\n`);

  // 1. Scan UserProfiles
  console.log("Scanning UserProfiles...");
  const allProfiles = await scanAllUserProfiles();
  console.log(`Total profiles scanned: ${allProfiles.length}\n`);

  // 2. Match raffle handles
  const matched: MatchResult[] = [];
  const noWallet: { handle: string; identityId: string }[] = [];
  const remainingHandles = new Set(handleSet);

  for (const profile of allProfiles) {
    const handles = extractHandles(profile);

    for (const h of handles) {
      const lower = h.toLowerCase();
      if (remainingHandles.has(lower)) {
        const wallet = extractEvmWallet(profile);
        if (wallet) {
          matched.push({
            handle: h,
            identityId: profile.identityId,
            walletAddress: wallet,
            matchedField: h === profile.twitterHandle ? "twitterHandle" : "originalTwitterHandle/linked",
          });
        } else {
          noWallet.push({ handle: h, identityId: profile.identityId });
        }
        remainingHandles.delete(lower);
        break;
      }
    }
  }

  const notFound = Array.from(remainingHandles);

  console.log(`Matched with wallet: ${matched.length}`);
  console.log(`Matched without wallet: ${noWallet.length}`);
  console.log(`Not found in DB: ${notFound.length}\n`);

  if (noWallet.length > 0) {
    console.log("--- No MetaMask wallet (skipped) ---");
    for (const entry of noWallet) {
      console.log(`  @${entry.handle} (identity: ${entry.identityId})`);
    }
    console.log();
  }

  if (notFound.length > 0) {
    console.log("--- Not found in UserProfiles ---");
    for (const h of notFound) {
      console.log(`  @${h}`);
    }
    console.log();
  }

  // 3. Insert/update allowlist entries
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of matched) {
    // Check if already registered
    const existing = await client.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: entry.walletAddress },
      }),
    );

    if (existing.Item) {
      // Already registered: only add mintType/source if not set
      if (existing.Item.mintType) {
        console.log(`  SKIP @${entry.handle} (${entry.walletAddress}) - already has mintType: ${existing.Item.mintType}`);
        skipped++;
        continue;
      }

      console.log(`  UPDATE @${entry.handle} (${entry.walletAddress}) - adding ${MINT_TYPE} tag`);
      if (EXECUTE) {
        await client.send(
          new UpdateCommand({
            TableName: ALLOWLIST_TABLE,
            Key: { walletAddress: entry.walletAddress },
            UpdateExpression: "SET mintType = :mt, #src = :src, twitterHandle = :th",
            ExpressionAttributeNames: { "#src": "source" },
            ExpressionAttributeValues: {
              ":mt": MINT_TYPE,
              ":src": SOURCE,
              ":th": entry.handle,
            },
          }),
        );
      }
      updated++;
    } else {
      // New entry
      console.log(`  INSERT @${entry.handle} (${entry.walletAddress})`);
      if (EXECUTE) {
        try {
          await client.send(
            new PutCommand({
              TableName: ALLOWLIST_TABLE,
              Item: {
                walletAddress: entry.walletAddress,
                identityId: entry.identityId,
                registeredAt: new Date().toISOString(),
                status: "ACTIVE",
                mintType: MINT_TYPE,
                source: SOURCE,
                twitterHandle: entry.handle,
              },
              ConditionExpression: "attribute_not_exists(walletAddress)",
            }),
          );
        } catch (err: any) {
          if (err.name === "ConditionalCheckFailedException") {
            console.log(`    (entry appeared since check, skipped)`);
            skipped++;
            continue;
          }
          throw err;
        }
      }
      inserted++;
    }
  }

  // 4. Report
  console.log("\n=== Report ===");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated (added ${MINT_TYPE}): ${updated}`);
  console.log(`Skipped (already has mintType): ${skipped}`);
  console.log(`No MetaMask wallet: ${noWallet.length} [${noWallet.map((e) => `@${e.handle}`).join(", ")}]`);
  console.log(`Not found: ${notFound.length} [${notFound.map((h) => `@${h}`).join(", ")}]`);

  if (!EXECUTE) {
    console.log("\n(DRY RUN - no changes made. Set EXECUTE=1 to apply.)");
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
