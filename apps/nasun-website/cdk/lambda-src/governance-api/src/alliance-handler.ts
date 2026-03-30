/**
 * Alliance NFT Minting Handler
 *
 * Routes: GET /alliance/status, POST /alliance/mint
 * Server-side minting via admin keypair on Nasun devnet.
 * One mint per nasun-website account (identityId).
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createRemoteJWKSet, jwtVerify } from "jose";

// ========== Config ==========

const ALLIANCE_MINT_TABLE = process.env.ALLIANCE_MINT_TABLE || "nasun-alliance-mint";
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE || "UserWallets";
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;
const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://rpc.devnet.nasun.io";

const ALLIANCE_PACKAGE_ID = process.env.ALLIANCE_PACKAGE_ID || "";
const ALLIANCE_REGISTRY_ID = process.env.ALLIANCE_REGISTRY_ID || "";
const ALLIANCE_ADMIN_ID = process.env.ALLIANCE_ADMIN_ID || "";

const ALLIANCE_IMAGES = [
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafybeieehzagjrl5sitgywnxx3fjbuxg7kson3da4z3ljmeupporveyqeu",   // Desert Alien
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreignsezz4o23lnbdrwmtsv6ycgsrv4tdpnywanny7pwrnblph3u22y",   // Princess Kaebo
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreig6fenrv23z375xjifz3wadvwrh4plrtpb7pebx6yc2b4gxmm5mc4",   // The Contractor
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreigoirws7dj4uupljzbmc4zcpa3qqgkrd4juvlgfxr4nyslr2sjcri",   // Young Josen
];

const NFT_DESCRIPTION = "Nasun Alliance NFT";

// ========== JWT Verification ==========

let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL("https://cognito-identity.amazonaws.com/.well-known/jwks_uri"),
    );
  }
  return jwksInstance;
}

async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice(7);

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error("[alliance] COGNITO_IDENTITY_POOL_ID is not set");
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: "https://cognito-identity.amazonaws.com",
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch (error) {
    console.error("[alliance] JWT verification failed:", error);
    return undefined;
  }
}

// ========== Admin Keypair ==========

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
let cachedKeypair: Ed25519Keypair | null = null;

async function getAdminKeypair(): Promise<Ed25519Keypair> {
  if (cachedKeypair) return cachedKeypair;

  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: "nasun/governance/alliance-admin" }),
  );
  const { privateKey } = JSON.parse(secret.SecretString || "{}");
  cachedKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  return cachedKeypair;
}

// ========== Route Handler ==========

export async function handleAllianceRoute(
  event: APIGatewayProxyEvent,
  docClient: DynamoDBDocumentClient,
  corsHeaders: () => Record<string, string>,
  maskSensitiveData: <T>(obj: T) => T,
): Promise<APIGatewayProxyResult | null> {
  const path = event.path;

  // GET /alliance/status
  if (path.endsWith("/alliance/status") && event.httpMethod === "GET") {
    return handleStatus(event, docClient, corsHeaders);
  }

  // POST /alliance/mint
  if (path.endsWith("/alliance/mint") && event.httpMethod === "POST") {
    return handleMint(event, docClient, corsHeaders, maskSensitiveData);
  }

  // Not an alliance route
  return null;
}

// ========== GET /alliance/status ==========

async function handleStatus(
  event: APIGatewayProxyEvent,
  docClient: DynamoDBDocumentClient,
  corsHeaders: () => Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders(), "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  // Fetch mint status
  const mintRecord = await docClient.send(
    new GetCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }),
  );

  // Fetch registered wallets
  const walletsResult = await docClient.send(
    new QueryCommand({
      TableName: USER_WALLETS_TABLE,
      KeyConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
    }),
  );

  const wallets = (walletsResult.Items || [])
    .filter((w) => w.walletAddress !== "WALLET_OWNER")
    .map((w, i) => ({ walletAddress: w.walletAddress, label: w.label, index: i }));

  const item = mintRecord.Item;
  const minted = item?.status === "MINTED";

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Cache-Control": "private, max-age=60" },
    body: JSON.stringify({
      minted,
      data: minted
        ? {
            imageIndex: item.imageIndex,
            walletAddress: item.walletAddress,
            txDigest: item.txDigest,
            nftObjectId: item.nftObjectId,
            mintedAt: item.mintedAt,
          }
        : null,
      wallets,
    }),
  };
}

// ========== POST /alliance/mint ==========

async function handleMint(
  event: APIGatewayProxyEvent,
  docClient: DynamoDBDocumentClient,
  corsHeaders: () => Record<string, string>,
  maskSensitiveData: <T>(obj: T) => T,
): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  // Parse and validate body
  let body: { imageIndex?: number; walletIndex?: number };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { imageIndex, walletIndex } = body;
  if (typeof imageIndex !== "number" || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 3) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "imageIndex must be an integer 0-3", code: "INVALID_IMAGE_INDEX" }),
    };
  }
  if (typeof walletIndex !== "number" || !Number.isInteger(walletIndex) || walletIndex < 0) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "walletIndex must be a non-negative integer", code: "INVALID_WALLET_INDEX" }),
    };
  }

  // Server-side wallet lookup
  const walletsResult = await docClient.send(
    new QueryCommand({
      TableName: USER_WALLETS_TABLE,
      KeyConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
    }),
  );

  const wallets = (walletsResult.Items || []).filter((w) => w.walletAddress !== "WALLET_OWNER");
  if (wallets.length === 0) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "No registered wallets found", code: "NO_REGISTERED_WALLETS" }),
    };
  }
  if (walletIndex >= wallets.length) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: `walletIndex ${walletIndex} out of range (${wallets.length} wallets)`,
        code: "INVALID_WALLET_INDEX",
      }),
    };
  }

  const targetWallet = wallets[walletIndex].walletAddress as string;
  const imageUrl = ALLIANCE_IMAGES[imageIndex];

  // DynamoDB conditional write FIRST (PENDING)
  // If PENDING record exists but is stale (>5min), delete and retry.
  const PENDING_TTL_MS = 5 * 60 * 1000;
  try {
    await docClient.send(
      new PutCommand({
        TableName: ALLIANCE_MINT_TABLE,
        Item: {
          identityId,
          walletAddress: targetWallet,
          imageIndex,
          imageUrl,
          status: "PENDING",
          mintedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(identityId)",
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      const existing = await docClient.send(
        new GetCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }),
      );
      if (existing.Item?.status === "MINTED") {
        return {
          statusCode: 409,
          headers: corsHeaders(),
          body: JSON.stringify({ error: "Already minted", code: "ALREADY_MINTED" }),
        };
      }
      // Stale PENDING: Lambda crashed before rollback. Allow retry.
      if (existing.Item?.status === "PENDING") {
        const pendingAge = Date.now() - new Date(existing.Item.mintedAt as string).getTime();
        if (pendingAge > PENDING_TTL_MS) {
          console.warn(`[alliance] Clearing stale PENDING for ${identityId} (age: ${pendingAge}ms)`);
          await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
          // Re-insert as PENDING
          await docClient.send(
            new PutCommand({
              TableName: ALLIANCE_MINT_TABLE,
              Item: { identityId, walletAddress: targetWallet, imageIndex, imageUrl, status: "PENDING", mintedAt: new Date().toISOString() },
              ConditionExpression: "attribute_not_exists(identityId)",
            }),
          );
        } else {
          return {
            statusCode: 409,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Mint in progress", code: "MINT_IN_PROGRESS" }),
          };
        }
      }
    } else {
      throw err;
    }
  }

  // Execute Sui transaction
  try {
    const suiClient = new SuiClient({ url: SUI_RPC_URL });
    const keypair = await getAdminKeypair();
    const adminAddress = keypair.getPublicKey().toSuiAddress();

    // Gas balance check
    const balance = await suiClient.getBalance({ owner: adminAddress });
    const balanceMist = BigInt(balance.totalBalance);
    if (balanceMist < 50_000_000n) {
      // Rollback PENDING record
      await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
      console.error(`[alliance] Admin gas low: ${balanceMist} MIST`);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Service temporarily unavailable", code: "INSUFFICIENT_GAS" }),
      };
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${ALLIANCE_PACKAGE_ID}::alliance_nft::mint`,
      arguments: [
        tx.object(ALLIANCE_ADMIN_ID),
        tx.object(ALLIANCE_REGISTRY_ID),
        tx.pure.address(targetWallet),
        tx.pure.string(NFT_DESCRIPTION),
        tx.pure.string(imageUrl),
        tx.pure.u64(imageIndex),
        tx.object("0x6"), // Clock shared object
      ],
    });

    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`Transaction failed: ${result.effects?.status?.error || "unknown"}`);
    }

    // Extract NFT object ID from AllianceMinted event
    const mintEvent = result.events?.find((e) =>
      e.type.includes("::alliance_nft::AllianceMinted"),
    );
    const nftObjectId = (mintEvent?.parsedJson as Record<string, string>)?.nft_id || "";
    const txDigest = result.digest;

    // Update DynamoDB: PENDING -> MINTED
    // IMPORTANT: Do NOT rollback if this fails. The NFT is already on-chain.
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: ALLIANCE_MINT_TABLE,
          Key: { identityId },
          UpdateExpression: "SET #s = :minted, txDigest = :tx, nftObjectId = :nft",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":minted": "MINTED",
            ":tx": txDigest,
            ":nft": nftObjectId,
          },
        }),
      );
    } catch (updateErr) {
      // NFT is minted on-chain but DB update failed. Log for manual recovery.
      // Do NOT delete the PENDING record; stale PENDING recovery will handle it.
      console.error(`[alliance] CRITICAL: DB update failed after successful mint. tx=${txDigest}, nft=${nftObjectId}, identity=${identityId}`, updateErr);
    }

    console.log(`[alliance] Minted NFT for ${identityId}: tx=${txDigest}, nft=${nftObjectId}`);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        data: { txDigest, nftObjectId },
      }),
    };
  } catch (error) {
    // Rollback PENDING record on Sui tx failure (tx never succeeded, safe to delete)
    console.error("[alliance] Mint tx failed, rolling back PENDING:", maskSensitiveData({
      message: error instanceof Error ? error.message : String(error),
    }));

    try {
      await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
    } catch (rollbackErr) {
      console.error("[alliance] Rollback failed:", rollbackErr);
    }

    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Failed to mint NFT" }),
    };
  }
}
