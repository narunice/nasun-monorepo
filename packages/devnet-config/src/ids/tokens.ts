/**
 * Unified Devnet Tokens Configuration
 *
 * All Nasun Devnet apps (pado, baram, etc.) should use these token types.
 * Package: devnet_tokens (packages/devnet-tokens)
 */
import config from '../../devnet-ids.json';
import type { ObjectId, CoinType, TokensConfig, TokensV2Config } from '../types';

export const TOKENS_PACKAGE_ID = config.tokens.packageId as ObjectId;
export const TOKEN_FAUCET = config.tokens.tokenFaucet as ObjectId;
export const CLAIM_RECORD = config.tokens.claimRecord as ObjectId;
export const TOKENS_UPGRADE_CAP = (config.tokens as { upgradeCap?: string }).upgradeCap as ObjectId | undefined;

// Unified coin types for all apps
export const NBTC_TYPE: CoinType = `${TOKENS_PACKAGE_ID}::nbtc::NBTC`;
export const NUSDC_TYPE: CoinType = `${TOKENS_PACKAGE_ID}::nusdc::NUSDC`;

export const TOKENS: TokensConfig = {
  packageId: TOKENS_PACKAGE_ID,
  tokenFaucet: TOKEN_FAUCET,
  claimRecord: CLAIM_RECORD,
  upgradeCap: TOKENS_UPGRADE_CAP,
  nbtcType: NBTC_TYPE,
  nusdcType: NUSDC_TYPE,
};

// V2 Tokens (NETH, NSOL) - separate contracts from V1
export const TOKENS_V2_PACKAGE_ID = config.tokensV2.packageId as ObjectId;
export const TOKEN_FAUCET_V2 = config.tokensV2.tokenFaucetV2 as ObjectId;
export const CLAIM_RECORD_V2 = config.tokensV2.claimRecordV2 as ObjectId;

export const NETH_PACKAGE_ID = config.tokensV2.nethPackageId as ObjectId;
export const NETH_FAUCET_V2 = config.tokensV2.nethFaucetV2 as ObjectId;
export const NETH_CLAIM_RECORD_V2 = config.tokensV2.nethClaimRecordV2 as ObjectId;

// V2 Coin types
export const NETH_TYPE: CoinType = `${NETH_PACKAGE_ID}::neth::NETH`;
export const NSOL_TYPE: CoinType = `${TOKENS_V2_PACKAGE_ID}::nsol::NSOL`;

export const TOKENS_V2: TokensV2Config = {
  packageId: TOKENS_V2_PACKAGE_ID,
  tokenFaucetV2: TOKEN_FAUCET_V2,
  claimRecordV2: CLAIM_RECORD_V2,
  nethPackageId: NETH_PACKAGE_ID,
  nethFaucetV2: NETH_FAUCET_V2,
  nethClaimRecordV2: NETH_CLAIM_RECORD_V2,
  nethType: NETH_TYPE,
  nsolType: NSOL_TYPE,
};
