/**
 * useAERResult - Fetches stored AI execution result text from Lambda.
 * Results have a 7-day TTL in DynamoDB.
 *
 * Uses POST /result with wallet signature for ownership verification.
 */

import { useQuery } from '@tanstack/react-query';
import { useSigner, ZkLoginSigner } from '@nasun/wallet';
import { BARAM_CONFIG } from '@/config/network';

export interface AERResultData {
  requestId: number;
  result: string;
  resultHash: string;
  model: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
}

export function useAERResult(requestId: number | null, authorizer: string | null) {
  const { signer } = useSigner();

  return useQuery({
    queryKey: ['aer', 'result', requestId, authorizer],
    queryFn: async (): Promise<AERResultData> => {
      if (!signer) throw new Error('SIGNER_UNAVAILABLE');

      const timestamp = Date.now();
      const message = new TextEncoder().encode(
        `baram:view-result:${requestId}:${timestamp}`
      );

      let signature: string;
      let signerType: 'standard' | 'zklogin';
      let ephemeralPubKey: string | undefined;

      if (signer.type === 'zklogin') {
        const zk = signer as ZkLoginSigner;
        signature = (await zk.signWithEphemeralKey(message)).signature;
        signerType = 'zklogin';
        ephemeralPubKey = zk.getEphemeralPublicKey();
      } else {
        signature = (await signer.signPersonal(message)).signature;
        signerType = 'standard';
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (BARAM_CONFIG.apiKey) {
        headers['x-api-key'] = BARAM_CONFIG.apiKey;
      }

      const res = await fetch(`${BARAM_CONFIG.backendUrl}/result`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestId,
          timestamp,
          signature,
          address: authorizer,
          signerType,
          ephemeralPubKey,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 404) throw new Error('EXPIRED');
      if (res.status === 403) throw new Error('ACCESS_DENIED');
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return res.json();
    },
    enabled: !!requestId && !!authorizer && !!signer,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (count, error) => {
      if (error?.message === 'ACCESS_DENIED' || error?.message === 'EXPIRED') return false;
      return count < 2;
    },
    retryDelay: 1000,
  });
}
