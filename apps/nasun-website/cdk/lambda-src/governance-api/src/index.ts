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
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const LEADERBOARD_TABLE = process.env.LEADERBOARD_TABLE || "NasunLeaderboard";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";

// Voting Power weights
const LEADERBOARD_WEIGHT = Number(process.env.LEADERBOARD_WEIGHT) || 1;
const TOKEN_WEIGHT = Number(process.env.TOKEN_WEIGHT) || 0; // 0 until TGE
const NFT_BONUS = Number(process.env.NFT_BONUS) || 2;

// Ethereum NFT verification
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const NASUN_NFT_CONTRACT_ADDRESS = process.env.NASUN_NFT_CONTRACT_ADDRESS || "";

// Oracle/Sponsor configuration
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const CERTIFICATE_TTL_MS = 15 * 60 * 1000; // 15 minutes (Devnet), 30 min for Mainnet
const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io";
const GOVERNANCE_PACKAGE_ID = process.env.GOVERNANCE_PACKAGE_ID || "";

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
  twitterId?: string;
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
async function getTwitterIdFromIdentity(identityId: string): Promise<string | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId },
      })
    );

    if (result.Item?.twitterId) {
      return result.Item.twitterId as string;
    }

    // Check linkedAccounts
    if (result.Item?.linkedAccounts?.twitter?.id) {
      return result.Item.linkedAccounts.twitter.id as string;
    }

    return null;
  } catch (error) {
    console.error("Error getting Twitter ID from identity:", error);
    return null;
  }
}

/**
 * Get user's leaderboard score from X engagement
 */
async function getLeaderboardScore(twitterId: string): Promise<number> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: LEADERBOARD_TABLE,
        Key: {
          pk: `USER#${twitterId}`,
          sk: "CUMULATIVE_SCORE",
        },
      })
    );

    if (result.Item?.totalScore) {
      return Math.floor(result.Item.totalScore as number);
    }

    return 0;
  } catch (error) {
    console.error("Error getting leaderboard score:", error);
    return 0;
  }
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
      const { identityId, twitterId: directTwitterId, nftBonus: nftBonusParam } = event.queryStringParameters || {};

      let twitterId: string | undefined = directTwitterId;

      // If identityId provided, look up twitterId
      if (!twitterId && identityId) {
        const resolved = await getTwitterIdFromIdentity(identityId);
        twitterId = resolved ?? undefined;
      }

      if (!twitterId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "Missing twitterId or identityId parameter",
          }),
        };
      }

      // Get leaderboard score
      const leaderboardScore = await getLeaderboardScore(twitterId);

      // NFT bonus (will be verified separately via signature)
      const hasNft = nftBonusParam === "true";

      // Token balance (0 until TGE)
      const tokenBalance = 0;

      // Calculate voting power
      const power = calculateVotingPower(leaderboardScore, hasNft, tokenBalance);

      const response: VotingPowerResponse = {
        address: identityId || "",
        twitterId,
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
        console.error("NFT verification error:", error);
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

      const { voter, proposalId, twitterId, ethSignature } = JSON.parse(event.body);

      if (!voter || !proposalId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing voter or proposalId" }),
        };
      }

      try {
        // 1. Calculate voting power (reuse existing logic)
        let leaderboardScore = 0;
        if (twitterId) {
          leaderboardScore = await getLeaderboardScore(twitterId);
        }

        let hasNft = false;
        if (ethSignature) {
          try {
            const ethAddress = recoverAddressFromSignature(ethSignature.message, ethSignature.signature);
            hasNft = await verifyNftOwnership(ethAddress);
          } catch (e) {
            console.warn("ETH signature verification failed:", e);
          }
        }

        const power = calculateVotingPower(leaderboardScore, hasNft, 0);
        const votingPower = Math.max(1, power.total); // Minimum 1

        // 2. Build message for signature (MUST match Move's build_certificate_message)
        // Message format: domain_separator (26 bytes) || voter (32 bytes BCS) || proposal_id (32 bytes BCS)
        //                 || voting_power (8 bytes BE) || expires_at (8 bytes BE)
        // Total: 26 + 32 + 32 + 8 + 8 = 106 bytes
        const expiresAt = Date.now() + CERTIFICATE_TTL_MS;

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
        console.error("Certificate issuance error:", error);
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
        console.error("Sponsor error:", error);
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
    console.error("Governance API error:", error);
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
