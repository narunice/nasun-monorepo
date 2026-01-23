/**
 * Governance API - Voting Power Calculator
 *
 * Calculates voting power from multiple sources:
 * - Leaderboard Score (X/Twitter engagement)
 * - Ethereum NFT Bonus (verified via signature)
 * - NASUN Token Balance (post-TGE)
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { ethers } from "ethers";
import { Alchemy, Network } from "alchemy-sdk";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64, toBase64 } from "@mysten/bcs";
import { bcs } from "@mysten/sui/bcs";

// Configure ed25519 to use sha512
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * Mask sensitive data in objects before logging to CloudWatch
 * Prevents accidental exposure of secrets, signatures, and tokens
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

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveData(item)) as T;
  }

  // Handle objects
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

// Voting Power weights
const LEADERBOARD_WEIGHT = Number(process.env.LEADERBOARD_WEIGHT) || 1;
const TOKEN_WEIGHT = Number(process.env.TOKEN_WEIGHT) || 0; // 0 until TGE
const NFT_BONUS = Number(process.env.NFT_BONUS) || 2;

// Ethereum NFT verification
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const NASUN_NFT_CONTRACT_ADDRESS = process.env.NASUN_NFT_CONTRACT_ADDRESS || "";

// Oracle/Sponsor configuration
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io";

// Certificate TTL Policy
// - Devnet: Fixed 15 minutes (faster testing)
// - Mainnet: Up to 30 minutes, capped by proposal expiration
const DEFAULT_TTL_MS = 15 * 60 * 1000;  // 15 min (Devnet)
const MAX_TTL_MS = 30 * 60 * 1000;      // 30 min (Mainnet)

/**
 * Calculate certificate TTL based on network and proposal expiration
 * @param proposalExpiration - Optional proposal expiration timestamp (ms)
 * @returns TTL in milliseconds
 */
function calculateCertificateTTL(proposalExpiration?: number): number {
  const isMainnet = process.env.NETWORK === "mainnet";

  if (!isMainnet) {
    // Devnet: fixed TTL for faster testing
    return DEFAULT_TTL_MS;
  }

  // Mainnet: respect proposal expiration
  if (proposalExpiration) {
    const untilExpiration = proposalExpiration - Date.now();
    // Cap at MAX_TTL_MS, minimum 0 (already expired)
    return Math.min(MAX_TTL_MS, Math.max(0, untilExpiration));
  }

  return MAX_TTL_MS;
}
const GOVERNANCE_PACKAGE_ID = process.env.GOVERNANCE_PACKAGE_ID || "";
const PROPOSAL_TYPE_REGISTRY_ID = process.env.PROPOSAL_TYPE_REGISTRY_ID || "";

// Domain Separation (MUST match Move contract's DOMAIN_SEPARATOR)
// Format: "NASUN_GOVERNANCE_{NETWORK}_V{version}"
const DOMAIN_SEPARATOR = "NASUN_GOVERNANCE_DEVNET_V1";

// Cached keypairs
let oraclePrivateKey: Uint8Array | null = null;
let sponsorKeypair: Ed25519Keypair | null = null;

/**
 * Get Oracle private key from Secrets Manager
 */
async function getOraclePrivateKey(): Promise<Uint8Array> {
  if (oraclePrivateKey) return oraclePrivateKey;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun/governance/oracle" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  oraclePrivateKey = Buffer.from(privateKey, "hex");
  return oraclePrivateKey;
}

/**
 * Get Sponsor keypair from Secrets Manager
 */
async function getSponsorKeypair(): Promise<Ed25519Keypair> {
  if (sponsorKeypair) return sponsorKeypair;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun/governance/sponsor" })
  );
  const { privateKey } = JSON.parse(secret.SecretString!);
  // privateKey is hex-encoded 32-byte seed
  sponsorKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  return sponsorKeypair;
}

// Allowed MoveCall targets for sponsor (whitelist)
const ALLOWED_TARGETS = new Set([
  `${GOVERNANCE_PACKAGE_ID}::voting_power::mint_certificate`,
  `${GOVERNANCE_PACKAGE_ID}::proposal::vote_with_certificate`,
]);

/**
 * Validate transaction kind to prevent abuse
 * Rules:
 * 1. Must contain exactly 2 MoveCall commands
 * 2. Order: mint_certificate → vote
 * 3. All targets must be in whitelist
 */
function validateTxKind(tx: Transaction): { valid: boolean; error?: string } {
  const txData = tx.getData();
  const commands = txData.commands;

  // Must have exactly 2 commands
  if (commands.length !== 2) {
    return { valid: false, error: `Expected 2 commands, got ${commands.length}` };
  }

  const expectedFunctions = ["mint_certificate", "vote_with_certificate"];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    // All commands must be MoveCall
    if (cmd.$kind !== "MoveCall") {
      return { valid: false, error: `Command ${i} is not MoveCall: ${cmd.$kind}` };
    }

    const moveCall = cmd.MoveCall;
    const target = `${moveCall.package}::${moveCall.module}::${moveCall.function}`;

    // Check whitelist
    if (!ALLOWED_TARGETS.has(target)) {
      return { valid: false, error: `Unauthorized target: ${target}` };
    }

    // Check order
    if (moveCall.function !== expectedFunctions[i]) {
      return { valid: false, error: `Wrong order at ${i}: expected ${expectedFunctions[i]}, got ${moveCall.function}` };
    }
  }

  return { valid: true };
}

/**
 * Extract proposal ID from vote transaction
 * Looks for vote_with_certificate call and extracts the first argument (proposal)
 */
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

/**
 * Get proposal type from ProposalTypeRegistry
 * Returns: 0 = Governance, 1 = Poll, -1 = error/not found (treated as Governance)
 */
async function getProposalType(proposalId: string): Promise<number> {
  if (!PROPOSAL_TYPE_REGISTRY_ID) {
    console.warn("PROPOSAL_TYPE_REGISTRY_ID not configured, defaulting to Governance");
    return 0;
  }

  const suiClient = new SuiClient({ url: SUI_RPC_URL });

  try {
    // Query the registry using dynamic field
    const registry = await suiClient.getObject({
      id: PROPOSAL_TYPE_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== "moveObject") {
      console.warn("Failed to get ProposalTypeRegistry");
      return 0;
    }

    // Get the types table ID
    const fields = registry.data.content.fields as Record<string, unknown>;
    const typesTable = fields.types as { fields: { id: { id: string } } } | undefined;

    if (!typesTable?.fields?.id?.id) {
      console.warn("Types table not found in registry");
      return 0;
    }

    // Query dynamic field for proposal type
    const dynamicField = await suiClient.getDynamicFieldObject({
      parentId: typesTable.fields.id.id,
      name: { type: "0x2::object::ID", value: proposalId },
    });

    if (!dynamicField.data?.content || dynamicField.data.content.dataType !== "moveObject") {
      // Proposal not in registry = Governance (default)
      console.log(`Proposal ${proposalId} not in registry, defaulting to Governance`);
      return 0;
    }

    const dfFields = dynamicField.data.content.fields as Record<string, unknown>;
    const value = dfFields.value as { variant: string } | undefined;

    if (!value?.variant) {
      return 0;
    }

    // Check enum variant
    return value.variant === "Poll" ? 1 : 0;
  } catch (error) {
    console.error("Failed to get proposal type:", error);
    return 0; // Default to Governance on error
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

/**
 * Get V3 account by twitterHandle (lowercase, no @)
 */
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
    console.error("Error looking up V3 account:", error);
    return null;
  }
}

/**
 * Find the currently active season
 */
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
    console.error("Error finding active season:", error);
    return null;
  }
}

/**
 * Find the most recently ended season (by endDate DESC)
 */
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
    console.error("Error finding last ended season:", error);
    return null;
  }
}

/**
 * Get season-specific account score
 */
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
    console.error("Error getting season account score:", error);
    return null;
  }
}

/**
 * Recalculate V3 UserScore at current time
 * Applies fresh FreshnessMultiplier based on current timestamp
 */
function recalculateV3UserScore(score: V3SeasonAccountScore): number {
  let rawScore: number;

  // Phase 9: Per-type RawScore calculation
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
    // Legacy: all posts treated as original
    const effectivePosts = Math.log2(score.postCount + 1);
    rawScore = score.postCount > 0 ? (score.totalPostScore * effectivePosts) / score.postCount : 0;
  }

  // ConsistencyBonus = 1 + log₂(uniqueActiveDays + 1) × 0.1, capped at 1.5
  const consistencyBonus = Math.min(
    1 + Math.log2(score.uniqueActiveDays + 1) * V3_CONSISTENCY_BONUS_MULTIPLIER,
    V3_CONSISTENCY_BONUS_MAX
  );

  // FreshnessMultiplier = 1 / (1 + daysSinceLastPost / 14), calculated NOW
  const daysSinceLast = Math.max(
    0,
    Math.floor((Date.now() - new Date(score.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  const freshnessMultiplier = 1 / (1 + daysSinceLast / V3_FRESHNESS_HALF_LIFE_DAYS);

  return rawScore * consistencyBonus * freshnessMultiplier;
}

/**
 * Main V3 leaderboard score resolver
 * Priority: Active Season > Last Ended Season > 0
 */
async function getV3LeaderboardScore(twitterHandle: string): Promise<number> {
  if (!twitterHandle) return 0;

  // 1. Find V3 account by twitterHandle
  const account = await getV3AccountByHandle(twitterHandle);
  if (!account) return 0;

  // 2. Check active season first
  const activeSeason = await getV3ActiveSeason();
  if (activeSeason) {
    const seasonScore = await getV3SeasonAccountScore(activeSeason.seasonId, account.accountId);
    if (seasonScore) {
      return recalculateV3UserScore(seasonScore);
    }
  }

  // 3. Fallback: most recently ended season
  const lastEnded = await getV3MostRecentEndedSeason();
  if (lastEnded) {
    const seasonScore = await getV3SeasonAccountScore(lastEnded.seasonId, account.accountId);
    if (seasonScore) {
      return recalculateV3UserScore(seasonScore);
    }
  }

  // 4. No season data available
  return 0;
}

// Initialize Alchemy SDK (lazy)
let alchemyClient: Alchemy | null = null;
function getAlchemyClient(): Alchemy {
  if (!alchemyClient && ALCHEMY_API_KEY) {
    alchemyClient = new Alchemy({
      apiKey: ALCHEMY_API_KEY,
      network: Network.ETH_MAINNET,
    });
  }
  return alchemyClient!;
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface VotingPowerResponse {
  address: string;
  twitterHandle?: string;
  leaderboardScore: number;
  nftBonus: number;
  tokenBalance: number;
  totalVotingPower: number;
  breakdown: {
    leaderboard: number;
    nft: number;
    token: number;
  };
}

/**
 * Get user's Twitter ID from Cognito Identity ID
 */
/**
 * Get user's leaderboard score from V3 season system
 * Uses twitterHandle to lookup V3 account, then resolves season score
 */
async function getLeaderboardScore(twitterHandle?: string): Promise<number> {
  if (!twitterHandle) return 0;
  const v3Score = await getV3LeaderboardScore(twitterHandle);
  return Math.floor(v3Score);
}

/**
 * Verify Ethereum signature and recover address
 */
function recoverAddressFromSignature(message: string, signature: string): string {
  return ethers.verifyMessage(message, signature);
}

/**
 * Verify NFT ownership using Alchemy API
 */
async function verifyNftOwnership(walletAddress: string): Promise<boolean> {
  if (!ALCHEMY_API_KEY || !NASUN_NFT_CONTRACT_ADDRESS) {
    console.warn("NFT verification not configured");
    return false;
  }

  try {
    const alchemy = getAlchemyClient();
    const nfts = await alchemy.nft.getNftsForOwner(walletAddress, {
      contractAddresses: [NASUN_NFT_CONTRACT_ADDRESS],
    });

    console.log(`NFT verification for ${walletAddress}: ${nfts.totalCount} NFTs found`);
    return nfts.totalCount > 0;
  } catch (error) {
    console.error("Error verifying NFT ownership:", error);
    return false;
  }
}

/**
 * Validate message format for NFT verification
 * Message format: "Nasun Governance: Verify NFT ownership for Proposal #XXX\nTimestamp: YYY"
 */
function validateNftVerificationMessage(message: string, proposalId: string): boolean {
  // Check if message contains the proposal ID
  if (!message.includes(`Proposal #${proposalId}`)) {
    return false;
  }

  // Check if message has a timestamp (within last 5 minutes)
  const timestampMatch = message.match(/Timestamp: (\d+)/);
  if (!timestampMatch) {
    return false;
  }

  const messageTimestamp = parseInt(timestampMatch[1], 10);
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (now - messageTimestamp > fiveMinutes) {
    console.warn("Message timestamp expired");
    return false;
  }

  return true;
}

/**
 * Calculate total voting power
 */
function calculateVotingPower(
  leaderboardScore: number,
  hasNft: boolean,
  tokenBalance: number
): VotingPowerResponse["breakdown"] & { total: number } {
  const leaderboardPower = Math.floor(leaderboardScore * LEADERBOARD_WEIGHT);
  const nftPower = hasNft ? NFT_BONUS : 0;
  const tokenPower = Math.floor(tokenBalance * TOKEN_WEIGHT);

  // Minimum voting power of 1 if user has any activity
  const basePower = leaderboardScore > 0 || hasNft || tokenBalance > 0 ? 1 : 0;

  return {
    leaderboard: leaderboardPower,
    nft: nftPower,
    token: tokenPower,
    total: Math.max(basePower, leaderboardPower + nftPower + tokenPower),
  };
}

/**
 * Main handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  console.log("Governance API called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
  });

  try {
    const path = event.path;

    // GET /voting-power?identityId=xxx or GET /voting-power?twitterId=xxx
    if (path.endsWith("/voting-power") && event.httpMethod === "GET") {
      const { identityId, twitterHandle: twitterHandleParam, nftBonus: nftBonusParam } = event.queryStringParameters || {};

      const twitterHandle = twitterHandleParam?.toLowerCase().replace(/^@/, "");

      if (!twitterHandle) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Missing twitterHandle parameter",
          }),
        };
      }

      // Get leaderboard score from V3
      const leaderboardScore = await getLeaderboardScore(twitterHandle);

      // NFT bonus (will be verified separately via signature)
      const hasNft = nftBonusParam === "true";

      // Token balance (0 until TGE)
      const tokenBalance = 0;

      // Calculate voting power
      const power = calculateVotingPower(leaderboardScore, hasNft, tokenBalance);

      const response: VotingPowerResponse = {
        address: identityId || "",
        twitterHandle,
        leaderboardScore,
        nftBonus: power.nft,
        tokenBalance,
        totalVotingPower: power.total,
        breakdown: {
          leaderboard: power.leaderboard,
          nft: power.nft,
          token: power.token,
        },
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(response),
      };
    }

    // GET /config - Get current voting power configuration
    if (path.endsWith("/config") && event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          leaderboardWeight: LEADERBOARD_WEIGHT,
          tokenWeight: TOKEN_WEIGHT,
          nftBonus: NFT_BONUS,
          tokenEnabled: TOKEN_WEIGHT > 0,
        }),
      };
    }

    // POST /verify-nft - Verify NFT ownership via MetaMask signature
    if (path.endsWith("/verify-nft") && event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Request body is required" }),
        };
      }

      const { message, signature, proposalId } = JSON.parse(event.body);

      if (!message || !signature || !proposalId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Missing required fields: message, signature, proposalId",
          }),
        };
      }

      // Validate message format
      if (!validateNftVerificationMessage(message, proposalId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Invalid or expired message format",
          }),
        };
      }

      try {
        // Recover Ethereum address from signature
        const ethAddress = recoverAddressFromSignature(message, signature);
        console.log(`Recovered Ethereum address: ${ethAddress}`);

        // Verify NFT ownership
        const hasNft = await verifyNftOwnership(ethAddress);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            ethAddress,
            hasNasunNft: hasNft,
            nftBonus: hasNft ? NFT_BONUS : 0,
          }),
        };
      } catch (error: any) {
        console.error("NFT verification error:", maskSensitiveData({ message: error.message, stack: error.stack }));
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Invalid signature",
            message: error.message,
          }),
        };
      }
    }

    // POST /certificate - Issue Oracle-signed voting power certificate
    if (path.endsWith("/certificate") && event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Request body is required" }),
        };
      }

      const { voter, proposalId, twitterHandle: rawTwitterHandle, ethSignature } = JSON.parse(event.body);

      if (!voter || !proposalId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing voter or proposalId" }),
        };
      }

      try {
        // 1. Calculate voting power from V3 leaderboard
        const twitterHandle = rawTwitterHandle?.toLowerCase().replace(/^@/, "");
        let leaderboardScore = 0;
        if (twitterHandle) {
          leaderboardScore = await getLeaderboardScore(twitterHandle);
        }

        let hasNft = false;
        if (ethSignature) {
          try {
            const ethAddress = recoverAddressFromSignature(ethSignature.message, ethSignature.signature);
            hasNft = await verifyNftOwnership(ethAddress);
          } catch (e: any) {
            console.warn("ETH signature verification failed:", maskSensitiveData({ message: e?.message }));
          }
        }

        const power = calculateVotingPower(leaderboardScore, hasNft, 0);
        const votingPower = Math.max(1, power.total); // Minimum 1

        // 2. Build message for signature (MUST match Move's build_certificate_message)
        // Message format: domain_separator (26 bytes) || voter (32 bytes BCS) || proposal_id (32 bytes BCS)
        //                 || voting_power (8 bytes BE) || expires_at (8 bytes BE)
        // Total: 26 + 32 + 32 + 8 + 8 = 106 bytes
        const ttlMs = calculateCertificateTTL(); // TODO: Pass proposal expiration when available
        const expiresAt = Date.now() + ttlMs;

        // 1. Domain separator (UTF-8 bytes)
        const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf8");

        // 2. Voter address (BCS - MUST match bcs::to_bytes(&address))
        const voterBytes = Buffer.from(bcs.Address.serialize(voter).toBytes());

        // 3. Proposal ID (BCS - MUST match bcs::to_bytes(&ID))
        // Note: Sui ID is same as Address (32 bytes)
        const proposalIdBytes = Buffer.from(bcs.Address.serialize(proposalId).toBytes());

        // 4. Voting power (8 bytes big-endian)
        const votingPowerBytes = Buffer.alloc(8);
        votingPowerBytes.writeBigUInt64BE(BigInt(votingPower));

        // 5. Expires at (8 bytes big-endian)
        const expiresAtBytes = Buffer.alloc(8);
        expiresAtBytes.writeBigUInt64BE(BigInt(expiresAt));

        // Concatenate all fields
        const message = Buffer.concat([
          domainBytes,        // "NASUN_GOVERNANCE_DEVNET_V1" (26 bytes)
          voterBytes,         // voter (32 bytes BCS)
          proposalIdBytes,    // proposal_id (32 bytes BCS)
          votingPowerBytes,   // voting_power (8 bytes)
          expiresAtBytes,     // expires_at (8 bytes)
        ]);

        console.log("Certificate message length:", message.length, "bytes"); // Expected: 106

        // 3. Sign with Oracle private key (Ed25519)
        const privateKey = await getOraclePrivateKey();
        const signature = await ed25519.signAsync(message, privateKey);

        const certificate = {
          voter,
          proposalId,
          votingPower,
          expiresAt,
          signature: Buffer.from(signature).toString("hex"),
          breakdown: power,
        };

        console.log(`Certificate issued for ${voter} on proposal ${proposalId}: power=${votingPower}`);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(certificate),
        };
      } catch (error: any) {
        console.error("Certificate issuance error:", maskSensitiveData({ message: error.message, stack: error.stack }));
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Failed to issue certificate",
            message: error.message,
          }),
        };
      }
    }

    // POST /sponsor - Sponsor a governance vote transaction
    if (path.endsWith("/sponsor") && event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Request body is required" }),
        };
      }

      const { txKindBytes, sender } = JSON.parse(event.body);

      if (!txKindBytes || !sender) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing txKindBytes or sender" }),
        };
      }

      try {
        // Reconstruct transaction from kind bytes
        const tx = Transaction.fromKind(fromBase64(txKindBytes));

        // Validate transaction (prevent abuse)
        const validation = validateTxKind(tx);
        if (!validation.valid) {
          console.error("Transaction validation failed:", validation.error);
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
              error: "Transaction validation failed",
              details: validation.error,
            }),
          };
        }

        // Extract proposal ID and check type
        const proposalId = extractProposalIdFromTx(tx);
        if (!proposalId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Could not extract proposal ID from transaction" }),
          };
        }

        // Check proposal type - only sponsor Poll proposals
        const proposalType = await getProposalType(proposalId);
        if (proposalType === 0) {
          // Governance proposals require user to pay gas
          console.log(`Rejecting sponsor request for Governance proposal ${proposalId}`);
          return {
            statusCode: 400,
            headers: corsHeaders,
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

        // Get sponsor's gas coins
        const coins = await suiClient.getCoins({
          owner: sponsorAddress,
          coinType: "0x2::sui::SUI",
        });

        if (coins.data.length === 0) {
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Sponsor has no gas coins" }),
          };
        }

        // Set transaction parameters
        tx.setSender(sender);
        tx.setGasOwner(sponsorAddress);
        tx.setGasPayment([
          {
            objectId: coins.data[0].coinObjectId,
            version: coins.data[0].version,
            digest: coins.data[0].digest,
          },
        ]);

        // Build and sign as sponsor
        const txBytes = await tx.build({ client: suiClient });
        const sponsorSignature = await keypair.signTransaction(txBytes);

        console.log(`Transaction sponsored for ${sender}`);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            txBytes: toBase64(txBytes),
            sponsorSignature: sponsorSignature.signature,
          }),
        };
      } catch (error: any) {
        console.error("Sponsor error:", maskSensitiveData({ message: error.message, stack: error.stack }));
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Failed to sponsor transaction",
            message: error.message,
          }),
        };
      }
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Not found" }),
    };
  } catch (error: any) {
    console.error("Governance API error:", maskSensitiveData({ message: error.message, stack: error.stack }));
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
