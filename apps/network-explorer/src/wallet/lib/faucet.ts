/**
 * Nasun Devnet Faucet API
 */

import type { FaucetResponse } from '../types/wallet';

// Faucet URL
// 개발 환경: Vite 프록시 사용 (CORS 우회)
// 프로덕션: 직접 Faucet URL 사용
const FAUCET_URL = import.meta.env.DEV
  ? '/api/faucet'
  : (import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io');

/**
 * Faucet에서 테스트 토큰 요청
 * @param address 토큰을 받을 주소
 * @returns Faucet 응답
 */
export async function requestFaucet(address: string): Promise<FaucetResponse> {
  try {
    const response = await fetch(`${FAUCET_URL}/gas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FixedAmountRequest: {
          recipient: address,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Faucet request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data as FaucetResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to request faucet');
  }
}

/**
 * Faucet 사용 가능 여부 확인
 */
export async function checkFaucetAvailable(): Promise<boolean> {
  try {
    const response = await fetch(FAUCET_URL, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
