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
import { ethers } from "ethers";
import { Alchemy, Network } from "alchemy-sdk";

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
