import type {
  SuiTransactionBlockResponse,
  SuiObjectResponse,
  CheckpointPage,
  Checkpoint,
  CoinMetadata,
  CoinBalance,
  SuiMoveNormalizedModules,
  DynamicFieldPage,
} from '@mysten/sui/client';
import { SuiClient } from '@mysten/sui/client';

const RPC_URL = import.meta.env.VITE_SUI_RPC_URL;
if (!RPC_URL) {
  throw new Error('VITE_SUI_RPC_URL environment variable is required. Cannot fall back to public devnet.');
}

export const suiClient = new SuiClient({ url: RPC_URL });

export const networkConfig = {
  name: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
  chainId: import.meta.env.VITE_CHAIN_ID || 'unknown',
  rpcUrl: RPC_URL,
};

export interface NetworkStatus {
  chainId: string | null;
  latestCheckpoint: string | null;
  referenceGasPrice: string | null;
  isConnected: boolean;
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  try {
    const [chainId, latestCheckpoint, referenceGasPrice] = await Promise.all([
      suiClient.getChainIdentifier(),
      suiClient.getLatestCheckpointSequenceNumber(),
      suiClient.getReferenceGasPrice(),
    ]);

    return {
      chainId,
      latestCheckpoint,
      referenceGasPrice: referenceGasPrice.toString(),
      isConnected: true,
    };
  } catch (error) {
    console.error('Failed to get network status:', error);
    return {
      chainId: null,
      latestCheckpoint: null,
      referenceGasPrice: null,
      isConnected: false,
    };
  }
}

export async function getRecentTransactions(limit = 10): Promise<SuiTransactionBlockResponse[]> {
  try {
    const txs = await suiClient.queryTransactionBlocks({
      limit,
      order: 'descending',
      options: {
        showInput: true,
      },
    });
    return txs.data;
  } catch (error) {
    console.error('Failed to get recent transactions:', error);
    return [];
  }
}

export async function getTransaction(digest: string): Promise<SuiTransactionBlockResponse | null> {
  try {
    const tx = await suiClient.getTransactionBlock({
      digest,
      options: {
        showInput: true,
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
        showBalanceChanges: true,
      },
    });
    return tx;
  } catch (error) {
    console.error('Failed to get transaction:', error);
    return null;
  }
}

export async function getObject(objectId: string): Promise<SuiObjectResponse | null> {
  try {
    const obj = await suiClient.getObject({
      id: objectId,
      options: {
        showContent: true,
        showDisplay: true,
        showOwner: true,
        showType: true,
        showStorageRebate: true,
      },
    });
    return obj;
  } catch (error) {
    console.error('Failed to get object:', error);
    return null;
  }
}

export interface AddressInfo {
  balance: CoinBalance;
  allBalances: CoinBalance[];
  ownedObjects: SuiObjectResponse[];
  hasNextPage: boolean;
  nextCursor: string | null | undefined;
}

const EMPTY_BALANCE: CoinBalance = {
  totalBalance: '0',
  coinType: '0x2::sui::SUI',
  coinObjectCount: 0,
  lockedBalance: {},
};

export async function getAddressInfo(address: string, cursor?: string | null): Promise<AddressInfo | null> {
  try {
    const [allBalances, ownedObjects] = await Promise.all([
      suiClient.getAllBalances({ owner: address }),
      suiClient.getOwnedObjects({
        owner: address,
        options: { showContent: true, showType: true, showDisplay: true },
        limit: 50,
        cursor: cursor || undefined,
      }),
    ]);

    const nativeBalance = allBalances.find(b => b.coinType === '0x2::sui::SUI');

    return {
      balance: nativeBalance || EMPTY_BALANCE,
      allBalances,
      ownedObjects: ownedObjects.data,
      hasNextPage: ownedObjects.hasNextPage,
      nextCursor: ownedObjects.nextCursor,
    };
  } catch (error) {
    console.error('Failed to get address info:', error);
    return null;
  }
}

export interface LoadMoreResult {
  ownedObjects: SuiObjectResponse[];
  hasNextPage: boolean;
  nextCursor: string | null | undefined;
}

export async function loadMoreObjects(address: string, cursor: string): Promise<LoadMoreResult | null> {
  try {
    const ownedObjects = await suiClient.getOwnedObjects({
      owner: address,
      options: { showContent: true, showType: true, showDisplay: true },
      limit: 50,
      cursor,
    });

    return {
      ownedObjects: ownedObjects.data,
      hasNextPage: ownedObjects.hasNextPage,
      nextCursor: ownedObjects.nextCursor,
    };
  } catch (error) {
    console.error('Failed to load more objects:', error);
    return null;
  }
}

export async function getAddressTransactions(address: string, limit = 20): Promise<SuiTransactionBlockResponse[]> {
  try {
    const [sentTxs, receivedTxs] = await Promise.all([
      suiClient.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: { showEffects: true, showInput: true },
        limit,
        order: 'descending',
      }),
      suiClient.queryTransactionBlocks({
        filter: { ToAddress: address },
        options: { showEffects: true, showInput: true },
        limit,
        order: 'descending',
      }),
    ]);

    // Merge and deduplicate by digest, then sort by timestamp descending
    const seen = new Set<string>();
    const merged = [...sentTxs.data, ...receivedTxs.data].filter((tx) => {
      if (seen.has(tx.digest)) return false;
      seen.add(tx.digest);
      return true;
    });

    merged.sort((a, b) => {
      const timeA = Number(a.timestampMs ?? 0);
      const timeB = Number(b.timestampMs ?? 0);
      return timeB - timeA;
    });

    return merged.slice(0, limit);
  } catch (error) {
    console.error('Failed to get address transactions:', error);
    return [];
  }
}

// ============================================
// Validator Functions
// ============================================

export interface ValidatorInfo {
  address: string;
  name: string;
  description: string;
  imageUrl: string;
  projectUrl: string;
  commissionRate: number;
  stakingPoolSuiBalance: string;
  nextEpochStake: string;
  votingPower: string;
  gasPrice: string;
  apy: number;
}

export interface ValidatorsData {
  epoch: string;
  totalStake: string;
  activeValidators: ValidatorInfo[];
  pendingActiveValidatorsSize: string;
  stakingPoolMappingsSize: string;
}

export async function getValidators(): Promise<ValidatorsData | null> {
  try {
    const [systemState, validatorsApy] = await Promise.all([
      suiClient.getLatestSuiSystemState(),
      suiClient.getValidatorsApy(),
    ]);

    const apyMap = new Map(
      validatorsApy.apys.map((v) => [v.address, v.apy])
    );

    return {
      epoch: systemState.epoch,
      totalStake: systemState.totalStake,
      activeValidators: systemState.activeValidators.map((v) => ({
        address: v.suiAddress,
        name: v.name,
        description: v.description,
        imageUrl: v.imageUrl,
        projectUrl: v.projectUrl,
        commissionRate: Number(v.commissionRate) / 100, // basis points to percentage
        stakingPoolSuiBalance: v.stakingPoolSuiBalance,
        nextEpochStake: v.nextEpochStake,
        votingPower: v.votingPower,
        gasPrice: v.gasPrice,
        apy: apyMap.get(v.suiAddress) || 0,
      })),
      pendingActiveValidatorsSize: systemState.pendingActiveValidatorsSize,
      stakingPoolMappingsSize: systemState.stakingPoolMappingsSize,
    };
  } catch (error) {
    console.error('Failed to get validators:', error);
    return null;
  }
}

export type ValidatorDetail = ValidatorInfo & {
  epoch: string;
  totalNetworkStake: string;
};

export async function getValidatorByAddress(address: string): Promise<ValidatorDetail | null> {
  try {
    const validators = await getValidators();
    if (!validators) return null;

    const validator = validators.activeValidators.find(
      (v) => v.address === address
    );

    return validator
      ? {
          ...validator,
          epoch: validators.epoch,
          totalNetworkStake: validators.totalStake,
        }
      : null;
  } catch (error) {
    console.error('Failed to get validator details:', error);
    return null;
  }
}

// ============================================
// Checkpoint Functions
// ============================================

export async function getCheckpoints(limit = 20, cursor?: string): Promise<CheckpointPage | null> {
  try {
    const checkpoints = await suiClient.getCheckpoints({
      descendingOrder: true,
      limit,
      cursor,
    });
    return checkpoints;
  } catch (error) {
    console.error('Failed to get checkpoints:', error);
    return null;
  }
}

export async function getCheckpoint(sequenceNumber: string): Promise<Checkpoint | null> {
  try {
    const checkpoint = await suiClient.getCheckpoint({
      id: sequenceNumber,
    });
    return checkpoint;
  } catch (error) {
    console.error('Failed to get checkpoint:', error);
    return null;
  }
}

// ============================================
// Coin Metadata Functions
// ============================================

export async function getCoinMetadata(coinType: string): Promise<CoinMetadata | null> {
  try {
    const metadata = await suiClient.getCoinMetadata({ coinType });
    return metadata;
  } catch (error) {
    console.error('Failed to get coin metadata:', error);
    return null;
  }
}

export async function getCoinTotalSupply(coinType: string): Promise<string | null> {
  try {
    const supply = await suiClient.getTotalSupply({ coinType });
    return supply.value;
  } catch (error) {
    console.error('Failed to get total supply:', error);
    return null;
  }
}

export async function getDynamicFields(parentId: string): Promise<DynamicFieldPage | null> {
  try {
    const result = await suiClient.getDynamicFields({ parentId });
    return result;
  } catch (error) {
    console.error('Failed to get dynamic fields:', error);
    return null;
  }
}

// ============================================
// Epoch & TPS Functions
// ============================================

export interface EpochInfo {
  epoch: string;
  epochStartTimestampMs: string;
  epochDurationMs: string;
  remainingMs: number;
  totalStake: string;
  activeValidatorsCount: number;
  progress: number;
  startTimestamp: number;
  endTimestamp: number;
}

export async function getEpochInfo(): Promise<EpochInfo | null> {
  try {
    const systemState = await suiClient.getLatestSuiSystemState();
    const now = Date.now();
    const epochStart = Number(systemState.epochStartTimestampMs);
    const epochDuration = Number(systemState.epochDurationMs);
    const epochEnd = epochStart + epochDuration;
    const remainingMs = Math.max(0, epochEnd - now);
    const elapsed = now - epochStart;
    const progress = Math.min(100, Math.max(0, (elapsed / epochDuration) * 100));

    return {
      epoch: systemState.epoch,
      epochStartTimestampMs: systemState.epochStartTimestampMs,
      epochDurationMs: systemState.epochDurationMs,
      remainingMs,
      totalStake: systemState.totalStake,
      activeValidatorsCount: systemState.activeValidators.length,
      // New fields for charts
      progress,
      startTimestamp: epochStart,
      endTimestamp: epochEnd,
    };
  } catch (error) {
    console.error('Failed to get epoch info:', error);
    return null;
  }
}

export async function getTPS(): Promise<number | null> {
  try {
    // 최근 5개 체크포인트로 TPS 추정
    const checkpoints = await suiClient.getCheckpoints({
      descendingOrder: true,
      limit: 5,
    });

    if (!checkpoints.data || checkpoints.data.length < 2) return null;

    const latest = checkpoints.data[0];
    const oldest = checkpoints.data[checkpoints.data.length - 1];

    // 체크포인트 간 트랜잭션 수 차이 계산
    const txDiff = Number(latest.networkTotalTransactions) - Number(oldest.networkTotalTransactions);
    const timeDiff = (Number(latest.timestampMs) - Number(oldest.timestampMs)) / 1000;

    if (timeDiff <= 0) return null;

    return Math.round((txDiff / timeDiff) * 10) / 10; // 소수점 1자리
  } catch (error) {
    console.error('Failed to calculate TPS:', error);
    return null;
  }
}

// ============================================
// Network State (Protocol Metrics)
// ============================================

export interface NetworkState {
  epoch: string;
  epochDurationMs: string;
  epochStartTimestampMs: string;
  totalStake: string;
  referenceGasPrice: string;
  activeValidatorsCount: number;
  stakeSubsidyBalance: string;
  stakeSubsidyCurrentDistributionAmount: string;
  stakeSubsidyStartEpoch: string;
  storageFundTotalObjectStorageRebates: string;
  storageFundNonRefundableBalance: string;
  safeMode: boolean;
}

export async function getNetworkState(): Promise<NetworkState | null> {
  try {
    const s = await suiClient.getLatestSuiSystemState();
    return {
      epoch: s.epoch,
      epochDurationMs: s.epochDurationMs,
      epochStartTimestampMs: s.epochStartTimestampMs,
      totalStake: s.totalStake,
      referenceGasPrice: s.referenceGasPrice,
      activeValidatorsCount: s.activeValidators.length,
      stakeSubsidyBalance: s.stakeSubsidyBalance,
      stakeSubsidyCurrentDistributionAmount: s.stakeSubsidyCurrentDistributionAmount,
      stakeSubsidyStartEpoch: s.stakeSubsidyStartEpoch,
      storageFundTotalObjectStorageRebates: s.storageFundTotalObjectStorageRebates,
      storageFundNonRefundableBalance: s.storageFundNonRefundableBalance,
      safeMode: s.safeMode,
    };
  } catch (error) {
    console.error('Failed to get network state:', error);
    return null;
  }
}

// ============================================
// Package/Module Functions
// ============================================

export async function getPackageModules(packageId: string): Promise<SuiMoveNormalizedModules | null> {
  try {
    const modules = await suiClient.getNormalizedMoveModulesByPackage({
      package: packageId,
    });
    return modules;
  } catch (error) {
    console.error('Failed to get package modules:', error);
    return null;
  }
}

