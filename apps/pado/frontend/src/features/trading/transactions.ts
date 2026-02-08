/**
 * DeepBook V3 Trading Transaction Builders
 */

import { Transaction } from '@mysten/sui/transactions';
import { NETWORK_CONFIG, POOLS, TOKENS } from '../../config/network';
import { ORDER_TYPE, SELF_MATCHING, CLOCK_ID, NATIVE_TOKEN_TYPE, GAS_RESERVE_RAW } from './constants';
import type { PlaceLimitOrderParams, PlaceMarketOrderParams, PoolConfig } from './types';
import { getSuiClient } from '../../lib/sui-client';

// 기본 Pool (하위 호환)
const DEFAULT_POOL = POOLS.NBTC_NUSDC;

/** Fetch all coins with pagination (Sui getCoins returns max ~50 per page) */
async function getAllCoins(
  owner: string,
  coinType: string,
): Promise<{ coinObjectId: string; balance: string }[]> {
  const client = getSuiClient();
  const allCoins: { coinObjectId: string; balance: string }[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;
  let pageCount = 0;
  const MAX_PAGES = 100;

  while (hasNext && pageCount < MAX_PAGES) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    allCoins.push(...page.data);
    hasNext = page.hasNextPage;
    const newCursor = page.nextCursor;
    if (newCursor === cursor) break;
    cursor = newCursor;
    pageCount++;
  }

  return allCoins;
}

// ============================================
// Security: Constants & Validation Functions
// ============================================

/** Maximum sane order values to prevent fat-finger errors */
const MAX_PRICE = 100_000_000_000_000n; // $100M in smallest unit
const MAX_QUANTITY = 100_000_000_000_000n;

/**
 * Validate Sui object ID format (0x + 64 hex chars)
 */
function isValidObjectId(id: string | undefined): boolean {
  if (!id) return false;
  return /^0x[0-9a-f]{64}$/i.test(id);
}

/**
 * Validate Pool configuration
 * @throws Error if pool is invalid
 */
function validatePool(pool: PoolConfig, name: string = 'pool'): void {
  if (!pool) {
    throw new Error(`[Security] Missing ${name} configuration`);
  }
  if (!isValidObjectId(pool.id)) {
    throw new Error(`[Security] Invalid ${name} ID format: ${pool.id}`);
  }
  if (!pool.baseToken?.type || !pool.quoteToken?.type) {
    throw new Error(`[Security] Missing token types in ${name}`);
  }
}

/**
 * Validate limit order parameters
 * @throws Error if parameters are invalid
 */
function validateLimitOrderParams(params: PlaceLimitOrderParams, pool: PoolConfig): void {
  if (params.price <= 0n) {
    throw new Error('[Security] Price must be positive');
  }
  if (params.price > MAX_PRICE) {
    throw new Error('[Security] Price exceeds maximum allowed value');
  }
  if (params.quantity <= 0n) {
    throw new Error('[Security] Quantity must be positive');
  }
  if (params.quantity > MAX_QUANTITY) {
    throw new Error('[Security] Quantity exceeds maximum allowed value');
  }

  // Tick size validation (if available)
  if (pool.tickSize && pool.tickSize > 0) {
    const tickSizeBn = BigInt(pool.tickSize);
    if (params.price % tickSizeBn !== 0n) {
      throw new Error(`[Security] Price must be multiple of tick size: ${pool.tickSize}`);
    }
  }

  // Lot size validation (if available)
  if (pool.lotSize && pool.lotSize > 0) {
    const lotSizeBn = BigInt(pool.lotSize);
    if (params.quantity % lotSizeBn !== 0n) {
      throw new Error(`[Security] Quantity must be multiple of lot size: ${pool.lotSize}`);
    }
  }
}

/**
 * Validate market order parameters
 * @throws Error if parameters are invalid
 */
function validateMarketOrderParams(params: PlaceMarketOrderParams): void {
  if (params.quantity <= 0n) {
    throw new Error('[Security] Quantity must be positive');
  }
  if (params.quantity > MAX_QUANTITY) {
    throw new Error('[Security] Quantity exceeds maximum allowed value');
  }
}

/**
 * Validate slippage parameters for swaps
 * @throws Error if slippage protection is insufficient
 */
function validateSlippageParams(minOutput: bigint, inputAmount?: bigint): void {
  // Minimum output must be positive
  if (minOutput <= 0n) {
    throw new Error('[Security] Minimum output must be positive for slippage protection');
  }

  // If input is provided, ensure minimum output is reasonable
  if (inputAmount && inputAmount > 0n) {
    // Reject if slippage > 10% (likely a mistake or front-running risk)
    const tenPercentThreshold = (inputAmount * 90n) / 100n;
    if (minOutput < tenPercentThreshold) {
      throw new Error(
        '[Security] Slippage tolerance exceeds 10%. ' +
        'This is likely an error or exposes the trade to front-running. ' +
        'Adjust minOutput to protect against excessive slippage.'
      );
    }
  }
}

/**
 * BalanceManager 생성 트랜잭션
 */
export function buildCreateBalanceManager(): Transaction {
  const tx = new Transaction();

  const balanceManager = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::new`,
    arguments: [],
  });

  // Share the BalanceManager
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [`${NETWORK_CONFIG.deepbookPackage}::balance_manager::BalanceManager`],
    arguments: [balanceManager],
  });

  return tx;
}

/**
 * BalanceManager에 토큰 입금
 */
export function buildDeposit(
  balanceManagerId: string,
  coinId: string,
  coinType: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
    typeArguments: [coinType],
    arguments: [
      tx.object(balanceManagerId),
      tx.object(coinId),
    ],
  });

  return tx;
}

/**
 * BalanceManager에서 토큰 출금
 */
export function buildWithdraw(
  balanceManagerId: string,
  amount: bigint,
  coinType: string,
  recipientAddress: string,
): Transaction {
  if (amount <= 0n) {
    throw new Error('Withdraw amount must be positive');
  }

  const tx = new Transaction();

  const coin = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(balanceManagerId),
      tx.pure.u64(amount),
    ],
  });

  tx.transferObjects([coin], tx.pure.address(recipientAddress));

  return tx;
}

/**
 * TradeProof 생성 (owner용)
 */
function generateProofAsOwner(tx: Transaction, balanceManagerId: string) {
  return tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(balanceManagerId)],
  });
}

/**
 * 지정가 주문 트랜잭션
 * @param balanceManagerId - BalanceManager object ID
 * @param params - 주문 파라미터
 * @param pool - Pool 설정 (선택, 기본값: NBTC/NUSDC)
 */
export function buildPlaceLimitOrder(
  balanceManagerId: string,
  params: PlaceLimitOrderParams,
  pool: PoolConfig = DEFAULT_POOL,
): Transaction {
  // Security: Validate inputs before building transaction
  validatePool(pool, 'NBTC/NUSDC pool');
  validateLimitOrderParams(params, pool);

  const tx = new Transaction();

  // Generate trade proof
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  // Place limit order
  const orderInfo = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::place_limit_order`,
    typeArguments: [
      pool.baseToken.type!,
      pool.quoteToken.type!,
    ],
    arguments: [
      tx.object(pool.id!),
      tx.object(balanceManagerId),
      tradeProof,
      tx.pure.u64(params.clientOrderId || 0n),
      tx.pure.u8(params.orderType ?? ORDER_TYPE.NO_RESTRICTION),
      tx.pure.u8(params.selfMatchingOption ?? SELF_MATCHING.ALLOWED),
      tx.pure.u64(params.price),
      tx.pure.u64(params.quantity),
      tx.pure.bool(params.isBid),
      tx.pure.bool(params.payWithDeep ?? false),
      tx.pure.u64(params.expireTimestamp ?? BigInt(Date.now() + 86400000)), // 24h default
      tx.object(CLOCK_ID),
    ],
  });

  // Return order info (ignored but needed for Move)
  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::order_info::order_id`,
    arguments: [orderInfo],
  });

  return tx;
}

/**
 * 시장가 주문 트랜잭션
 * @param balanceManagerId - BalanceManager object ID
 * @param params - 주문 파라미터
 * @param pool - Pool 설정 (선택, 기본값: NBTC/NUSDC)
 */
export function buildPlaceMarketOrder(
  balanceManagerId: string,
  params: PlaceMarketOrderParams,
  pool: PoolConfig = DEFAULT_POOL,
): Transaction {
  // Security: Validate inputs before building transaction
  validatePool(pool, 'NBTC/NUSDC pool');
  validateMarketOrderParams(params);

  const tx = new Transaction();

  // Generate trade proof
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  // Place market order
  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::place_market_order`,
    typeArguments: [
      pool.baseToken.type!,
      pool.quoteToken.type!,
    ],
    arguments: [
      tx.object(pool.id!),
      tx.object(balanceManagerId),
      tradeProof,
      tx.pure.u64(params.clientOrderId || 0n),
      tx.pure.u8(params.selfMatchingOption ?? SELF_MATCHING.ALLOWED),
      tx.pure.u64(params.quantity),
      tx.pure.bool(params.isBid),
      tx.pure.bool(params.payWithDeep ?? false),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * 주문 취소 트랜잭션
 * @param balanceManagerId - BalanceManager object ID
 * @param orderId - 취소할 주문 ID
 * @param pool - Pool 설정 (선택, 기본값: NBTC/NUSDC)
 */
export function buildCancelOrder(
  balanceManagerId: string,
  orderId: string,
  pool: PoolConfig = DEFAULT_POOL,
): Transaction {
  const tx = new Transaction();

  // Generate trade proof
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::cancel_order`,
    typeArguments: [
      pool.baseToken.type!,
      pool.quoteToken.type!,
    ],
    arguments: [
      tx.object(pool.id!),
      tx.object(balanceManagerId),
      tradeProof,
      tx.pure.u128(orderId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * 단순 스왑 (BalanceManager 없이)
 * Base → Quote 스왑
 */
export function buildSwapExactBaseForQuote(
  baseCoinId: string,
  deepCoinId: string,
  minQuoteOut: bigint,
  senderAddress: string,
): Transaction {
  // Security: Validate slippage protection
  validateSlippageParams(minQuoteOut);

  const tx = new Transaction();

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::swap_exact_base_for_quote`,
    typeArguments: [
      TOKENS.NBTC.type!,
      TOKENS.NUSDC.type!,
    ],
    arguments: [
      tx.object(POOLS.NBTC_NUSDC.id!),
      tx.object(baseCoinId),
      tx.object(deepCoinId),
      tx.pure.u64(minQuoteOut),
      tx.object(CLOCK_ID),
    ],
  });

  // Transfer outputs back to sender
  tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(senderAddress));

  return tx;
}

/**
 * 단순 스왑 (BalanceManager 없이)
 * Quote → Base 스왑
 */
export function buildSwapExactQuoteForBase(
  quoteCoinId: string,
  deepCoinId: string,
  minBaseOut: bigint,
  senderAddress: string,
): Transaction {
  // Security: Validate slippage protection
  validateSlippageParams(minBaseOut);

  const tx = new Transaction();

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::swap_exact_quote_for_base`,
    typeArguments: [
      TOKENS.NBTC.type!,
      TOKENS.NUSDC.type!,
    ],
    arguments: [
      tx.object(POOLS.NBTC_NUSDC.id!),
      tx.object(quoteCoinId),
      tx.object(deepCoinId),
      tx.pure.u64(minBaseOut),
      tx.object(CLOCK_ID),
    ],
  });

  // Transfer outputs back to sender
  tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(senderAddress));

  return tx;
}

/**
 * 테스트 토큰 요청 (Token Faucet)
 * 1 NBTC + 100,000 NUSDC를 요청
 */
export function buildRequestTokens(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.faucetPackage}::faucet::request_tokens`,
    arguments: [
      tx.object(NETWORK_CONFIG.tokenFaucet!),
    ],
  });

  return tx;
}

/**
 * NBTC만 요청
 */
export function buildRequestNbtc(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.faucetPackage}::faucet::request_nbtc`,
    arguments: [
      tx.object(NETWORK_CONFIG.tokenFaucet!),
    ],
  });

  return tx;
}

/**
 * NUSDC만 요청
 */
export function buildRequestNusdc(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.faucetPackage}::faucet::request_nusdc`,
    arguments: [
      tx.object(NETWORK_CONFIG.tokenFaucet!),
    ],
  });

  return tx;
}

/**
 * NETH 요청 (Faucet V2 - 24h cooldown)
 * 10 NETH per claim
 */
export function buildRequestNeth(): Transaction {
  if (!NETWORK_CONFIG.tokensV2Package || !NETWORK_CONFIG.tokenFaucetV2 || !NETWORK_CONFIG.claimRecordV2) {
    throw new Error('NETH faucet not configured: tokensV2 contract addresses missing');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.tokensV2Package}::faucet_v2::request_neth_with_cooldown`,
    arguments: [
      tx.object(NETWORK_CONFIG.tokenFaucetV2),
      tx.object(NETWORK_CONFIG.claimRecordV2),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * NSOL 요청 (Faucet V2 - 24h cooldown)
 * 100 NSOL per claim
 */
export function buildRequestNsol(): Transaction {
  if (!NETWORK_CONFIG.tokensV2Package || !NETWORK_CONFIG.tokenFaucetV2 || !NETWORK_CONFIG.claimRecordV2) {
    throw new Error('NSOL faucet not configured: tokensV2 contract addresses missing');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${NETWORK_CONFIG.tokensV2Package}::faucet_v2::request_nsol_with_cooldown`,
    arguments: [
      tx.object(NETWORK_CONFIG.tokenFaucetV2),
      tx.object(NETWORK_CONFIG.claimRecordV2),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * BalanceManager에서 현재 풀의 토큰 출금
 * Base와 Quote 토큰을 지갑으로 전송
 * @param balanceManagerId - BalanceManager object ID
 * @param recipientAddress - 수신 주소
 * @param pool - Pool 설정 (선택, 기본값: NBTC/NUSDC)
 */
export function buildWithdrawAll(
  balanceManagerId: string,
  recipientAddress: string,
  pool: PoolConfig = DEFAULT_POOL,
): Transaction {
  const tx = new Transaction();

  // Base 토큰 전체 출금
  const baseCoin = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::withdraw_all`,
    typeArguments: [pool.baseToken.type!],
    arguments: [tx.object(balanceManagerId)],
  });
  tx.transferObjects([baseCoin], tx.pure.address(recipientAddress));

  // Quote 토큰 전체 출금
  const quoteCoin = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::withdraw_all`,
    typeArguments: [pool.quoteToken.type!],
    arguments: [tx.object(balanceManagerId)],
  });
  tx.transferObjects([quoteCoin], tx.pure.address(recipientAddress));

  return tx;
}

/**
 * Deposit exact amount of a single token into BalanceManager
 * Extracted from useAutoDeposit pattern for reuse in transfer modal.
 * Handles: coin fetching, merge if multiple, split to exact amount, deposit
 * For native tokens (NASUN/SUI), uses tx.gas to avoid gas coin conflicts
 */
export async function buildDepositExact(
  balanceManagerId: string,
  rawAmount: bigint,
  coinType: string,
  ownerAddress: string,
): Promise<Transaction> {
  if (rawAmount <= 0n) {
    throw new Error('Deposit amount must be positive');
  }

  const tx = new Transaction();
  const isNativeToken = coinType === NATIVE_TOKEN_TYPE;

  // Helper: add deposit moveCall to transaction
  const addDeposit = (coin: ReturnType<typeof tx.splitCoins>[0]) => {
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), coin],
    });
  };

  if (isNativeToken) {
    const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(rawAmount)]);
    addDeposit(depositCoin);
  } else {
    const coins = await getAllCoins(ownerAddress, coinType);
    if (coins.length === 0) {
      throw new Error('No coins available for deposit');
    }

    const coinIds = coins.map(c => c.coinObjectId);
    if (coinIds.length === 1) {
      const [depositCoin] = tx.splitCoins(tx.object(coinIds[0]), [tx.pure.u64(rawAmount)]);
      addDeposit(depositCoin);
    } else {
      const [primary, ...rest] = coinIds;
      tx.mergeCoins(tx.object(primary), rest.map(id => tx.object(id)));
      const [depositCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(rawAmount)]);
      addDeposit(depositCoin);
    }
  }

  return tx;
}

// Alias for readability in depositAll logic
const MIN_GAS_RESERVE = GAS_RESERVE_RAW;

/**
 * 특정 토큰 타입의 코인을 BalanceManager에 입금하는 헬퍼 함수
 * @param tx - 트랜잭션
 * @param balanceManagerId - BalanceManager ID
 * @param coins - 코인 목록
 * @param coinType - 코인 타입
 * @param isNativeToken - 네이티브 토큰 여부 (가스비 예약 필요)
 * @returns 입금할 금액
 */
function depositCoinsToBalanceManager(
  tx: Transaction,
  balanceManagerId: string,
  coins: { coinObjectId: string; balance: string }[],
  coinType: string,
  isNativeToken: boolean,
): bigint {
  if (coins.length === 0) return 0n;

  // 총 금액 계산
  let totalAmount = 0n;
  coins.forEach(c => totalAmount += BigInt(c.balance));

  // 네이티브 토큰이면 tx.gas를 사용하여 입금 (가스 코인과의 충돌 방지)
  if (isNativeToken) {
    if (totalAmount <= MIN_GAS_RESERVE) {
      // 가스비 예약보다 적으면 입금하지 않음
      return 0n;
    }
    // 입금할 금액 = 전체 - 가스비 예약
    const depositAmount = totalAmount - MIN_GAS_RESERVE;

    // tx.gas를 사용하여 split - SDK가 자동으로 가스 코인을 선택하고 처리함
    // 이렇게 하면 가스 코인과의 충돌 문제가 해결됨
    const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositAmount)]);
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), depositCoin],
    });
    return depositAmount;
  }

  // 일반 토큰은 전체 입금
  const coinIds = coins.map(c => c.coinObjectId);
  if (coinIds.length === 1) {
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), tx.object(coinIds[0])],
    });
  } else {
    const [primary, ...rest] = coinIds;
    tx.mergeCoins(tx.object(primary), rest.map(id => tx.object(id)));
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::deposit`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), tx.object(primary)],
    });
  }
  return totalAmount;
}

/**
 * 현재 풀의 Base/Quote 토큰을 BalanceManager에 입금
 * 여러 코인이 있으면 merge 후 입금
 * NASUN (네이티브 토큰)의 경우 가스비를 위해 0.1 NASUN 남김
 * @param balanceManagerId - BalanceManager ID
 * @param address - 지갑 주소
 * @param pool - Pool 설정 (선택, 기본값: NBTC/NUSDC)
 * @returns tx와 입금할 금액 정보
 */
export async function buildDepositAll(
  balanceManagerId: string,
  address: string,
  pool: PoolConfig = DEFAULT_POOL,
): Promise<{ tx: Transaction; baseAmount: bigint; quoteAmount: bigint }> {
  const tx = new Transaction();

  // Fetch base and quote coins in parallel
  const [baseCoins, quoteCoins] = await Promise.all([
    getAllCoins(address, pool.baseToken.type!),
    getAllCoins(address, pool.quoteToken.type!),
  ]);

  const isBaseNative = pool.baseToken.type === NATIVE_TOKEN_TYPE;
  const baseAmount = depositCoinsToBalanceManager(
    tx,
    balanceManagerId,
    baseCoins,
    pool.baseToken.type!,
    isBaseNative,
  );
  const isQuoteNative = pool.quoteToken.type === NATIVE_TOKEN_TYPE;
  const quoteAmount = depositCoinsToBalanceManager(
    tx,
    balanceManagerId,
    quoteCoins,
    pool.quoteToken.type!,
    isQuoteNative,
  );

  return { tx, baseAmount, quoteAmount };
}
