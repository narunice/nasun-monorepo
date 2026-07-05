// Alliance NFT mint handler (box-lift S3, de-Lambda of governance-api alliance-handler.ts).
//
// GET  /governance/alliance/status : compute_ro read of alliance_mint + the :3211 wallet list.
// POST /governance/alliance/mint   : admin-signed on-chain mint, serialized by an in-proc mutex.
//
// The Lambda used a DynamoDB distributed lock (__ALLIANCE_MINT_LOCK__) to serialize minting across
// concurrent Lambda invocations. This service is a single systemd instance, so a plain in-proc async
// mutex serializes the whole claim -> sign -> execute -> commit critical section: the owned AllianceAdmin
// cap (alliance_nft::mint takes `_admin: &AllianceAdmin`, an owned object) contends on its version across
// concurrent mints, and awaiting waitForTransaction before releasing lets the next mint read the settled
// version. The PENDING/MINTED state lives in the :3211 loopback; the 502 on-chain recovery mirrors the
// Lambda (checkMintedOnChain). No cooldown row is needed (single-process serialization subsumes it).

import type { Sql } from 'postgres';
import type { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { verifyJwtIdentity } from './identity-verify';
import { makeSuiClient } from './governance-sponsor';
import { ALLIANCE } from './config';
import { walletListBox, allianceMintBegin, allianceMintCommit, allianceMintAbort } from './clients';

type Db = Sql<{}>;
type Result = { status: number; body: Record<string, unknown> };

// The four Alliance images (parity with alliance-handler.ts:28-33). Stable public arweave assets tied to
// the contract's NFT set; imageIndex 0-3 selects one. Not env-configurable (they are contract-invariant).
const ALLIANCE_IMAGES = [
  'https://arweave.net/pfz8DTmXICEZSjz24V4iom1mv3Hzed-Qboui4tOg3IM', // Taroka
  'https://arweave.net/D73jyh2mNFxn-6j8YwrvrvXlMXkX1K6j2NvTUkNXqZc', // Princess Kaebo
  'https://arweave.net/xyZk-yKetgdeWZpt_HM-Lv_eH3OGBaRu6WnZmjDKz-Y', // The Contractor
  'https://arweave.net/lKpSmCSSYhmBgFlFNi-qdIsqw60CS9fFDzQWvBtfjmA', // Young Josen
];
const NFT_DESCRIPTION = 'Nasun Alliance NFT';
const MIN_GAS_MIST = 50_000_000n;

// Cached admin keypair (parity with the lambda module-scope cache; same hex->Ed25519 as governance-sponsor).
let adminKeypair: Ed25519Keypair | null = null;
function getAdminKeypair(): Ed25519Keypair {
  if (adminKeypair) return adminKeypair;
  adminKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(ALLIANCE.adminPrivateKeyHex, 'hex'));
  return adminKeypair;
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

// In-process serialization of on-chain mints (single-instance box; replaces the DDB distributed lock).
// A promise chain: each mint runs after the previous settles, regardless of its outcome.
let mintChain: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = mintChain.then(fn, fn);
  mintChain = run.then(() => undefined, () => undefined); // keep the chain alive; never leak a rejection
  return run;
}

// Registered wallet list via the :3211 loopback (parity with the lambda UserWallets query; box list is
// already sentinel-free, lower-cased, ORDER BY wallet_address ASC).
async function listWallets(identityId: string): Promise<Array<{ walletAddress: string; label?: string }>> {
  const { status, body } = await walletListBox(identityId);
  if (status !== 200) return [];
  const raw = Array.isArray(body.wallets) ? body.wallets : [];
  return raw
    .map((w) => (w && typeof w === 'object' ? (w as Record<string, unknown>) : {}))
    .filter((w) => typeof w.walletAddress === 'string')
    .map((w) => ({ walletAddress: w.walletAddress as string, label: typeof w.label === 'string' ? w.label : undefined }));
}

// ---- GET /governance/alliance/status -------------------------------------------------
export async function handleAllianceStatus(sql: Db, schema: string, authHeader: string | undefined): Promise<Result> {
  const identityId = await verifyJwtIdentity(authHeader);
  if (!identityId) return { status: 401, body: { error: 'Unauthorized' } };

  const rows = await sql<{ status: string | null; wallet_address: string | null; attributes: Record<string, unknown> | null }[]>`
    SELECT status, wallet_address, attributes
    FROM ${sql(schema)}.alliance_mint WHERE identity_id = ${identityId}`;
  const row = rows[0];
  // Box alliance_mint stores mint metadata in the attributes jsonb (imageIndex/imageUrl/mintedAt/txDigest/
  // nftObjectId), matching the migrated DDB item shape. minted == status 'MINTED'; a PENDING row is an
  // in-flight mint (not yet minted).
  const minted = !!row && row.status === 'MINTED';
  const a = (row?.attributes && typeof row.attributes === 'object') ? (row.attributes as Record<string, unknown>) : {};

  const wallets = (await listWallets(identityId)).map((w, i) => ({ walletAddress: w.walletAddress, label: w.label, index: i }));

  return {
    status: 200,
    body: {
      minted,
      data: minted && row ? {
        imageIndex: a.imageIndex ?? null,
        walletAddress: row.wallet_address,
        txDigest: a.txDigest ?? null,
        nftObjectId: a.nftObjectId ?? null,
        mintedAt: a.mintedAt ?? null,
      } : null,
      wallets,
    },
  };
}

// ---- POST /governance/alliance/mint --------------------------------------------------
export async function handleAllianceMint(sql: Db, schema: string, authHeader: string | undefined, body: unknown): Promise<Result> {
  const identityId = await verifyJwtIdentity(authHeader);
  if (!identityId) return { status: 401, body: { error: 'Unauthorized' } };

  const b = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
  const imageIndex = Number(b.imageIndex);
  const walletIndex = Number(b.walletIndex);
  if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 3) {
    return { status: 400, body: { error: 'imageIndex must be an integer 0-3', code: 'INVALID_IMAGE_INDEX' } };
  }
  if (!Number.isInteger(walletIndex) || walletIndex < 0) {
    return { status: 400, body: { error: 'walletIndex must be a non-negative integer', code: 'INVALID_WALLET_INDEX' } };
  }

  const wallets = await listWallets(identityId);
  if (wallets.length === 0) return { status: 400, body: { error: 'No registered wallets found', code: 'NO_REGISTERED_WALLETS' } };
  if (walletIndex >= wallets.length) {
    return { status: 400, body: { error: `walletIndex ${walletIndex} out of range (${wallets.length} wallets)`, code: 'INVALID_WALLET_INDEX' } };
  }
  const targetWallet = wallets[walletIndex].walletAddress;
  const imageUrl = ALLIANCE_IMAGES[imageIndex];

  // Serialize the whole claim -> sign -> execute -> commit section (owned AdminCap contention).
  return runExclusive(() => mintCritical(identityId, targetWallet, imageIndex, imageUrl));
}

async function mintCritical(identityId: string, targetWallet: string, imageIndex: number, imageUrl: string): Promise<Result> {
  // 1) Claim PENDING (:3211 atomic state machine). 409 -> already minted / in progress (surface verbatim).
  const begin = await allianceMintBegin({ identityId, walletAddress: targetWallet, imageIndex, imageUrl });
  if (begin.status === 409) return { status: 409, body: begin.body };
  if (begin.status !== 200 || begin.body?.claimed !== true) {
    return { status: 503, body: { error: 'Mint state unavailable, please retry', code: 'MINT_STATE_ERROR' } };
  }

  const mintStartTime = Date.now();
  const suiClient = makeSuiClient();
  const keypair = getAdminKeypair();
  const adminAddress = keypair.getPublicKey().toSuiAddress();

  // 2) Gas balance check (abort PENDING on failure so the user can retry cleanly).
  let balanceMist: bigint;
  try {
    const balance = await suiClient.getBalance({ owner: adminAddress });
    balanceMist = BigInt(balance.totalBalance);
  } catch (balanceErr) {
    await allianceMintAbort({ identityId });
    console.error('[compute] alliance gas check failed, aborted PENDING:', balanceErr instanceof Error ? balanceErr.message : balanceErr);
    return { status: 503, body: { error: 'RPC unavailable, please retry', code: 'RPC_ERROR' } };
  }
  if (balanceMist < MIN_GAS_MIST) {
    await allianceMintAbort({ identityId });
    console.error(`[compute] alliance admin gas low: ${balanceMist} MIST`);
    return { status: 500, body: { error: 'Service temporarily unavailable', code: 'INSUFFICIENT_GAS' } };
  }

  // 3) Build + sign + execute. One retry for a transient RPC blip / object contention (parity lambda).
  const MAX_RETRIES = 1;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ALLIANCE.packageId}::alliance_nft::mint`,
        arguments: [
          tx.object(ALLIANCE.adminId),
          tx.object(ALLIANCE.registryId),
          tx.pure.address(targetWallet),
          tx.pure.string(NFT_DESCRIPTION),
          tx.pure.string(imageUrl),
          tx.pure.u64(imageIndex),
          tx.object('0x6'), // Clock shared object
        ],
      });
      const result = await suiClient.signAndExecuteTransaction({
        transaction: tx, signer: keypair, options: { showEffects: true, showEvents: true },
      });
      if (result.effects?.status?.status !== 'success') {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'unknown'}`);
      }
      const mintEvent = result.events?.find((e) => e.type.includes('::alliance_nft::AllianceMinted'));
      const nftObjectId = (mintEvent?.parsedJson as Record<string, string> | undefined)?.nft_id || '';
      const txDigest = result.digest;

      // Wait for the fullnode to index this tx before releasing the mutex, so the next serialized mint
      // reads the settled AdminCap version and the client's next status read reflects MINTED.
      try {
        await suiClient.waitForTransaction({ digest: txDigest, timeout: 15_000, pollInterval: 300 });
      } catch (waitErr) {
        console.warn(`[compute] alliance waitForTransaction timed out for ${txDigest} (continuing):`, waitErr instanceof Error ? waitErr.message : waitErr);
      }

      // 4) Commit PENDING -> MINTED (:3211). NEVER abort after this point: the NFT is on-chain.
      const commit = await allianceMintCommit({ identityId, txDigest, nftObjectId });
      if (!commit.body?.committed) {
        console.error(`[compute] CRITICAL: alliance mint on-chain but commit was a no-op. tx=${txDigest} nft=${nftObjectId} identity=${identityId}`);
      }
      console.log(`[compute] alliance minted for ${identityId}: tx=${txDigest} nft=${nftObjectId}`);
      return { status: 200, body: { success: true, data: { txDigest, nftObjectId } } };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isObjectContention = errMsg.includes('not available for consumption') || errMsg.includes('already locked by a different transaction');
      const isRpcError = errMsg.includes('Unexpected status code: 502') || errMsg.includes('Unexpected status code: 503');

      // 502/503: the tx may have landed. Check on-chain before rolling back (parity lambda:562).
      if (isRpcError) {
        const landed = await checkMintedOnChain(suiClient, targetWallet, mintStartTime);
        if (landed) {
          try {
            if (landed.txDigest) await suiClient.waitForTransaction({ digest: landed.txDigest, timeout: 8_000, pollInterval: 300 });
          } catch { /* continue: commit anyway, NFT is on-chain */ }
          const commit = await allianceMintCommit({ identityId, txDigest: landed.txDigest || 'unknown-rpc-error', nftObjectId: landed.nftObjectId });
          if (!commit.body?.committed) console.error(`[compute] CRITICAL: alliance on-chain-recovery commit was a no-op. identity=${identityId}`);
          console.log(`[compute] alliance NFT found on-chain despite RPC error for ${identityId}`);
          return { status: 200, body: { success: true, data: { txDigest: landed.txDigest || 'unknown-rpc-error', nftObjectId: landed.nftObjectId } } };
        }
      }

      const isRetryable = isObjectContention || isRpcError;
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = isObjectContention ? 5_000 : 2_000 * (attempt + 1);
        console.warn(`[compute] alliance retryable error attempt ${attempt + 1}/${MAX_RETRIES + 1}, waiting ${delay}ms: ${errMsg}`);
        await sleep(delay);
        continue;
      }

      // Terminal failure: roll back PENDING so the user can retry.
      await allianceMintAbort({ identityId });
      if (isObjectContention) {
        console.warn('[compute] alliance object contention / RPC lag; PENDING rolled back.');
        return { status: 429, body: { error: 'Alliance minting is temporarily unavailable due to network congestion. Please try again in a moment.', code: 'MINT_UNAVAILABLE' } };
      }
      console.error('[compute] alliance mint failed, rolled back PENDING:', errMsg);
      return { status: 500, body: { error: 'Failed to mint NFT' } };
    }
  }
  // Unreachable (loop always returns), but roll back defensively.
  await allianceMintAbort({ identityId });
  return { status: 500, body: { error: 'Failed to mint NFT' } };
}

// After an RPC 502/503, confirm the NFT actually landed on-chain (parity alliance-handler.ts:109). Only
// claims an NFT minted AFTER mintStartTime (avoids attributing a pre-existing NFT from another attempt).
async function checkMintedOnChain(suiClient: SuiClient, walletAddress: string, mintStartTime: number): Promise<{ nftObjectId: string; txDigest?: string } | null> {
  try {
    await sleep(2_000); // let the RPC indexer catch up
    const objects = await suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: `${ALLIANCE.packageId}::alliance_nft::AllianceNFT` },
      options: { showPreviousTransaction: true },
    });
    if (objects.data.length > 0) {
      const obj = objects.data[0];
      const txDigest = obj.data?.previousTransaction;
      if (txDigest) {
        const txBlock = await suiClient.getTransactionBlock({ digest: txDigest, options: { showInput: true } });
        if (Number(txBlock.timestampMs || 0) < mintStartTime) return null; // pre-existing, not ours
      }
      return { nftObjectId: obj.data?.objectId || '', txDigest: txDigest || undefined };
    }
    return null;
  } catch (err) {
    console.error('[compute] alliance checkMintedOnChain failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
