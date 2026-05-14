/**
 * Fetch + verify TEE attestation for a given executor.
 *
 * Ported from baram. PCR0 is read from VITE_EXPECTED_PCR0; if empty the hook
 * still returns the attestation payload but reports unverified.
 */

import { useState, useEffect, useCallback } from 'react';

const EXPECTED_PCR0 = import.meta.env.VITE_EXPECTED_PCR0 || '';

export interface AttestationInfo {
  moduleId: string;
  pcr0: string;
  timestamp: number;
  publicKey: string;
}

export interface AttestationState {
  isLoading: boolean;
  error: string | null;
  attestation: AttestationInfo | null;
  isVerified: boolean;
  verificationMessage: string;
}

export interface UseAttestationReturn extends AttestationState {
  refetch: () => Promise<void>;
}

async function fetchAttestation(executorUrl: string): Promise<AttestationInfo> {
  const response = await fetch(`${executorUrl}/public-key`);
  if (!response.ok) throw new Error('Failed to fetch attestation');
  const data = await response.json();
  if (!data.publicKey || !data.attestation) throw new Error('Invalid attestation response');
  return {
    moduleId: data.attestation.moduleId || 'unknown',
    pcr0: data.attestation.pcrs?.pcr0 || '',
    timestamp: data.attestation.timestamp || Date.now(),
    publicKey: data.publicKey,
  };
}

function verifyAttestation(attestation: AttestationInfo): { isVerified: boolean; message: string } {
  if (!attestation.pcr0) return { isVerified: false, message: 'No PCR0 value provided' };
  if (!EXPECTED_PCR0) {
    return {
      isVerified: false,
      message: 'PCR0 verification unavailable (no expected value configured)',
    };
  }
  const match = attestation.pcr0.toLowerCase() === EXPECTED_PCR0.toLowerCase();
  return match
    ? { isVerified: true, message: 'PCR0 matches expected value' }
    : { isVerified: false, message: 'PCR0 does not match expected value' };
}

export function useAttestation(executorUrl: string | null, teeType: number): UseAttestationReturn {
  const [state, setState] = useState<AttestationState>({
    isLoading: false,
    error: null,
    attestation: null,
    isVerified: false,
    verificationMessage: '',
  });

  const fetchAndVerify = useCallback(async () => {
    if (!executorUrl || teeType === 0) {
      setState({
        isLoading: false,
        error: null,
        attestation: null,
        isVerified: false,
        verificationMessage: 'Not a TEE executor',
      });
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const attestation = await fetchAttestation(executorUrl);
      const { isVerified, message } = verifyAttestation(attestation);
      setState({
        isLoading: false,
        error: null,
        attestation,
        isVerified,
        verificationMessage: message,
      });
    } catch (err) {
      setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch attestation',
        attestation: null,
        isVerified: false,
        verificationMessage: '',
      });
    }
  }, [executorUrl, teeType]);

  useEffect(() => {
    void fetchAndVerify();
  }, [fetchAndVerify]);

  return { ...state, refetch: fetchAndVerify };
}
