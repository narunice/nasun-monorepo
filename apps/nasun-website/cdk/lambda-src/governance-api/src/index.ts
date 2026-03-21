/**
 * Governance API V3 - Rank-Based Voting Power
 *
 * Calculates voting power from:
 * - Base power (10)
 * - X Account Linkage (+5)
 * - Telegram Channel Membership (+5)
 * - Leaderboard Rank Bonus (+10 to +20, proportional to rank 1-500)
 *
 * Server-side user resolution via UserWallets 2-hop lookup + conditional 3rd hop for linked accounts.
 * On-chain value = display value (integer, no scaling).
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64, toBase64 } from "@mysten/bcs";
import { bcs } from "@mysten/sui/bcs";

// Configure ed25519 to use sha512
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * Mask sensitive data in objects before logging to CloudWatch
 */
function maskSensitiveData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  const sensitiveFields = [
    "signature",
    "ethSignature",
    "accessToken",
    "privateKey",
    "secret",
    "password",
    "token",
    "apiKey",
    "secretKey",
  ];

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveData(item)) as T;
  }

  const masked = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      masked[key] = "[REDACTED]";
    } else if (typeof masked[key] === "object" && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked as T;
}

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Table names
const LEADERBOARD_V3_ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || "leaderboard-v3-accounts";
const LEADERBOARD_V3_SEASONS_TABLE = process.env.LEADERBOARD_V3_SEASONS_TABLE || "leaderboard-v3-seasons";
const LEADERBOARD_V3_SNAPSHOTS_TABLE = process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || "leaderboard-v3-snapshots";
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE || "UserWallets";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";

// V3 Voting Power constants
const BASE_POWER = 10;
const X_LINK_BONUS = 5;
const TELEGRAM_BONUS = 5;

// Oracle/Sponsor configuration
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io";

// Certificate TTL Policy
const DEFAULT_TTL_MS = 15 * 60 * 1000;  // 15 min (Devnet)
const MAX_TTL_MS = 30 * 60 * 1000;      // 30 min (Mainnet)

function calculateCertificateTTL(proposalExpiration?: number): number {
  const isMainnet = process.env.NETWORK === "mainnet";

  if (!isMainnet) {
    return DEFAULT_TTL_MS;
  }

  if (proposalExpiration) {
    const untilExpiration = proposalExpiration - Date.now();
    return Math.min(MAX_TTL_MS, Math.max(0, untilExpiration));
  }

  return MAX_TTL_MS;
}

const GOVERNANCE_PACKAGE_ID = process.env.GOVERNANCE_PACKAGE_ID || "";
const GOVERNANCE_ORIGINAL_PACKAGE_ID = process.env.GOVERNANCE_ORIGINAL_PACKAGE_ID || GOVERNANCE_PACKAGE_ID;
const PROPOSAL_TYPE_REGISTRY_ID = process.env.PROPOSAL_TYPE_REGISTRY_ID || "";

// Domain Separation (MUST match Move contract's DOMAIN_SEPARATOR)
const DOMAIN_SEPARATOR = "NASUN_GOVERNANCE_DEVNET_V1";

// Cached keypairs
let oraclePrivateKey: Uint8Array | null = null;
let sponsorKeypair: Ed25519Keypair | null = null;

async function getOraclePrivateKey(): Promise<Uint8Array> {
  if (oraclePrivateKey) return oraclePrivateKey;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun/governance/oracle" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  oraclePrivateKey = Buffer.from(privateKey, "hex");
  return oraclePrivateKey;
}

async function getSponsorKeypair(): Promise<Ed25519Keypair> {
  if (sponsorKeypair) return sponsorKeypair;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun/governance/sponsor" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  sponsorKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  return sponsorKeypair;
}

// Allowed MoveCall targets for sponsor (whitelist)
const ALLOWED_TARGETS = new Set([
  `${GOVERNANCE_PACKAGE_ID}::voting_power::mint_certificate`,
  `${GOVERNANCE_PACKAGE_ID}::proposal::vote_with_certificate`,
  `${GOVERNANCE_PACKAGE_ID}::multi_choice_proposal::vote_with_certificate`,
]);

function validateTxKind(tx: Transaction): { valid: boolean; error?: string } {
  const txData = tx.getData();
  const commands = txData.commands;

  if (commands.length !== 2) {
    return { valid: false, error: `Expected 2 commands, got ${commands.length}` };
  }

  const expectedFunctions = ["mint_certificate", "vote_with_certificate"];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    if (cmd.$kind !== "MoveCall") {
      return { valid: false, error: `Command ${i} is not MoveCall: ${cmd.$kind}` };
    }

    const moveCall = cmd.MoveCall;
    const target = `${moveCall.package}::${moveCall.module}::${moveCall.function}`;

    if (!ALLOWED_TARGETS.has(target)) {
      return { valid: false, error: `Unauthorized target: ${target}` };
    }

    if (moveCall.function !== expectedFunctions[i]) {
      return { valid: false, error: `Wrong order at ${i}: expected ${expectedFunctions[i]}, got ${moveCall.function}` };
    }
  }

  return { valid: true };
}

function extractProposalIdFromTx(tx: Transaction): string | null {
  const txData = tx.getData();
  const commands = txData.commands;

  for (const cmd of commands) {
    if (cmd.$kind === "MoveCall" && cmd.MoveCall.function === "vote_with_certificate") {
      const args = cmd.MoveCall.arguments;
      if (args && args.length > 0 && args[0].$kind === "Input") {
        const inputIndex = args[0].Input;
        const input = txData.inputs[inputIndex];
        if (input && input.$kind === "Object") {
          const obj = input.Object;
          if (obj.ImmOrOwnedObject) {
            return obj.ImmOrOwnedObject.objectId;
          }
          if (obj.SharedObject) {
            return obj.SharedObject.objectId;
          }
        }
      }
    }
  }
  return null;
}

async function getProposalType(proposalId: string): Promise<number> {
  if (!PROPOSAL_TYPE_REGISTRY_ID) {
    console.warn("PROPOSAL_TYPE_REGISTRY_ID not configured, defaulting to Governance");
    return 0;
  }

  const suiClient = new SuiClient({ url: SUI_RPC_URL });

  try {
    const registry = await suiClient.getObject({
      id: PROPOSAL_TYPE_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== "moveObject") {
      console.warn("Failed to get ProposalTypeRegistry");
      return 0;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const typesTable = fields.types as { fields: { id: { id: string } } } | undefined;

    if (!typesTable?.fields?.id?.id) {
      console.warn("Types table not found in registry");
      return 0;
    }

    const dynamicField = await suiClient.getDynamicFieldObject({
      parentId: typesTable.fields.id.id,
      name: { type: "0x2::object::ID", value: proposalId },
    });

    if (!dynamicField.data?.content || dynamicField.data.content.dataType !== "moveObject") {
      console.log(`Proposal ${proposalId} not in registry, defaulting to Governance`);
      return 0;
    }

    const dfFields = dynamicField.data.content.fields as Record<string, unknown>;
    const value = dfFields.value as { variant: string } | undefined;

    if (!value?.variant) {
      return 0;
    }

    return value.variant === "Poll" ? 1 : 0;
  } catch (error) {
    console.error("Failed to get proposal type:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}

// ============================================
// V3: User Resolution (UserWallets 2-hop + conditional 3rd hop for linked accounts)
// ============================================

interface UserProfile {
  twitterHandle?: string;
  isTelegramMember?: boolean;
  identityId?: string;
}

async function resolveUserProfile(walletAddress: string): Promise<UserProfile> {
  if (!walletAddress) return {};

  const normalizedAddr = walletAddress.toLowerCase();

  try {
    // Hop 1: UserWallets WALLET_OWNER sentinel -> identityId
    const walletResult = await docClient.send(
      new GetCommand({
        TableName: USER_WALLETS_TABLE,
        Key: { identityId: "WALLET_OWNER", walletAddress: normalizedAddr },
      })
    );

    const ownerIdentityId = walletResult.Item?.ownerIdentityId as string | undefined;
    if (!ownerIdentityId) return {};

    // Hop 2: UserProfiles -> twitterHandle + isTelegramMember
    const profileResult = await docClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: ownerIdentityId },
      })
    );

    if (!profileResult.Item) return { identityId: ownerIdentityId };

    const item = profileResult.Item;
    let twitterHandle = item.twitterHandle as string | undefined;
    let isTelegramMember = item.isTelegramMember === true;

    // Fallback: primary may have linkedAccounts.twitter without promoted top-level field
    if (!twitterHandle) {
      twitterHandle = (item.linkedAccounts as Record<string, any>)?.twitter?.twitterHandle;
    }

    // Resolve to primary identity for linked accounts (conditional 3rd hop)
    // Secondary profiles lack promoted fields (twitterHandle, isTelegramMember)
    const linkedToPrimaryId = item.linkedToPrimaryId as string | undefined;
    let canonicalIdentityId = ownerIdentityId;

    if (linkedToPrimaryId) {
      try {
        const primaryResult = await docClient.send(
          new GetCommand({
            TableName: USER_PROFILES_TABLE,
            Key: { identityId: linkedToPrimaryId },
          })
        );
        if (primaryResult.Item) {
          // Guard against circular links (data corruption)
          if (primaryResult.Item.linkedToPrimaryId) {
            console.warn(`Circular linkedToPrimaryId detected: ${ownerIdentityId} -> ${linkedToPrimaryId} -> ${primaryResult.Item.linkedToPrimaryId}`);
          } else {
            canonicalIdentityId = linkedToPrimaryId;
            if (!twitterHandle) {
              twitterHandle = primaryResult.Item.twitterHandle as string | undefined;
            }
            if (!isTelegramMember) {
              isTelegramMember = primaryResult.Item.isTelegramMember === true;
            }
          }
        }
        // If primary profile doesn't exist, keep ownerIdentityId to avoid orphan records
      } catch (error) {
        console.error("Error fetching primary profile:", error instanceof Error ? error.message : String(error));
      }
    }

    return {
      twitterHandle,
      isTelegramMember,
      identityId: canonicalIdentityId,
    };
  } catch (error) {
    console.error("Error resolving user profile:", error instanceof Error ? error.message : String(error));
    return {};
  }
}

// ============================================
// V3: Leaderboard Rank Lookup
// ============================================

interface V3Account {
  accountId: string;
  platform: string;
  username: string;
}

interface V3Season {
  seasonId: string;
  sk: string;
  status: string;
  endDate: string;
}

async function getV3AccountByHandle(twitterHandle: string): Promise<V3Account | null> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: LEADERBOARD_V3_ACCOUNTS_TABLE,
        IndexName: "platform-username-index",
        KeyConditionExpression: "platform = :platform AND username = :username",
        ExpressionAttributeValues: {
          ":platform": "twitter",
          ":username": twitterHandle.toLowerCase(),
        },
        Limit: 1,
      })
    );
    return (result.Items?.[0] as V3Account) || null;
  } catch (error) {
    console.error("Error looking up V3 account:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getV3ActiveSeason(): Promise<V3Season | null> {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: LEADERBOARD_V3_SEASONS_TABLE,
        FilterExpression: "sk = :sk AND #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":sk": "METADATA",
          ":status": "active",
        },
      })
    );
    return (result.Items?.[0] as V3Season) || null;
  } catch (error) {
    console.error("Error finding active season:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getV3MostRecentEndedSeason(): Promise<V3Season | null> {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: LEADERBOARD_V3_SEASONS_TABLE,
        FilterExpression: "sk = :sk AND #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":sk": "METADATA",
          ":status": "ended",
        },
      })
    );
    if (!result.Items?.length) return null;
    const sorted = result.Items.sort((a, b) =>
      ((b as V3Season).endDate).localeCompare((a as V3Season).endDate)
    );
    return sorted[0] as V3Season;
  } catch (error) {
    console.error("Error finding last ended season:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getUserRankFromSnapshot(accountId: string, seasonId: string): Promise<number | null> {
  try {
    const seasonPrefix = `${seasonId}#`;

    // Query GSI: accountId-snapshotDate-index, descending by date
    // No Limit because DynamoDB applies Limit before FilterExpression
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: LEADERBOARD_V3_SNAPSHOTS_TABLE,
          IndexName: "accountId-snapshotDate-index",
          KeyConditionExpression: "accountId = :accountId",
          FilterExpression: "begins_with(pk, :seasonPrefix)",
          ExpressionAttributeValues: {
            ":accountId": accountId,
            ":seasonPrefix": seasonPrefix,
          },
          ScanIndexForward: false,
          ExclusiveStartKey: lastKey,
        })
      );

      if (result.Items && result.Items.length > 0) {
        return result.Items[0].rank as number;
      }

      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    return null;
  } catch (error) {
    console.error("Error getting user rank from snapshot:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getUserRank(twitterHandle?: string): Promise<number | null> {
  if (!twitterHandle) return null;

  const account = await getV3AccountByHandle(twitterHandle);
  if (!account) return null;

  const activeSeason = await getV3ActiveSeason();
  if (activeSeason) {
    const rank = await getUserRankFromSnapshot(account.accountId, activeSeason.seasonId);
    if (rank !== null) return rank;
  }

  const lastEnded = await getV3MostRecentEndedSeason();
  if (lastEnded) {
    const rank = await getUserRankFromSnapshot(account.accountId, lastEnded.seasonId);
    if (rank !== null) return rank;
  }

  return null;
}

// ============================================
// V3: Voting Power Calculation
// ============================================

interface VotingPowerBreakdown {
  base: number;
  xLinked: number;
  telegram: number;
  rankBonus: number;
  // Backward compatibility (old frontend reads these)
  leaderboard: number;
  onChain: number;
  battalionAllowlist: number;
  genesisAllowlist: number;
}

function calculateRankBonus(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  if (rank === 1) return 20;
  if (rank <= 100) return Math.round(20 - (rank - 1) * 10 / 99);
  return 10; // rank 101-500
}

function calculateVotingPower(
  rank: number | null,
  hasLinkedX: boolean,
  isTelegramMember: boolean
): { total: number; breakdown: VotingPowerBreakdown; rank: number | null } {
  const rankBonus = calculateRankBonus(rank);
  const xBonus = hasLinkedX ? X_LINK_BONUS : 0;
  const tgBonus = isTelegramMember ? TELEGRAM_BONUS : 0;
  const total = BASE_POWER + xBonus + tgBonus + rankBonus;

  return {
    total,
    breakdown: {
      base: BASE_POWER,
      xLinked: xBonus,
      telegram: tgBonus,
      rankBonus,
      // Backward compatibility for old frontend during deploy transition
      leaderboard: rankBonus,
      onChain: 0,
      battalionAllowlist: 0,
      genesisAllowlist: 0,
    },
    rank,
  };
}

// CORS headers
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

let _requestOrigin: string | undefined;
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(_requestOrigin),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/**
 * Main handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  _requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  console.log("Governance API V3 called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
  });

  try {
    const path = event.path;

    // GET /voting-power?walletAddress=0x...
    if (path.endsWith("/voting-power") && event.httpMethod === "GET") {
      const { walletAddress } = event.queryStringParameters || {};

      // Server-side user resolution (ignore client-supplied twitterHandle)
      const profile = await resolveUserProfile(walletAddress || "");
      const hasLinkedX = !!profile.twitterHandle;
      const isTelegramMember = profile.isTelegramMember === true;

      const rank = await getUserRank(profile.twitterHandle);
      const power = calculateVotingPower(rank, hasLinkedX, isTelegramMember);

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          totalVotingPower: power.total,
          rank: power.rank,
          breakdown: power.breakdown,
        }),
      };
    }

    // GET /config - Get current voting power V3 configuration
    if (path.endsWith("/config") && event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          version: 3,
          system: "rank-based",
          basePower: BASE_POWER,
          xLinkBonus: X_LINK_BONUS,
          telegramBonus: TELEGRAM_BONUS,
          maxRankBonus: 20,
          minRankBonus: 10,
          maxPower: 40,
        }),
      };
    }

    // POST /verify-nft - Deprecated
    if (path.endsWith("/verify-nft") && event.httpMethod === "POST") {
      return {
        statusCode: 410,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: "This endpoint has been deprecated. NFT verification is no longer required.",
        }),
      };
    }

    // POST /certificate - Issue Oracle-signed voting power certificate (V3)
    if (path.endsWith("/certificate") && event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Request body is required" }),
        };
      }

      let certBody: Record<string, unknown>;
      try {
        certBody = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Invalid JSON in request body" }),
        };
      }
      const { voter, proposalId } = certBody;

      if (!voter || !proposalId) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Missing voter or proposalId" }),
        };
      }

      // Resolve outside try so rollback can access identityId
      const profile = await resolveUserProfile(voter as string);

      try {
        const hasLinkedX = !!profile.twitterHandle;
        const isTelegramMember = profile.isTelegramMember === true;

        // Identity-based duplicate vote prevention (atomic conditional update)
        if (profile.identityId) {
          try {
            await docClient.send(new UpdateCommand({
              TableName: USER_PROFILES_TABLE,
              Key: { identityId: profile.identityId },
              UpdateExpression: "ADD governanceVotes :pidSet",
              ConditionExpression: "attribute_not_exists(governanceVotes) OR NOT contains(governanceVotes, :pidStr)",
              ExpressionAttributeValues: {
                ":pidSet": new Set([proposalId as string]),
                ":pidStr": proposalId as string,
              },
            }));
          } catch (err) {
            if (err instanceof ConditionalCheckFailedException) {
              console.warn(`Duplicate vote blocked: identity=${profile.identityId}, proposal=${proposalId}, wallet=${voter}`);
              return {
                statusCode: 409,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "You have already voted on this proposal", code: "ALREADY_VOTED" }),
              };
            }
            throw err;
          }
        }

        const rank = await getUserRank(profile.twitterHandle);
        const power = calculateVotingPower(rank, hasLinkedX, isTelegramMember);
        const votingPower = power.total;

        // Build message for signature (MUST match Move's build_certificate_message)
        // Message format: domain_separator (26 bytes) || voter (32 bytes BCS) || proposal_id (32 bytes BCS)
        //                 || voting_power (8 bytes BE) || expires_at (8 bytes BE)
        // Total: 26 + 32 + 32 + 8 + 8 = 106 bytes
        const ttlMs = calculateCertificateTTL();
        const expiresAt = Date.now() + ttlMs;

        const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf8");
        const voterBytes = Buffer.from(bcs.Address.serialize(voter).toBytes());
        const proposalIdBytes = Buffer.from(bcs.Address.serialize(proposalId).toBytes());

        const votingPowerBytes = Buffer.alloc(8);
        votingPowerBytes.writeBigUInt64BE(BigInt(votingPower));

        const expiresAtBytes = Buffer.alloc(8);
        expiresAtBytes.writeBigUInt64BE(BigInt(expiresAt));

        const message = Buffer.concat([
          domainBytes,
          voterBytes,
          proposalIdBytes,
          votingPowerBytes,
          expiresAtBytes,
        ]);

        console.log("Certificate message length:", message.length, "bytes");

        const privateKey = await getOraclePrivateKey();
        const signature = await ed25519.signAsync(message, privateKey);

        const certificate = {
          voter,
          proposalId,
          votingPower,
          expiresAt,
          signature: Buffer.from(signature).toString("hex"),
          breakdown: power.breakdown,
        };

        console.log(`Certificate issued for ${voter} on proposal ${proposalId}: power=${votingPower}, rank=${rank}`);

        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify(certificate),
        };
      } catch (error: unknown) {
        // Rollback governanceVotes record if certificate issuance failed
        if (profile.identityId) {
          try {
            await docClient.send(new UpdateCommand({
              TableName: USER_PROFILES_TABLE,
              Key: { identityId: profile.identityId },
              UpdateExpression: "DELETE governanceVotes :pidSet",
              ExpressionAttributeValues: {
                ":pidSet": new Set([proposalId as string]),
              },
            }));
            console.log(`Rolled back governanceVotes for identity=${profile.identityId}, proposal=${proposalId}`);
          } catch (rollbackErr) {
            console.error("Failed to rollback governanceVotes:", rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
          }
        }
        console.error("Certificate issuance error:", maskSensitiveData({
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }));
        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Failed to issue certificate" }),
        };
      }
    }

    // POST /sponsor - Sponsor a governance vote transaction
    if (path.endsWith("/sponsor") && event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Request body is required" }),
        };
      }

      let sponsorBody: Record<string, unknown>;
      try {
        sponsorBody = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Invalid JSON in request body" }),
        };
      }
      const { txKindBytes, sender } = sponsorBody;

      if (!txKindBytes || !sender) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Missing txKindBytes or sender" }),
        };
      }

      try {
        const tx = Transaction.fromKind(fromBase64(txKindBytes));

        const validation = validateTxKind(tx);
        if (!validation.valid) {
          console.error("Transaction validation failed:", validation.error);
          return {
            statusCode: 400,
            headers: corsHeaders(),
            body: JSON.stringify({
              error: "Transaction validation failed",
              details: validation.error,
            }),
          };
        }

        const proposalId = extractProposalIdFromTx(tx);
        if (!proposalId) {
          return {
            statusCode: 400,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Could not extract proposal ID from transaction" }),
          };
        }

        const proposalType = await getProposalType(proposalId);
        if (proposalType === 0) {
          console.log(`Rejecting sponsor request for Governance proposal ${proposalId}`);
          return {
            statusCode: 400,
            headers: corsHeaders(),
            body: JSON.stringify({
              error: "Governance proposals require user gas payment",
              code: "NOT_SPONSORED",
              proposalType: "Governance",
              proposalId,
            }),
          };
        }

        // Identity-based duplicate vote prevention (defense-in-depth)
        const senderProfile = await resolveUserProfile(sender as string);
        if (senderProfile.identityId) {
          try {
            await docClient.send(new UpdateCommand({
              TableName: USER_PROFILES_TABLE,
              Key: { identityId: senderProfile.identityId },
              UpdateExpression: "ADD governanceVotes :pidSet",
              ConditionExpression: "attribute_not_exists(governanceVotes) OR NOT contains(governanceVotes, :pidStr)",
              ExpressionAttributeValues: {
                ":pidSet": new Set([proposalId]),
                ":pidStr": proposalId,
              },
            }));
          } catch (err) {
            if (err instanceof ConditionalCheckFailedException) {
              console.warn(`Duplicate vote blocked (sponsor): identity=${senderProfile.identityId}, proposal=${proposalId}`);
              return {
                statusCode: 409,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "You have already voted on this proposal", code: "ALREADY_VOTED" }),
              };
            }
            throw err;
          }
        }

        console.log(`Sponsoring Poll proposal ${proposalId}`);
        const suiClient = new SuiClient({ url: SUI_RPC_URL });
        const keypair = await getSponsorKeypair();
        const sponsorAddress = keypair.getPublicKey().toSuiAddress();

        const coins = await suiClient.getCoins({
          owner: sponsorAddress,
          coinType: "0x2::sui::SUI",
        });

        if (coins.data.length === 0) {
          return {
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Sponsor has no gas coins" }),
          };
        }

        tx.setSender(sender);
        tx.setGasOwner(sponsorAddress);
        tx.setGasPayment([
          {
            objectId: coins.data[0].coinObjectId,
            version: coins.data[0].version,
            digest: coins.data[0].digest,
          },
        ]);

        const txBytes = await tx.build({ client: suiClient });
        const sponsorSignature = await keypair.signTransaction(txBytes);

        console.log(`Transaction sponsored for ${sender}`);

        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify({
            txBytes: toBase64(txBytes),
            sponsorSignature: sponsorSignature.signature,
          }),
        };
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Sponsor error:", maskSensitiveData({
          message: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
        }));

        // Detect "already voted" abort from Move contract (ECertificateAlreadyIssued = 6)
        if (errorMsg.includes("MoveAbort") && errorMsg.includes(", 6)")) {
          return {
            statusCode: 409,
            headers: corsHeaders(),
            body: JSON.stringify({
              error: "You have already voted on this proposal",
              code: "ALREADY_VOTED",
            }),
          };
        }

        return {
          statusCode: 500,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Failed to sponsor transaction" }),
        };
      }
    }

    return {
      statusCode: 404,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error: unknown) {
    console.error("Governance API error:", maskSensitiveData({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }));
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
