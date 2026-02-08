/**
 * Balance Manager Module
 *
 * Handles BalanceManager creation, balance queries, and deposits.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DEEPBOOK_PACKAGE,
  NBTC_TYPE,
  NUSDC_TYPE,
  NBTC_DECIMALS,
  NUSDC_DECIMALS,
  type Inventory,
  timestamp,
} from './config.js';

// ========================================
// BalanceManager Discovery
// ========================================

const BALANCE_MANAGER_TYPE = `${DEEPBOOK_PACKAGE}::balance_manager::BalanceManager`;

// State file for persisting BalanceManager IDs across runs
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', '.lp-bot-state.json');

interface BotPersistentState {
  balanceManagers: Record<string, string>; // address -> balanceManagerId
}

/**
 * Load persistent state from file
 */
function loadPersistentState(): BotPersistentState {
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, return default state
  }
  return { balanceManagers: {} };
}

/**
 * Save persistent state to file
 */
function savePersistentState(state: BotPersistentState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`[${timestamp()}] Failed to save state:`, error);
  }
}

/**
 * Find existing BalanceManager for the address
 * First checks persistent state file, then queries on-chain owned objects
 */
export async function findBalanceManager(
  client: SuiClient,
  address: string,
): Promise<string | null> {
  // First, check persistent state
  const persistentState = loadPersistentState();
  const savedId = persistentState.balanceManagers[address];

  if (savedId) {
    // Verify the object still exists on-chain
    try {
      const obj = await client.getObject({ id: savedId });
      if (obj.data) {
        console.log(`[${timestamp()}] Found saved BalanceManager: ${savedId.slice(0, 16)}...`);
        return savedId;
      }
    } catch {
      // Object doesn't exist, remove from state
      delete persistentState.balanceManagers[address];
      savePersistentState(persistentState);
    }
  }

  // Fallback: Try to find owned BalanceManager (in case it wasn't shared)
  try {
    const objects = await client.getOwnedObjects({
      owner: address,
      filter: {
        StructType: BALANCE_MANAGER_TYPE,
      },
      options: { showContent: true },
    });

    if (objects.data.length > 0) {
      const objectId = objects.data[0].data?.objectId;
      if (objectId) {
        // Save to persistent state
        persistentState.balanceManagers[address] = objectId;
        savePersistentState(persistentState);
        return objectId;
      }
    }

    return null;
  } catch (error) {
    console.error(`[${timestamp()}] Error finding BalanceManager:`, error);
    return null;
  }
}

/**
 * Save BalanceManager ID to persistent state
 */
export function saveBalanceManagerId(address: string, balanceManagerId: string): void {
  const state = loadPersistentState();
  state.balanceManagers[address] = balanceManagerId;
  savePersistentState(state);
}

// ========================================
// BalanceManager Creation
// ========================================

/**
 * Build transaction to create a new BalanceManager
 */
export function buildCreateBalanceManager(): Transaction {
  const tx = new Transaction();

  const balanceManager = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::new`,
    arguments: [],
  });

  // Share the BalanceManager (make it accessible for trading)
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [BALANCE_MANAGER_TYPE],
    arguments: [balanceManager],
  });

  return tx;
}

/**
 * Create a new BalanceManager and return its ID
 * Waits for transaction finalization to ensure object is indexed before returning
 */
export async function createBalanceManager(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<string | null> {
  const tx = buildCreateBalanceManager();

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error(`[${timestamp()}] Failed to create BalanceManager:`, result.effects?.status?.error);
      return null;
    }

    // Find the created BalanceManager from object changes
    const created = result.objectChanges?.find(
      (change) => change.type === 'created' && change.objectType === BALANCE_MANAGER_TYPE,
    );

    if (created && created.type === 'created') {
      const balanceManagerId = created.objectId;
      console.log(`[${timestamp()}] Created BalanceManager: ${balanceManagerId.slice(0, 16)}...`);

      // Save to persistent state for reuse across restarts
      const address = keypair.getPublicKey().toSuiAddress();
      saveBalanceManagerId(address, balanceManagerId);

      // Wait for transaction to be fully indexed by the RPC
      // This prevents "object not exists" errors when using the BalanceManager immediately
      console.log(`[${timestamp()}] Waiting for transaction finalization...`);
      await client.waitForTransaction({
        digest: result.digest,
        options: { showEffects: true },
      });

      // Additional delay to ensure shared object is indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log(`[${timestamp()}] BalanceManager ready`);

      return balanceManagerId;
    }

    return null;
  } catch (error) {
    console.error(`[${timestamp()}] Error creating BalanceManager:`, error);
    return null;
  }
}

// ========================================
// Balance Queries
// ========================================

/**
 * Get NBTC and NUSDC balances in BalanceManager
 */
export async function getBalanceManagerBalances(
  client: SuiClient,
  balanceManagerId: string,
): Promise<Inventory> {
  try {
    const obj = await client.getObject({
      id: balanceManagerId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return { nbtc: 0, nusdc: 0 };
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const balances = fields.balances as { fields: { id: { id: string } } } | undefined;

    if (!balances) {
      return { nbtc: 0, nusdc: 0 };
    }

    // Query dynamic fields to find balances
    const dynamicFields = await client.getDynamicFields({
      parentId: balances.fields.id.id,
    });

    let nbtcBalance = 0;
    let nusdcBalance = 0;

    for (const field of dynamicFields.data) {
      // Get the actual balance value from each dynamic field
      const fieldObj = await client.getObject({
        id: field.objectId,
        options: { showContent: true },
      });

      if (!fieldObj.data?.content || fieldObj.data.content.dataType !== 'moveObject') {
        continue;
      }

      const fieldContent = fieldObj.data.content.fields as Record<string, unknown>;
      const value = Number(fieldContent.value || 0);

      // Check which token type this balance is for
      if (field.objectType.includes('nbtc::NBTC')) {
        nbtcBalance = value;
      } else if (field.objectType.includes('nusdc::NUSDC')) {
        nusdcBalance = value;
      }
    }

    return {
      nbtc: nbtcBalance / Math.pow(10, NBTC_DECIMALS),
      nusdc: nusdcBalance / Math.pow(10, NUSDC_DECIMALS),
    };
  } catch (error) {
    console.error(`[${timestamp()}] Error getting BalanceManager balances:`, error);
    return { nbtc: 0, nusdc: 0 };
  }
}

/**
 * Get wallet balances (outside BalanceManager)
 */
export async function getWalletBalances(
  client: SuiClient,
  address: string,
): Promise<Inventory> {
  try {
    const [nbtcCoins, nusdcCoins] = await Promise.all([
      client.getCoins({ owner: address, coinType: NBTC_TYPE }),
      client.getCoins({ owner: address, coinType: NUSDC_TYPE }),
    ]);

    const nbtcTotal = nbtcCoins.data.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n,
    );
    const nusdcTotal = nusdcCoins.data.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n,
    );

    return {
      nbtc: Number(nbtcTotal) / Math.pow(10, NBTC_DECIMALS),
      nusdc: Number(nusdcTotal) / Math.pow(10, NUSDC_DECIMALS),
    };
  } catch (error) {
    console.error(`[${timestamp()}] Error getting wallet balances:`, error);
    return { nbtc: 0, nusdc: 0 };
  }
}

/**
 * Get native gas coin (NASUN) balance for an address.
 * Returns balance in NASUN (human readable, 9 decimals).
 */
export async function getGasBalance(
  client: SuiClient,
  address: string,
): Promise<number> {
  try {
    const balance = await client.getBalance({ owner: address });
    return Number(balance.totalBalance) / 1e9;
  } catch (error) {
    console.error(`[${timestamp()}] Error getting gas balance:`, error);
    return 0;
  }
}

// ========================================
// Deposit Operations
// ========================================

/**
 * Build transaction to deposit all tokens from wallet to BalanceManager
 */
export async function buildDepositAll(
  client: SuiClient,
  address: string,
  balanceManagerId: string,
): Promise<Transaction | null> {
  const tx = new Transaction();

  // Get NBTC coins
  const nbtcCoins = await client.getCoins({
    owner: address,
    coinType: NBTC_TYPE,
  });

  // Get NUSDC coins
  const nusdcCoins = await client.getCoins({
    owner: address,
    coinType: NUSDC_TYPE,
  });

  let hasDeposit = false;

  // Deposit NBTC
  if (nbtcCoins.data.length > 0) {
    const coinIds = nbtcCoins.data.map((c) => c.coinObjectId);

    if (coinIds.length === 1) {
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [NBTC_TYPE],
        arguments: [tx.object(balanceManagerId), tx.object(coinIds[0])],
      });
    } else {
      const [primary, ...rest] = coinIds;
      tx.mergeCoins(
        tx.object(primary),
        rest.map((id) => tx.object(id)),
      );
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [NBTC_TYPE],
        arguments: [tx.object(balanceManagerId), tx.object(primary)],
      });
    }
    hasDeposit = true;
  }

  // Deposit NUSDC
  if (nusdcCoins.data.length > 0) {
    const coinIds = nusdcCoins.data.map((c) => c.coinObjectId);

    if (coinIds.length === 1) {
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [NUSDC_TYPE],
        arguments: [tx.object(balanceManagerId), tx.object(coinIds[0])],
      });
    } else {
      const [primary, ...rest] = coinIds;
      tx.mergeCoins(
        tx.object(primary),
        rest.map((id) => tx.object(id)),
      );
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [NUSDC_TYPE],
        arguments: [tx.object(balanceManagerId), tx.object(primary)],
      });
    }
    hasDeposit = true;
  }

  return hasDeposit ? tx : null;
}

/**
 * Deposit all wallet tokens to BalanceManager
 * Includes retry logic for newly created BalanceManagers
 */
export async function depositAllToBalanceManager(
  client: SuiClient,
  keypair: Ed25519Keypair,
  balanceManagerId: string,
  maxRetries: number = 3,
): Promise<boolean> {
  const address = keypair.getPublicKey().toSuiAddress();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const tx = await buildDepositAll(client, address, balanceManagerId);

    if (!tx) {
      console.log(`[${timestamp()}] No tokens to deposit`);
      return true;
    }

    try {
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        console.error(`[${timestamp()}] Deposit failed:`, result.effects?.status?.error);
        return false;
      }

      console.log(`[${timestamp()}] Deposited tokens to BalanceManager (tx: ${result.digest.slice(0, 10)}...)`);

      // Wait for deposit to be indexed
      await client.waitForTransaction({
        digest: result.digest,
        options: { showEffects: true },
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if error is due to object not yet indexed
      if (errorMessage.includes('notExists') && attempt < maxRetries) {
        console.log(`[${timestamp()}] BalanceManager not yet indexed, retrying in ${attempt * 2}s... (attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        continue;
      }

      console.error(`[${timestamp()}] Error depositing to BalanceManager:`, error);
      return false;
    }
  }

  return false;
}
