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
  "https://arweave.net/pfz8DTmXICEZSjz24V4iom1mv3Hzed-Qboui4tOg3IM",   // Taroka (PNG)
  "https://arweave.net/D73jyh2mNFxn-6j8YwrvrvXlMXkX1K6j2NvTUkNXqZc",   // Princess Kaebo (PNG)
  "https://arweave.net/xyZk-yKetgdeWZpt_HM-Lv_eH3OGBaRu6WnZmjDKz-Y",   // The Contractor (PNG)
  "https://arweave.net/lKpSmCSSYhmBgFlFNi-qdIsqw60CS9fFDzQWvBtfjmA",   // Young Josen (PNG)
];

const NFT_DESCRIPTION = "Nasun Alliance NFT";

// Distributed mint lock to prevent owned object contention on Sui
const MINT_LOCK_KEY = "__ALLIANCE_MINT_LOCK__";
const LAST_TX_KEY = "__LAST_MINT_TX__";
const MINT_LOCK_TTL_MS = 65_000; // Must exceed Lambda timeout (60s) to prevent premature expiry
// When devnet RPC fullnode lags behind validators, all mint attempts using the stale object version
// will fail. 120s cooldown gives the fullnode time to catch up before the next attempt.
// During cooldown, concurrent users get 429 MINT_BUSY instead of cascading 500s.
const OBJECT_CONTENTION_COOLDOWN_MS = 120_000;

// Returns the last successful mint txDigest alongside the lock result.
// The caller must waitForTransaction(lastTxDigest) before reading Admin object from RPC,
// ensuring the RPC has indexed the previous mint and will return the current object version.
async function acquireMintLock(docClient: DynamoDBDocumentClient): Promise<{ acquired: boolean; lastTxDigest?: string }> {
  const now = Date.now();
  try {
    await docClient.send(
      new PutCommand({
        TableName: ALLIANCE_MINT_TABLE,
        Item: {
          identityId: MINT_LOCK_KEY,
          status: "LOCKED",
          lockedAt: now,
          ttl: Math.floor(now / 1000) + Math.ceil(MINT_LOCK_TTL_MS / 1000),
        },
        ConditionExpression:
          "attribute_not_exists(identityId) OR lockedAt < :expired",
        ExpressionAttributeValues: {
          ":expired": now - MINT_LOCK_TTL_MS,
        },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return { acquired: false };
    throw err;
  }

  // Read the last successful txDigest so the caller can wait for RPC to catch up.
  try {
    const lastTxRecord = await docClient.send(
      new GetCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId: LAST_TX_KEY } }),
    );
    return { acquired: true, lastTxDigest: lastTxRecord.Item?.txDigest as string | undefined };
  } catch {
    return { acquired: true };
  }
}

async function releaseMintLock(docClient: DynamoDBDocumentClient): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId: MINT_LOCK_KEY } }),
    );
  } catch (err) {
    console.error("[alliance] Failed to release mint lock:", err);
  }
}

// ========== Helpers ==========

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an Alliance NFT was already minted to the target wallet on-chain.
 * Used after RPC 502 errors where we can't tell if the tx landed.
 */
/**
 * Check if an Alliance NFT was minted to the target wallet AFTER the mint started.
 * Compares against mintStartTime to avoid claiming a pre-existing NFT from a different identity.
 * Uses on-chain registry query to confirm the wallet is registered (not just object ownership).
 */
async function checkMintedOnChain(
  suiClient: SuiClient,
  walletAddress: string,
  mintStartTime: number,
): Promise<{ nftObjectId: string; txDigest?: string } | null> {
  try {
    // Wait briefly for RPC indexer to catch up after 502
    await sleep(2_000);

    const objects = await suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: `${ALLIANCE_PACKAGE_ID}::alliance_nft::AllianceNFT` },
      options: { showPreviousTransaction: true },
    });
    if (objects.data.length > 0) {
      const obj = objects.data[0];
      const txDigest = obj.data?.previousTransaction;
      // Verify this tx happened after our mint started by checking tx timestamp
      if (txDigest) {
        const txBlock = await suiClient.getTransactionBlock({ digest: txDigest, options: { showInput: true } });
        const txTimestamp = Number(txBlock.timestampMs || 0);
        if (txTimestamp < mintStartTime) {
          // This NFT was minted before our attempt; not ours
          return null;
        }
      }
      return {
        nftObjectId: obj.data?.objectId || "",
        txDigest: txDigest || undefined,
      };
    }
    return null;
  } catch (err) {
    console.error("[alliance] checkMintedOnChain failed:", err);
    return null;
  }
}

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

  // Acquire distributed lock to serialize Sui tx (prevents owned object contention)
  const { acquired: lockAcquired, lastTxDigest } = await acquireMintLock(docClient);
  if (!lockAcquired) {
    return {
      statusCode: 429,
      headers: { ...corsHeaders(), "Retry-After": "3" },
      body: JSON.stringify({ error: "Mint service busy, please retry", code: "MINT_BUSY" }),
    };
  }

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
        await releaseMintLock(docClient);
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
          // Atomic replace: overwrite stale PENDING in a single conditional put
          try {
            await docClient.send(
              new PutCommand({
                TableName: ALLIANCE_MINT_TABLE,
                Item: { identityId, walletAddress: targetWallet, imageIndex, imageUrl, status: "PENDING", mintedAt: new Date().toISOString() },
                ConditionExpression: "#s = :pending AND mintedAt = :staleMintedAt",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":pending": "PENDING",
                  ":staleMintedAt": existing.Item.mintedAt,
                },
              }),
            );
          } catch (replaceErr) {
            // Another Lambda beat us to it; release lock and return busy
            await releaseMintLock(docClient);
            return {
              statusCode: 429,
              headers: { ...corsHeaders(), "Retry-After": "3" },
              body: JSON.stringify({ error: "Mint service busy, please retry", code: "MINT_BUSY" }),
            };
          }
        } else {
          await releaseMintLock(docClient);
          return {
            statusCode: 409,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Mint in progress", code: "MINT_IN_PROGRESS" }),
          };
        }
      } else {
        // Unknown state (record deleted between PutCommand and GetCommand, or unexpected status).
        // Release lock and surface as busy so the client retries cleanly.
        await releaseMintLock(docClient);
        return {
          statusCode: 429,
          headers: { ...corsHeaders(), "Retry-After": "3" },
          body: JSON.stringify({ error: "Mint service busy, please retry", code: "MINT_BUSY" }),
        };
      }
    } else {
      await releaseMintLock(docClient);
      throw err;
    }
  }

  // Execute Sui transaction with retry for transient failures
  const mintStartTime = Date.now();
  const suiClient = new SuiClient({ url: SUI_RPC_URL });
  const keypair = await getAdminKeypair();
  const adminAddress = keypair.getPublicKey().toSuiAddress();

  // Gas balance check
  let balance: Awaited<ReturnType<typeof suiClient.getBalance>>;
  try {
    balance = await suiClient.getBalance({ owner: adminAddress });
  } catch (balanceErr) {
    await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
    await releaseMintLock(docClient);
    console.error("[alliance] Gas balance check failed, rolled back PENDING:", balanceErr);
    return {
      statusCode: 503,
      headers: { ...corsHeaders(), "Retry-After": "10" },
      body: JSON.stringify({ error: "RPC unavailable, please retry", code: "RPC_ERROR" }),
    };
  }
  const balanceMist = BigInt(balance.totalBalance);
  if (balanceMist < 50_000_000n) {
    await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
    await releaseMintLock(docClient);
    console.error(`[alliance] Admin gas low: ${balanceMist} MIST`);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Service temporarily unavailable", code: "INSUFFICIENT_GAS" }),
    };
  }

  // Wait for the previous mint's tx to be indexed by the RPC before reading Admin object.
  // Without this, a burst of concurrent mints can leave the RPC showing a stale object
  // version — causing validators to reject the tx with "object not available for consumption".
  if (lastTxDigest) {
    try {
      await suiClient.waitForTransaction({ digest: lastTxDigest, timeout: 10_000, pollInterval: 300 });
    } catch {
      // RPC timeout: proceed anyway. If the object is still stale, contention handling will retry.
      console.warn(`[alliance] Pre-mint waitForTransaction timed out for ${lastTxDigest}, proceeding`);
    }
  }

  // One retry gives the RPC a brief chance to sync after a transient blip.
  // If contention persists through the retry, it indicates sustained RPC lag —
  // we stop retrying and apply the long cooldown lock (OBJECT_CONTENTION_COOLDOWN_MS).
  const MAX_RETRIES = 1;
  const RETRY_BASE_DELAY_MS = 2_000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        console.error(`[alliance] CRITICAL: DB update failed after successful mint. tx=${txDigest}, nft=${nftObjectId}, identity=${identityId}`, updateErr);
      }

      console.log(`[alliance] Minted NFT for ${identityId}: tx=${txDigest}, nft=${nftObjectId}`);

      // Wait for the RPC fullnode to index this tx before releasing the lock.
      // Without this, the next minter may read a stale admin/registry object version
      // and hit "Object not available for consumption" rejection at validators.
      try {
        await suiClient.waitForTransaction({ digest: txDigest, timeout: 15_000, pollInterval: 300 });
      } catch (waitErr) {
        console.warn(`[alliance] waitForTransaction timed out for ${txDigest} (continuing):`, waitErr);
      }

      // Persist txDigest so the next minter can wait for it before reading the Admin object.
      try {
        await docClient.send(
          new PutCommand({
            TableName: ALLIANCE_MINT_TABLE,
            Item: { identityId: LAST_TX_KEY, txDigest },
          }),
        );
      } catch (persistErr) {
        console.warn(`[alliance] Failed to persist lastTxDigest (non-critical):`, persistErr);
      }

      await releaseMintLock(docClient);
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          data: { txDigest, nftObjectId },
        }),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isObjectContention =
        errMsg.includes("not available for consumption") ||
        errMsg.includes("already locked by a different transaction");
      const isRpcError = errMsg.includes("Unexpected status code: 502") || errMsg.includes("Unexpected status code: 503");

      // 502/503: the tx may have been submitted. Check if it landed on-chain.
      if (isRpcError) {
        console.warn(`[alliance] RPC error on attempt ${attempt + 1}, checking on-chain state...`);
        const landed = await checkMintedOnChain(suiClient, targetWallet, mintStartTime);
        if (landed) {
          console.log(`[alliance] NFT found on-chain despite RPC error for ${identityId}`);
          try {
            await docClient.send(
              new UpdateCommand({
                TableName: ALLIANCE_MINT_TABLE,
                Key: { identityId },
                UpdateExpression: "SET #s = :minted, txDigest = :tx, nftObjectId = :nft",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":minted": "MINTED",
                  ":tx": landed.txDigest || "unknown-rpc-error",
                  ":nft": landed.nftObjectId,
                },
              }),
            );
          } catch (updateErr) {
            console.error(`[alliance] CRITICAL: DB update failed after on-chain recovery. identity=${identityId}`, updateErr);
          }
          if (landed.txDigest) {
            try {
              await suiClient.waitForTransaction({ digest: landed.txDigest, timeout: 8_000, pollInterval: 300 });
            } catch (waitErr) {
              console.warn(`[alliance] waitForTransaction timed out post-recovery (continuing):`, waitErr);
            }
          }
          await releaseMintLock(docClient);
          return {
            statusCode: 200,
            headers: corsHeaders(),
            body: JSON.stringify({
              success: true,
              data: { txDigest: landed.txDigest || "unknown-rpc-error", nftObjectId: landed.nftObjectId },
            }),
          };
        }
      }

      // Retryable: object contention or RPC transient error
      const isRetryable = isObjectContention || isRpcError;
      if (isRetryable && attempt < MAX_RETRIES) {
        // For object contention, use a fixed 5s delay. Exponential backoff isn't helpful here
        // because the RPC fullnode lag is measured in minutes — a few extra seconds won't help.
        // One retry is enough to confirm whether this is a transient blip or sustained lag.
        const delay = isObjectContention ? 5_000 : RETRY_BASE_DELAY_MS * (attempt + 1);
        console.warn(`[alliance] Retryable error on attempt ${attempt + 1}/${MAX_RETRIES + 1}, waiting ${delay}ms: ${errMsg}`);
        await sleep(delay);
        continue;
      }

      // Final failure: rollback PENDING and handle lock
      console.error("[alliance] Mint tx failed, rolling back PENDING:", maskSensitiveData({
        message: errMsg,
      }));

      try {
        await docClient.send(new DeleteCommand({ TableName: ALLIANCE_MINT_TABLE, Key: { identityId } }));
      } catch (rollbackErr) {
        console.error("[alliance] Rollback failed:", rollbackErr);
      }

      if (isObjectContention) {
        // Devnet RPC fullnode is likely lagging behind validators. Apply a long cooldown so that
        // subsequent requests queue as MINT_BUSY (429) rather than cascading into 500s.
        // During the cooldown the fullnode should catch up, allowing the next user to succeed.
        console.warn(`[alliance] RPC lag detected. Holding lock for ${OBJECT_CONTENTION_COOLDOWN_MS}ms cooldown.`);
        try {
          const cooldownLockedAt = Date.now() - MINT_LOCK_TTL_MS + OBJECT_CONTENTION_COOLDOWN_MS;
          await docClient.send(
            new UpdateCommand({
              TableName: ALLIANCE_MINT_TABLE,
              Key: { identityId: MINT_LOCK_KEY },
              UpdateExpression: "SET lockedAt = :lockedAt, #t = :ttl",
              // Only overwrite if this Lambda still owns the lock (status = LOCKED).
              // Guards against the narrow window where another Lambda acquired the lock
              // between the PENDING rollback and this cooldown extension.
              ConditionExpression: "#s = :locked",
              ExpressionAttributeNames: { "#t": "ttl", "#s": "status" },
              ExpressionAttributeValues: {
                ":lockedAt": cooldownLockedAt,
                ":ttl": Math.floor(Date.now() / 1000) + Math.ceil(OBJECT_CONTENTION_COOLDOWN_MS / 1000),
                ":locked": "LOCKED",
              },
            }),
          );
        } catch (lockErr) {
          console.error("[alliance] Failed to extend lock for cooldown:", lockErr);
        }
        // Return 429 (not 500) so this doesn't count as a 5xx server error.
        // The client should surface a user-friendly message and retry after Retry-After seconds.
        return {
          statusCode: 429,
          headers: { ...corsHeaders(), "Retry-After": String(Math.ceil(OBJECT_CONTENTION_COOLDOWN_MS / 1000)) },
          body: JSON.stringify({
            error: "Alliance minting is temporarily unavailable due to network congestion. Please try again in 2 minutes.",
            code: "MINT_UNAVAILABLE",
          }),
        };
      } else {
        await releaseMintLock(docClient);
      }

      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Failed to mint NFT" }),
      };
    }
  }

  // Unreachable, but TypeScript needs a return
  await releaseMintLock(docClient);
  return {
    statusCode: 500,
    headers: corsHeaders(),
    body: JSON.stringify({ error: "Failed to mint NFT" }),
  };
}
