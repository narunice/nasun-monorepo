/**
 * Nasun Devnet Configuration Types
 *
 * Type definitions for centralized devnet ID management.
 * All IDs should be managed in devnet-ids.json and accessed via typed constants.
 */

// Object ID format: 0x followed by 64 hex characters
export type ObjectId = `0x${string}`;

// Coin type format: package::module::TYPE
export type CoinType = `${ObjectId}::${string}::${string}`;

export interface NetworkConfig {
  chainId: string;
  rpcUrl: string;
  faucetUrl: string;
  explorerUrl: string;
}

export interface TokensConfig {
  packageId: ObjectId;
  originalPackageId?: ObjectId;
  tokenFaucet: ObjectId;
  claimRecord: ObjectId;
  perTokenClaimRecord?: ObjectId;
  upgradeCap?: ObjectId;
  nbtcType: CoinType;
  nusdcType: CoinType;
}

export interface DeepBookConfig {
  tokenPackageId: ObjectId;
  packageId: ObjectId;
  registry: ObjectId;
  adminCap: ObjectId;
}

export interface PredictionConfig {
  packageId: ObjectId;
  globalState: ObjectId;
  adminCap: ObjectId;
}

export interface LotteryConfig {
  packageId: ObjectId;
  registry: ObjectId;
  adminCap: ObjectId;
  upgradeCap: ObjectId;
}

export interface GovernanceConfig {
  packageId: ObjectId;
  originalPackageId?: ObjectId;
  upgradeCap?: ObjectId;
  dashboard: ObjectId;
  adminCap: ObjectId;
  votingPowerOracle: ObjectId;
  certificateRegistry: ObjectId;
  proposalTypeRegistry: ObjectId;
}

export interface BaramConfig {
  packageId: ObjectId;
  registry: ObjectId;
  upgradeCap: ObjectId;
  executorPackageId: ObjectId;
  executorRegistry: ObjectId;
  executorAdminCap: ObjectId;
  executorUpgradeCap: ObjectId;
  // Staking (Phase D-4)
  stakingConfig: ObjectId;
  stakingRegistry: ObjectId;
  stakingAdminCap: ObjectId;
  // Tier (Phase E)
  tierRegistry: ObjectId;
  // Phase F-2: Self-service
  processedRequests: ObjectId;
  // Attestation
  attestationPackageId: ObjectId;
  attestationRegistry: ObjectId;
  attestationAdminCap: ObjectId;
  attestationUpgradeCap: ObjectId;
  // Compliance (ECR) — FROZEN, replaced by AER
  compliancePackageId: ObjectId;
  complianceRegistry: ObjectId;
  complianceAdminCap: ObjectId;
  complianceUpgradeCap: ObjectId;
  // AER (AI Execution Report)
  aerPackageId: ObjectId;
  aerRegistry: ObjectId;
  aerAdminCap: ObjectId;
  aerUpgradeCap: ObjectId;
  // Budget type origin (package ID where budget module was first introduced)
  budgetTypeOrigin: ObjectId;
  // Budget V2 type origin (SpendingLimits/Categories structs added in upgrade)
  budgetV2TypeOrigin: ObjectId;
  // Agent Profile
  agentPackageId: ObjectId;
  agentProfileRegistry: ObjectId;
  agentUpgradeCap: ObjectId;
  // Beta Access NFT
  betaAccessRegistry: ObjectId | '';
  betaAccessAdmin: ObjectId | '';
  nusdcType: CoinType;
}

export interface TokensV2Config {
  packageId: ObjectId;              // NSOL package (upgraded)
  originalPackageId?: ObjectId;     // NSOL original package (for coin types)
  tokenFaucetV2: ObjectId;          // NSOL faucet shared object
  claimRecordV2: ObjectId;          // NSOL claim record
  nethPackageId: ObjectId;          // NETH package (upgraded)
  nethOriginalPackageId?: ObjectId; // NETH original package (for coin types)
  nethFaucetV2: ObjectId;           // NETH faucet shared object
  nethClaimRecordV2: ObjectId;      // NETH claim record
  nethType: CoinType;
  nsolType: CoinType;
}

export interface PoolsConfig {
  nbtcNusdc: ObjectId | '';
  nsnNusdc: ObjectId | '';
}

export interface OracleConfig {
  packageId: ObjectId | '';
  registry: ObjectId | '';
  adminCap: ObjectId | '';
}

export interface DevnetConfig {
  version: string;
  lastUpdated: string;
  admin: ObjectId;
  network: NetworkConfig;
  tokens: Omit<TokensConfig, 'nbtcType' | 'nusdcType'>;
  deepbook: DeepBookConfig;
  prediction: PredictionConfig;
  lottery: LotteryConfig;
  governance: GovernanceConfig;
  baram: Omit<BaramConfig, 'nusdcType'>;
  tokensV2: Omit<TokensV2Config, 'nethType' | 'nsolType'>;
  pools: PoolsConfig;
  oracle: OracleConfig;
}
