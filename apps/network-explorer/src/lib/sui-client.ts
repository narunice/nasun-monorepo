import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const RPC_URL = import.meta.env.VITE_SUI_RPC_URL || getFullnodeUrl('devnet');

export const suiClient = new SuiClient({ url: RPC_URL });

export const networkConfig = {
  name: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
  chainId: import.meta.env.VITE_CHAIN_ID || 'unknown',
  rpcUrl: RPC_URL,
};

export async function getNetworkStatus() {
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

export async function getRecentTransactions(limit = 10) {
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

export async function getTransaction(digest: string) {
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

export async function getObject(objectId: string) {
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

export async function getAddressInfo(address: string, cursor?: string | null) {
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

    // 네이티브 토큰 (NSN/SUI) 잔액
    const nativeBalance = allBalances.find(b => b.coinType === '0x2::sui::SUI');

    return {
      balance: nativeBalance || { totalBalance: '0', coinType: '0x2::sui::SUI', coinObjectCount: 0 },
      allBalances, // 모든 토큰 잔액
      ownedObjects: ownedObjects.data,
      hasNextPage: ownedObjects.hasNextPage,
      nextCursor: ownedObjects.nextCursor,
    };
  } catch (error) {
    console.error('Failed to get address info:', error);
    return null;
  }
}

export async function loadMoreObjects(address: string, cursor: string) {
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

export async function getAddressTransactions(address: string, limit = 20) {
  try {
    const txs = await suiClient.queryTransactionBlocks({
      filter: { FromAddress: address },
      options: {
        showEffects: true,
        showInput: true,
      },
      limit,
      order: 'descending',
    });
    return txs.data;
  } catch (error) {
    console.error('Failed to get address transactions:', error);
    return [];
  }
}

// ============================================
// Validator Functions
// ============================================

export async function getValidators() {
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

export async function getValidatorByAddress(address: string) {
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

export async function getCheckpoints(limit = 20, cursor?: string) {
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

export async function getCheckpoint(sequenceNumber: string) {
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

export async function getCoinMetadata(coinType: string) {
  try {
    const metadata = await suiClient.getCoinMetadata({ coinType });
    return metadata;
  } catch (error) {
    console.error('Failed to get coin metadata:', error);
    return null;
  }
}

// ============================================
// Epoch & TPS Functions
// ============================================

export async function getEpochInfo() {
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

export async function getTPS() {
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
// Package/Module Functions
// ============================================

export async function getPackageModules(packageId: string) {
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

