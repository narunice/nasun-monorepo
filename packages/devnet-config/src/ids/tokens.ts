/**
 * Unified Devnet Tokens Configuration
 *
 * All Nasun Devnet apps (pado, baram, etc.) should use these token types.
 * Package: devnet_tokens (packages/devnet-tokens)
 */
import config from '../../devnet-ids.json';
import type { ObjectId, CoinType, TokensConfig } from '../types';

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
