/**
 * Balance Manager Module
 *
 * Handles BalanceManager creation, balance queries, and deposits.
 * Uses MARKET config for token types and decimals.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DEEPBOOK_PACKAGE,
  MARKET,
  type Inventory,
  timestamp,
} from './config.js';

// ========================================
// BalanceManager Discovery
// ========================================

const BALANCE_MANAGER_TYPE = `${DEEPBOOK_PACKAGE}::balance_manager::BalanceManager`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', `.lp-bot-state-${MARKET.name.toLowerCase()}.json`);

interface BotPersistentState {
  balanceManagers: Record<string, string>;
}

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

function savePersistentState(state: BotPersistentState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`[${timestamp()}] Failed to save state:`, error);
  }
}

/**
 * Find existing BalanceManager for the address
 */
export async function findBalanceManager(
  client: SuiClient,
  address: string,
): Promise<string | null> {
  const persistentState = loadPersistentState();
  const savedId = persistentState.balanceManagers[address];

  if (savedId) {
    try {
      const obj = await client.getObject({ id: savedId });
      if (obj.data) {
        console.log(`[${timestamp()}] Found saved BalanceManager: ${savedId.slice(0, 16)}...`);
        return savedId;
      }
    } catch {
      delete persistentState.balanceManagers[address];
      savePersistentState(persistentState);
    }
  }

  try {
    const objects = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: BALANCE_MANAGER_TYPE },
      options: { showContent: true },
    });

    if (objects.data.length > 0) {
      const objectId = objects.data[0].data?.objectId;
      if (objectId) {
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

export function saveBalanceManagerId(address: string, balanceManagerId: string): void {
  const state = loadPersistentState();
  state.balanceManagers[address] = balanceManagerId;
  savePersistentState(state);
}

// ========================================
// BalanceManager Creation
// ========================================

export function buildCreateBalanceManager(): Transaction {
  const tx = new Transaction();

  const balanceManager = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::new`,
    arguments: [],
  });

  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [BALANCE_MANAGER_TYPE],
    arguments: [balanceManager],
  });

  return tx;
}

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

    const created = result.objectChanges?.find(
      (change) => change.type === 'created' && change.objectType === BALANCE_MANAGER_TYPE,
    );

    if (created && created.type === 'created') {
      const balanceManagerId = created.objectId;
      console.log(`[${timestamp()}] Created BalanceManager: ${balanceManagerId.slice(0, 16)}...`);

      const address = keypair.getPublicKey().toSuiAddress();
      saveBalanceManagerId(address, balanceManagerId);

      console.log(`[${timestamp()}] Waiting for transaction finalization...`);
      await client.waitForTransaction({
        digest: result.digest,
        options: { showEffects: true },
      });

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
 * Get base and quote token balances in BalanceManager
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
      return { base: 0, quote: 0 };
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const balances = fields.balances as { fields: { id: { id: string } } } | undefined;

    if (!balances) {
      return { base: 0, quote: 0 };
    }

    const dynamicFields = await client.getDynamicFields({
      parentId: balances.fields.id.id,
    });

    let baseBalance = 0;
    let quoteBalance = 0;

    for (const field of dynamicFields.data) {
      const fieldObj = await client.getObject({
        id: field.objectId,
        options: { showContent: true },
      });

      if (!fieldObj.data?.content || fieldObj.data.content.dataType !== 'moveObject') {
        continue;
      }

      const fieldContent = fieldObj.data.content.fields as Record<string, unknown>;
      const value = Number(fieldContent.value || 0);

      // Match by token type to support any market
      if (field.objectType.includes(MARKET.baseType)) {
        baseBalance = value;
      } else if (field.objectType.includes(MARKET.quoteType)) {
        quoteBalance = value;
      }
    }

    return {
      base: baseBalance / Math.pow(10, MARKET.baseDecimals),
      quote: quoteBalance / Math.pow(10, MARKET.quoteDecimals),
    };
  } catch (error) {
    console.error(`[${timestamp()}] Error getting BalanceManager balances:`, error);
    return { base: 0, quote: 0 };
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
    const [baseCoins, quoteCoins] = await Promise.all([
      client.getCoins({ owner: address, coinType: MARKET.baseType }),
      client.getCoins({ owner: address, coinType: MARKET.quoteType }),
    ]);

    const baseTotal = baseCoins.data.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n,
    );
    const quoteTotal = quoteCoins.data.reduce(
      (sum, coin) => sum + BigInt(coin.balance),
      0n,
    );

    return {
      base: Number(baseTotal) / Math.pow(10, MARKET.baseDecimals),
      quote: Number(quoteTotal) / Math.pow(10, MARKET.quoteDecimals),
    };
  } catch (error) {
    console.error(`[${timestamp()}] Error getting wallet balances:`, error);
    return { base: 0, quote: 0 };
  }
}

/**
 * Get native gas coin (NASUN) balance
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
 * Build transaction to deposit all base + quote tokens from wallet to BalanceManager
 */
export async function buildDepositAll(
  client: SuiClient,
  address: string,
  balanceManagerId: string,
): Promise<Transaction | null> {
  const tx = new Transaction();

  const baseCoins = await client.getCoins({
    owner: address,
    coinType: MARKET.baseType,
  });

  const quoteCoins = await client.getCoins({
    owner: address,
    coinType: MARKET.quoteType,
  });

  let hasDeposit = false;

  // Deposit base token
  if (baseCoins.data.length > 0) {
    const coinIds = baseCoins.data.map((c) => c.coinObjectId);

    if (coinIds.length === 1) {
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [MARKET.baseType],
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
        typeArguments: [MARKET.baseType],
        arguments: [tx.object(balanceManagerId), tx.object(primary)],
      });
    }
    hasDeposit = true;
  }

  // Deposit quote token (NUSDC)
  if (quoteCoins.data.length > 0) {
    const coinIds = quoteCoins.data.map((c) => c.coinObjectId);

    if (coinIds.length === 1) {
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE}::balance_manager::deposit`,
        typeArguments: [MARKET.quoteType],
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
        typeArguments: [MARKET.quoteType],
        arguments: [tx.object(balanceManagerId), tx.object(primary)],
      });
    }
    hasDeposit = true;
  }

  return hasDeposit ? tx : null;
}

/**
 * Deposit all wallet tokens to BalanceManager
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

      await client.waitForTransaction({
        digest: result.digest,
        options: { showEffects: true },
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

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
