/**
 * Governance API V2 - Voting Power Calculator
 *
 * Calculates voting power from multiple sources:
 * - Leaderboard Score (X/Twitter engagement) — log2(1+x) compression
 * - On-Chain Activity Score (DEX, prediction, lottery, lending, AI) — log2(1+x) compression
 * - Battalion NFT Allowlist Bonus (nasun-nft-whitelist)
 * - Genesis NFT Whitelist Bonus (GenesisNftWhitelist)
 * - X Account Linkage Bonus
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
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

// Leaderboard V3 tables
const LEADERBOARD_V3_ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || "leaderboard-v3-accounts";
const LEADERBOARD_V3_SEASONS_TABLE = process.env.LEADERBOARD_V3_SEASONS_TABLE || "leaderboard-v3-seasons";
const LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || "leaderboard-v3-season-accounts";

// V3 Score formula constants (matches score-calculator.ts)
const V3_FRESHNESS_HALF_LIFE_DAYS = 14;
const V3_CONSISTENCY_BONUS_MULTIPLIER = 0.1;
const V3_CONSISTENCY_BONUS_MAX = 1.5;
const V3_REPLY_DECAY_EXPONENT = 0.7;

// V2 Voting Power weights — log2(1+x) * WEIGHT
const LEADERBOARD_WEIGHT = Number(process.env.LEADERBOARD_WEIGHT) || 8;
const ONCHAIN_WEIGHT = Number(process.env.ONCHAIN_WEIGHT) || 8;
const BATTALION_ALLOWLIST_BONUS = Number(process.env.BATTALION_ALLOWLIST_BONUS) || 20;
const GENESIS_ALLOWLIST_BONUS = Number(process.env.GENESIS_ALLOWLIST_BONUS) || 20;
const X_LINK_BONUS = Number(process.env.X_LINK_BONUS) || 10;

// Allowlist tables
const BATTALION_TABLE_NAME = process.env.BATTALION_TABLE_NAME || "nasun-nft-whitelist";
const GENESIS_TABLE_NAME = process.env.GENESIS_TABLE_NAME || "GenesisNftWhitelist";

// On-chain activity Package IDs
const DEEPBOOK_PACKAGE_ID = process.env.DEEPBOOK_PACKAGE_ID || "";
const PREDICTION_PACKAGE_ID = process.env.PREDICTION_PACKAGE_ID || "";
const LOTTERY_PACKAGE_ID = process.env.LOTTERY_PACKAGE_ID || "";
const LENDING_PACKAGE_ID = process.env.LENDING_PACKAGE_ID || "";
const BARAM_PACKAGE_ID = process.env.BARAM_PACKAGE_ID || "";

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
// Leaderboard V3 Types & Query Functions
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

interface V3SeasonAccountScore {
  pk: string;
  sk: string;
  accountId: string;
  seasonId: string;
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastSeenAt: string;
  originalPostCount?: number;
  originalTotalScore?: number;
  quotePostCount?: number;
  quoteTotalScore?: number;
  replyPostCount?: number;
  replyTotalScore?: number;
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

async function getV3SeasonAccountScore(
  seasonId: string,
  accountId: string
): Promise<V3SeasonAccountScore | null> {
  try {
    const pk = `SEASON#${seasonId}#ACCOUNT#${accountId}`;
    const result = await docClient.send(
      new GetCommand({
        TableName: LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE,
        Key: { pk, sk: "SCORE" },
      })
    );
    return (result.Item as V3SeasonAccountScore) || null;
  } catch (error) {
    console.error("Error getting season account score:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function recalculateV3UserScore(score: V3SeasonAccountScore): number {
  let rawScore: number;

  if (score.originalPostCount !== undefined &&
      score.quotePostCount !== undefined &&
      score.replyPostCount !== undefined) {
    const originalRaw = score.originalPostCount > 0
      ? ((score.originalTotalScore || 0) * Math.log2(score.originalPostCount + 1)) / score.originalPostCount
      : 0;
    const quoteRaw = (score.quotePostCount || 0) > 0
      ? ((score.quoteTotalScore || 0) * Math.log2((score.quotePostCount || 0) + 1)) / (score.quotePostCount || 1)
      : 0;
    const replyRaw = (score.replyPostCount || 0) > 0
      ? ((score.replyTotalScore || 0) * Math.log2((score.replyPostCount || 0) + 1)) /
        Math.pow(score.replyPostCount || 1, V3_REPLY_DECAY_EXPONENT)
      : 0;
    rawScore = originalRaw + quoteRaw + replyRaw;
  } else {
    const effectivePosts = Math.log2(score.postCount + 1);
    rawScore = score.postCount > 0 ? (score.totalPostScore * effectivePosts) / score.postCount : 0;
  }

  const consistencyBonus = Math.min(
    1 + Math.log2(score.uniqueActiveDays + 1) * V3_CONSISTENCY_BONUS_MULTIPLIER,
    V3_CONSISTENCY_BONUS_MAX
  );

  const daysSinceLast = Math.max(
    0,
    Math.floor((Date.now() - new Date(score.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  const freshnessMultiplier = 1 / (1 + daysSinceLast / V3_FRESHNESS_HALF_LIFE_DAYS);

  return rawScore * consistencyBonus * freshnessMultiplier;
}

async function getV3LeaderboardScore(twitterHandle: string): Promise<number> {
  if (!twitterHandle) return 0;

  const account = await getV3AccountByHandle(twitterHandle);
  if (!account) return 0;

  const activeSeason = await getV3ActiveSeason();
  if (activeSeason) {
    const seasonScore = await getV3SeasonAccountScore(activeSeason.seasonId, account.accountId);
    if (seasonScore) {
      return recalculateV3UserScore(seasonScore);
    }
  }

  const lastEnded = await getV3MostRecentEndedSeason();
  if (lastEnded) {
    const seasonScore = await getV3SeasonAccountScore(lastEnded.seasonId, account.accountId);
    if (seasonScore) {
      return recalculateV3UserScore(seasonScore);
    }
  }

  return 0;
}

async function getLeaderboardScore(twitterHandle?: string): Promise<number> {
  if (!twitterHandle) return 0;
  const v3Score = await getV3LeaderboardScore(twitterHandle);
  return Math.floor(v3Score);
}

// ============================================
// V2: On-Chain Activity Score
// ============================================

// In-memory cache for on-chain scores (survives warm Lambda invocations)
const onChainCache = new Map<string, { score: number; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function calculateOnChainScore(address: string): Promise<number> {
  const suiClient = new SuiClient({ url: SUI_RPC_URL });

  try {
    const [txHistory, lotteryTickets, predictionPositions,
           lendingPositions, baramReceipts, voteNfts] = await Promise.all([
      suiClient.queryTransactionBlocks({ filter: { FromAddress: address }, limit: 50 }),
      LOTTERY_PACKAGE_ID ? suiClient.getOwnedObjects({
        owner: address,
        filter: { StructType: `${LOTTERY_PACKAGE_ID}::lottery::Ticket` },
      }) : Promise.resolve({ data: [] }),
      PREDICTION_PACKAGE_ID ? suiClient.getOwnedObjects({
        owner: address,
        filter: { StructType: `${PREDICTION_PACKAGE_ID}::prediction_market::Position` },
      }) : Promise.resolve({ data: [] }),
      LENDING_PACKAGE_ID ? suiClient.getOwnedObjects({
        owner: address,
        filter: { StructType: `${LENDING_PACKAGE_ID}::lending_pool::DepositPosition` },
      }) : Promise.resolve({ data: [] }),
      BARAM_PACKAGE_ID ? suiClient.getOwnedObjects({
        owner: address,
        filter: { StructType: `${BARAM_PACKAGE_ID}::baram::RequestReceipt` },
      }) : Promise.resolve({ data: [] }),
      GOVERNANCE_ORIGINAL_PACKAGE_ID ? suiClient.getOwnedObjects({
        owner: address,
        filter: { StructType: `${GOVERNANCE_ORIGINAL_PACKAGE_ID}::proposal::VoteProofNFT` },
      }) : Promise.resolve({ data: [] }),
    ]);

    // Raw composite score from individual activity types
    const score =
      Math.sqrt(txHistory.data.length) * 3           // TX frequency
      + Math.sqrt(lotteryTickets.data.length) * 2    // Lottery participation
      + Math.sqrt(predictionPositions.data.length) * 4  // Prediction market
      + Math.sqrt(lendingPositions.data.length) * 3     // Lending
      + Math.sqrt(baramReceipts.data.length) * 5        // AI service usage
      + voteNfts.data.length * 8;                       // Prior voting (linear bonus)

    return Math.floor(score);
  } catch (error) {
    console.error("Error calculating on-chain score:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getOnChainScore(address: string): Promise<number> {
  if (!address) return 0;

  const cached = onChainCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.score;

  const score = await calculateOnChainScore(address);
  onChainCache.set(address, { score, timestamp: Date.now() });

  // Evict oldest entry if cache exceeds 1000 entries
  if (onChainCache.size > 1000) {
    const oldest = [...onChainCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    onChainCache.delete(oldest[0][0]);
  }
  return score;
}

// ============================================
// V2: Allowlist Check (Battalion + Genesis)
// ============================================

async function checkBattalionAllowlist(walletAddress: string): Promise<boolean> {
  if (!walletAddress) return false;

  try {
    const result = await docClient.send(new GetCommand({
      TableName: BATTALION_TABLE_NAME,
      Key: { walletAddress },
    }));
    return result.Item?.status === "ACTIVE";
  } catch (error) {
    console.error("Error checking battalion allowlist:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function checkGenesisWhitelist(walletAddress: string): Promise<boolean> {
  if (!walletAddress) return false;

  try {
    const result = await docClient.send(new GetCommand({
      TableName: GENESIS_TABLE_NAME,
      Key: { walletAddress },
    }));
    return result.Item?.status === "ACTIVE";
  } catch (error) {
    console.error("Error checking genesis whitelist:", error);
    return false;
  }
}

// ============================================
// V2: Voting Power Calculation
// ============================================

interface VotingPowerBreakdown {
  base: number;
  leaderboard: number;
  onChain: number;
  battalionAllowlist: number;
  genesisAllowlist: number;
  xLinked: number;
}

interface VotingPowerV2Response {
  totalVotingPower: number;
  breakdown: VotingPowerBreakdown;
  rawScores: {
    leaderboardScore: number;
    onChainScore: number;
  };
  normalized: {
    leaderboardNormalized: number;
    onChainNormalized: number;
  };
}

/**
 * Log compression: floor(log2(1+x) * weight)
 * Compresses large gaps while preserving proportionality
 */
function normalizeScore(rawScore: number, weight: number): number {
  if (rawScore <= 0) return 0;
  return Math.floor(Math.log2(1 + rawScore) * weight);
}

function calculateVotingPowerV2(
  leaderboardScore: number,
  onChainScore: number,
  isOnBattalionAllowlist: boolean,
  isOnGenesisWhitelist: boolean,
  hasLinkedX: boolean
): { total: number; breakdown: VotingPowerBreakdown; normalized: { leaderboardNormalized: number; onChainNormalized: number } } {
  const base = 1;
  const leaderboardNormalized = normalizeScore(leaderboardScore, LEADERBOARD_WEIGHT);
  const onChainNormalized = normalizeScore(onChainScore, ONCHAIN_WEIGHT);
  const battalionPower = isOnBattalionAllowlist ? BATTALION_ALLOWLIST_BONUS : 0;
  const genesisPower = isOnGenesisWhitelist ? GENESIS_ALLOWLIST_BONUS : 0;
  const xLinkedPower = hasLinkedX ? X_LINK_BONUS : 0;

  const total = Math.max(1, Math.floor(base + leaderboardNormalized + onChainNormalized + battalionPower + genesisPower + xLinkedPower));

  return {
    total,
    breakdown: {
      base,
      leaderboard: leaderboardNormalized,
      onChain: onChainNormalized,
      battalionAllowlist: battalionPower,
      genesisAllowlist: genesisPower,
      xLinked: xLinkedPower,
    },
    normalized: {
      leaderboardNormalized,
      onChainNormalized,
    },
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

  console.log("Governance API V2 called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
  });

  try {
    const path = event.path;

    // GET /voting-power?twitterHandle=xxx&walletAddress=0x...
    if (path.endsWith("/voting-power") && event.httpMethod === "GET") {
      const { twitterHandle: twitterHandleParam, walletAddress, ethAddress } = event.queryStringParameters || {};

      const twitterHandle = twitterHandleParam?.toLowerCase().replace(/^@/, "");
      const hasLinkedX = !!twitterHandle;

      // Use ethAddress for allowlist/whitelist checks (Ethereum address),
      // fall back to walletAddress (Sui address) for backward compatibility
      const allowlistAddress = ethAddress || walletAddress || "";

      // Parallel: leaderboard + on-chain + battalion allowlist + genesis whitelist
      const [leaderboardScore, onChainScore, isOnBattalion, isOnGenesis] = await Promise.all([
        getLeaderboardScore(twitterHandle),
        getOnChainScore(walletAddress || ""),
        checkBattalionAllowlist(allowlistAddress),
        checkGenesisWhitelist(allowlistAddress),
      ]);

      const power = calculateVotingPowerV2(leaderboardScore, onChainScore, isOnBattalion, isOnGenesis, hasLinkedX);

      const response: VotingPowerV2Response = {
        totalVotingPower: power.total,
        breakdown: power.breakdown,
        rawScores: {
          leaderboardScore,
          onChainScore,
        },
        normalized: power.normalized,
      };

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify(response),
      };
    }

    // GET /config - Get current voting power V2 configuration
    if (path.endsWith("/config") && event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          version: 2,
          leaderboardWeight: LEADERBOARD_WEIGHT,
          onChainWeight: ONCHAIN_WEIGHT,
          battalionAllowlistBonus: BATTALION_ALLOWLIST_BONUS,
          genesisAllowlistBonus: GENESIS_ALLOWLIST_BONUS,
          xLinkBonus: X_LINK_BONUS,
          normalization: "log2(1+x)",
        }),
      };
    }

    // POST /verify-nft - Deprecated (V2)
    if (path.endsWith("/verify-nft") && event.httpMethod === "POST") {
      return {
        statusCode: 410,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: "This endpoint has been deprecated in Governance V2. NFT verification is no longer required.",
        }),
      };
    }

    // POST /certificate - Issue Oracle-signed voting power certificate (V2)
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
      const { voter, proposalId, twitterHandle: rawTwitterHandle, walletAddress, ethAddress } = certBody;

      if (!voter || !proposalId) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Missing voter or proposalId" }),
        };
      }

      try {
        const twitterHandle = rawTwitterHandle?.toLowerCase().replace(/^@/, "");
        const hasLinkedX = !!twitterHandle;

        // Use ethAddress for allowlist/whitelist checks (Ethereum address),
        // fall back to walletAddress/voter (Sui address) for backward compatibility
        const allowlistAddress = ethAddress || walletAddress || voter;

        // Parallel: leaderboard + on-chain + battalion allowlist + genesis whitelist
        const [leaderboardScore, onChainScore, isOnBattalion, isOnGenesis] = await Promise.all([
          getLeaderboardScore(twitterHandle),
          getOnChainScore(walletAddress || voter),
          checkBattalionAllowlist(allowlistAddress),
          checkGenesisWhitelist(allowlistAddress),
        ]);

        const power = calculateVotingPowerV2(leaderboardScore, onChainScore, isOnBattalion, isOnGenesis, hasLinkedX);
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

        console.log(`Certificate issued for ${voter} on proposal ${proposalId}: power=${votingPower}`);

        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify(certificate),
        };
      } catch (error: unknown) {
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
