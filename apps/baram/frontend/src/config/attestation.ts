/**
 * Attestation Configuration
 *
 * Expected PCR0 values for TEE executors.
 * PCR0 is a hash of the Enclave Image File (EIF) that proves
 * the exact code running inside the TEE.
 *
 * To update: Build a new EIF and record the PCR0 value from:
 *   nitro-cli describe-enclaves --output json | jq '.Measurements.PCR0'
 */

// Expected PCR0 value for Baram Enclave
// Empty string means verification is skipped (development mode)
// Set to actual PCR0 hash in production
export const EXPECTED_PCR0 = import.meta.env.VITE_EXPECTED_PCR0 || '';

// TEE Provider names
export const TEE_PROVIDERS: Record<number, string> = {
  0: 'None',
  1: 'AWS Nitro Enclave',
  2: 'Intel SGX',
  3: 'AMD SEV',
};

// Get TEE provider name by type
export function getTeeProviderName(teeType: number): string {
  return TEE_PROVIDERS[teeType] || 'Unknown';
}
