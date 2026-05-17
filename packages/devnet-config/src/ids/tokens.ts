/**
 * Unified Devnet Tokens Configuration
 *
 * All Nasun Devnet apps (pado, baram, etc.) should use these token types.
 * Package: devnet_tokens (packages/devnet-tokens)
 */
import config from '../../devnet-ids.json';
import type { ObjectId, CoinType, TokensConfig, TokensV2Config } from '../types';

export const TOKENS_PACKAGE_ID = config.tokens.packageId as ObjectId;
export const TOKENS_ORIGINAL_PACKAGE_ID = config.tokens.originalPackageId as ObjectId | undefined;
export const TOKEN_FAUCET = config.tokens.tokenFaucet as ObjectId;
export const CLAIM_RECORD = config.tokens.claimRecord as ObjectId;
export const PER_TOKEN_CLAIM_RECORD = config.tokens.perTokenClaimRecord as ObjectId;
export const TOKENS_UPGRADE_CAP = config.tokens.upgradeCap as ObjectId | undefined;

// Coin types use original package ID (types don't change after upgrade)
const coinTypePackage = TOKENS_ORIGINAL_PACKAGE_ID || TOKENS_PACKAGE_ID;
export const NBTC_TYPE: CoinType = `${coinTypePackage}::nbtc::NBTC`;
export const NBTC_DECIMALS = 8;
export const NUSDC_TYPE: CoinType = `${coinTypePackage}::nusdc::NUSDC`;
export const NUSDC_DECIMALS = 6;

// NSN is the native gas coin on Nasun Network (fork inherits 0x2::sui::SUI).
export const NSN_TYPE: CoinType = '0x2::sui::SUI';
export const NSN_DECIMALS = 9;

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

// V2 Coin types use original package ID (types don't change after upgrade)
const nethCoinTypePkg = config.tokensV2.nethOriginalPackageId as ObjectId || NETH_PACKAGE_ID;
const nsolCoinTypePkg = config.tokensV2.originalPackageId as ObjectId || TOKENS_V2_PACKAGE_ID;
export const NETH_TYPE: CoinType = `${nethCoinTypePkg}::neth::NETH`;
export const NSOL_TYPE: CoinType = `${nsolCoinTypePkg}::nsol::NSOL`;

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
