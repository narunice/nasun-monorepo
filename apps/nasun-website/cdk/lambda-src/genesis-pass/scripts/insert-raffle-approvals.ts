/**
 * One-time script: insert raffle winner identityIds into Genesis Pass approvals table.
 *
 * When approved users later connect MetaMask and click "Join", the register Lambda
 * automatically applies mintType: "FREE_MINT" and source: "RAFFLE".
 *
 * Usage:
 *   cd apps/nasun-website/cdk/lambda-src/genesis-pass
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/insert-raffle-approvals.ts
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/insert-raffle-approvals.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXECUTE = process.env.EXECUTE === "1";
const USER_PROFILES_TABLE = "UserProfiles";
const APPROVALS_TABLE = "nasun-genesis-pass-approvals";

const RAFFLE_HANDLES = [
  "theJediworld77", "ApexSeek", "sch_stev", "igangsan54078", "hyonggoo93",
  "ccboomer_", "thatboytimiyy", "ShanQuesq", "saera84", "Pressure_404",
  "kangtaehong88", "iam_aesir", "HUR_YG", "D33n_web3", "Altra_Beta7",
  "lmslms1004", "munchanghw98379", "Jeyyderh", "likebluesky88", "JH_929292",
  "akeu19017403", "zzangddoru", "baegseungh7061", "fomodegen2424", "0xdulham",
  "spiral_xx", "bliss_rh", "wiyeonsug", "ihuisang5", "jeongseonmun2",
  "ashrai78", "CoinmasterPeace", "ausbro80", "hayandaejang", "TripleNineGate",
  "ReopaahScrin", "0xjtrade",
];

const handleSet = new Set(RAFFLE_HANDLES.map((h) => h.toLowerCase()));

interface UserProfile {
  identityId: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  linkedAccounts?: {
    twitter?: { twitterHandle?: string; originalTwitterHandle?: string };
  };
}

function extractHandles(profile: UserProfile): string[] {
  const handles: string[] = [];
  if (profile.twitterHandle) handles.push(profile.twitterHandle);
  if (profile.originalTwitterHandle) handles.push(profile.originalTwitterHandle);
  const linked = profile.linkedAccounts?.twitter;
  if (linked?.twitterHandle) handles.push(linked.twitterHandle);
  if (linked?.originalTwitterHandle) handles.push(linked.originalTwitterHandle);
  return handles;
}

async function scanAllUserProfiles(): Promise<UserProfile[]> {
  const items: UserProfile[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: USER_PROFILES_TABLE,
        ProjectionExpression: "identityId, twitterHandle, originalTwitterHandle, linkedAccounts",
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...(result.Items as UserProfile[]));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

async function main() {
  console.log(`=== Insert Raffle Approvals (${EXECUTE ? "EXECUTE" : "DRY RUN"}) ===\n`);
  console.log(`Raffle handles: ${RAFFLE_HANDLES.length}`);
  console.log(`Target table: ${APPROVALS_TABLE}\n`);

  console.log("Scanning UserProfiles...");
  const allProfiles = await scanAllUserProfiles();
  console.log(`Total profiles scanned: ${allProfiles.length}\n`);

  const matched: { handle: string; identityId: string }[] = [];
  const remainingHandles = new Set(handleSet);

  for (const profile of allProfiles) {
    const handles = extractHandles(profile);
    for (const h of handles) {
      if (remainingHandles.has(h.toLowerCase())) {
        matched.push({ handle: h, identityId: profile.identityId });
        remainingHandles.delete(h.toLowerCase());
        break;
      }
    }
  }

  const notFound = Array.from(remainingHandles);
  console.log(`Matched: ${matched.length}`);
  console.log(`Not found: ${notFound.length}\n`);

  if (notFound.length > 0) {
    console.log("--- Not found in UserProfiles ---");
    for (const h of notFound) console.log(`  @${h}`);
    console.log();
  }

  let inserted = 0;
  let skipped = 0;

  for (const entry of matched) {
    const existing = await client.send(
      new GetCommand({ TableName: APPROVALS_TABLE, Key: { identityId: entry.identityId } }),
    );

    if (existing.Item) {
      console.log(`  SKIP @${entry.handle} (${entry.identityId}) - already approved`);
      skipped++;
      continue;
    }

    console.log(`  INSERT @${entry.handle} (${entry.identityId})`);
    if (EXECUTE) {
      await client.send(
        new PutCommand({
          TableName: APPROVALS_TABLE,
          Item: {
            identityId: entry.identityId,
            mintType: "FREE_MINT",
            source: "RAFFLE",
            twitterHandle: entry.handle,
            approvedAt: new Date().toISOString(),
          },
        }),
      );
    }
    inserted++;
  }

  console.log("\n=== Report ===");
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already approved): ${skipped}`);
  console.log(`Not found: ${notFound.length}`);

  if (!EXECUTE) {
    console.log("\n(DRY RUN - no changes made. Set EXECUTE=1 to apply.)");
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
