/**
 * Contract Registry Factory
 *
 * Creates a ContractRegistry instance from known Nasun/Pado contracts.
 * The returned object is structurally compatible with @nasun/wallet's
 * ContractRegistry interface (no import needed — TypeScript structural typing).
 *
 * Usage:
 *   import { createContractRegistry } from '@nasun/devnet-config';
 *   import { configureClearSigning, setFormatterConfig } from '@nasun/wallet';
 *
 *   const registry = createContractRegistry();
 *   configureClearSigning({ contractRegistry: registry });
 *   setFormatterConfig({ contractRegistry: registry });
 */
import { KNOWN_CONTRACTS, type KnownContractEntry } from './ids/contracts';

export function createContractRegistry(additionalContracts?: KnownContractEntry[]) {
  const map = new Map<string, KnownContractEntry>();

  for (const contract of [...KNOWN_CONTRACTS, ...(additionalContracts ?? [])]) {
    const key = `${contract.chainId}:${contract.address.toLowerCase()}`;
    map.set(key, contract);
  }

  return {
    get(chainId: string, address: string): KnownContractEntry | null {
      return map.get(`${chainId}:${address.toLowerCase()}`) ?? null;
    },
    isVerified(chainId: string, address: string): boolean {
      return map.get(`${chainId}:${address.toLowerCase()}`)?.verified ?? false;
    },
    isFlagged(_chainId: string, _address: string): boolean {
      return false;
    },
  };
}
