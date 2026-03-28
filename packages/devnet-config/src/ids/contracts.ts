/**
 * Known Contracts Registry Data
 *
 * Maps verified Nasun/Pado contract addresses for Clear Signing.
 * When a contract is in this list, the wallet shows its name instead of
 * "Unknown Contract" and skips the "Unverified Contract" risk warning.
 */
import config from '../../devnet-ids.json';

// Matches @nasun/wallet ContractType — duplicated to avoid circular dependency
type ContractType = 'token' | 'nft' | 'dex' | 'lending' | 'bridge' | 'governance' | 'oracle' | 'leisure' | 'system' | 'unknown';

export interface KnownContractEntry {
  address: string;
  name: string;
  type: ContractType;
  verified: boolean;
  chainId: string;
  logoUrl?: string;
  websiteUrl?: string;
}

const NASUN_DEVNET_CHAIN_ID = '272218f1';

export const KNOWN_CONTRACTS: KnownContractEntry[] = [
  // DeepBook V3 (Pado DEX engine)
  {
    address: config.deepbook.packageId,
    name: 'Pado DeepBook',
    type: 'dex',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Prediction Market
  {
    address: config.prediction.packageId,
    name: 'Pado Prediction',
    type: 'governance',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Lottery
  {
    address: config.lottery.packageId,
    name: 'Pado Lottery',
    type: 'unknown',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Governance (DAO + Voting)
  {
    address: config.governance.packageId,
    name: 'Nasun Governance',
    type: 'governance',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Nasun Smart Account (NSA)
  {
    address: config.nsa.packageId,
    name: 'Nasun Smart Account',
    type: 'system',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Token contracts (NBTC, NUSDC)
  {
    address: config.tokens.packageId,
    name: 'Nasun Tokens',
    type: 'token',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Token contracts V2 (NSOL, NETH)
  {
    address: config.tokensV2.packageId,
    name: 'Nasun Tokens V2',
    type: 'token',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Baram (AI Compliance Settlement)
  {
    address: config.baram.packageId,
    name: 'Baram Settlement',
    type: 'system',
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
  // Oracle
  ...(config.oracle.packageId
    ? [{
        address: config.oracle.packageId,
        name: 'Nasun Oracle',
        type: 'oracle' as ContractType,
        verified: true,
        chainId: NASUN_DEVNET_CHAIN_ID,
      }]
    : []),
  // Number Match
  {
    address: config.numbermatch.packageId,
    name: 'Pado Number Match',
    type: 'leisure' as ContractType,
    verified: true,
    chainId: NASUN_DEVNET_CHAIN_ID,
  },
];
