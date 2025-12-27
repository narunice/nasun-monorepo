/**
 * 입력 검증 유틸리티
 */

const TIMESTAMP_VALIDITY_MS = 5 * 60 * 1000; // 5분

export function validateEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateSignature(signature: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}

export function validateTimestamp(timestamp: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const diff = now - requestTime;

    // 미래 시간 체크
    if (diff < 0) {
      return {
        valid: false,
        error: 'Timestamp is in the future'
      };
    }

    // 만료 체크 (5분)
    if (diff > TIMESTAMP_VALIDITY_MS) {
      return {
        valid: false,
        error: `Timestamp expired (older than 5 minutes)`
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid timestamp format'
    };
  }
}

export function validateJoinRequest(body: any): {
  valid: boolean;
  error?: string;
} {
  if (!body.walletAddress || !validateEthereumAddress(body.walletAddress)) {
    return { valid: false, error: 'Invalid wallet address format' };
  }

  if (!body.signature || !validateSignature(body.signature)) {
    return { valid: false, error: 'Invalid signature format' };
  }

  if (!body.message || typeof body.message !== 'string') {
    return { valid: false, error: 'Invalid message format' };
  }

  if (!body.timestamp) {
    return { valid: false, error: 'Timestamp is required' };
  }

  // 타임스탬프 검증
  const timestampCheck = validateTimestamp(body.timestamp);
  if (!timestampCheck.valid) {
    return { valid: false, error: timestampCheck.error };
  }

  return { valid: true };
}

export function validateWithdrawRequest(body: any): {
  valid: boolean;
  error?: string;
} {
  // Join과 동일한 검증
  return validateJoinRequest(body);
}
