/**
 * Error Parser Utility
 * Move abort 에러를 사용자 친화적인 메시지로 변환
 */

export type ErrorType = 'GAS_REQUIRED' | 'INSUFFICIENT_BALANCE' | 'GENERIC';

export interface ParsedError {
  message: string;
  code?: string;
  isKnown: boolean;
  errorType?: ErrorType;
}

// DeepBook V3 balance_manager 에러 코드
const BALANCE_MANAGER_ERRORS: Record<number, string> = {
  1: 'BalanceManager not found',
  2: 'Permission denied',
  3: 'Insufficient balance',
  4: 'Invalid amount',
  5: 'Trade cap mismatch',
};

// DeepBook V3 pool 에러 코드
const POOL_ERRORS: Record<number, string> = {
  1: 'Pool not found',
  2: 'Invalid price (must match tick size)',
  3: 'Invalid quantity (must match lot size)',
  4: 'Order already cancelled or filled',
  5: 'Self-matching not allowed',
  6: 'Post-only order would cross the book',
};

// DeepBook V3 order_info 에러 코드 (order_info.move 참조)
const ORDER_INFO_ERRORS: Record<number, string> = {
  0: 'Invalid price (must be a multiple of tick size)',    // EOrderInvalidPrice
  1: 'Order below minimum size',                          // EOrderBelowMinimumSize
  2: 'Invalid quantity (must be a multiple of lot size)',  // EOrderInvalidLotSize
  3: 'Order expired',                                     // EInvalidExpireTimestamp
  4: 'Invalid order type',                                // EInvalidOrderType
  5: 'Post-only order rejected: would cross the book',    // EPOSTOrderCrossesOrderbook
  6: 'Fill-or-Kill cannot be fully filled',                // EFOKOrderCannotBeFullyFilled
  7: 'Market order cannot be post-only',                   // EMarketOrderCannotBePostOnly
  8: 'Self-matching: taker order canceled',                // ESelfMatchingCancelTaker
};

// 일반적인 Sui 에러 패턴
const GENERAL_ERRORS: { pattern: RegExp; message: string; errorType?: ErrorType }[] = [
  {
    pattern: /No valid gas coins found/i,
    message: 'No gas tokens available. You need NASUN to pay for transaction fees.',
    errorType: 'GAS_REQUIRED',
  },
  {
    pattern: /InsufficientGas/i,
    message: 'Insufficient gas. You need more NASUN to pay for transaction fees.',
    errorType: 'GAS_REQUIRED',
  },
  {
    pattern: /InsufficientCoinBalance/i,
    message: 'Insufficient token balance.',
    errorType: 'INSUFFICIENT_BALANCE',
  },
  {
    pattern: /ObjectNotFound/i,
    message: 'Object not found on chain.',
  },
  {
    pattern: /TransactionExpired/i,
    message: 'Transaction expired. Please try again.',
  },
];

/**
 * MoveAbort 에러에서 모듈명과 에러코드 추출
 */
function parseMoveAbort(error: string): { module: string; code: number } | null {
  // 패턴: MoveAbort(MoveLocation { module: ModuleId { address: ..., name: Identifier("module_name") }, ... }, error_code)
  const moduleMatch = error.match(/name:\s*Identifier\("(\w+)"\)/);
  // $ 제거: 에러 문자열 중간에서도 매칭 가능하도록
  const codeMatch = error.match(/},\s*(\d+)\)/);

  if (moduleMatch && codeMatch) {
    return {
      module: moduleMatch[1],
      code: parseInt(codeMatch[1], 10),
    };
  }
  return null;
}

/**
 * 에러 메시지를 사용자 친화적인 메시지로 변환
 */
export function parseError(error: unknown): ParsedError {
  const errorStr = error instanceof Error ? error.message : String(error);

  // MoveAbort 에러 파싱
  if (errorStr.includes('MoveAbort')) {
    const parsed = parseMoveAbort(errorStr);

    if (parsed) {
      // balance_manager 에러
      if (parsed.module === 'balance_manager') {
        const message = BALANCE_MANAGER_ERRORS[parsed.code];
        if (message) {
          return {
            message,
            code: `BM-${parsed.code}`,
            isKnown: true,
          };
        }
      }

      // pool 에러
      if (parsed.module === 'pool') {
        const message = POOL_ERRORS[parsed.code];
        if (message) {
          return {
            message,
            code: `POOL-${parsed.code}`,
            isKnown: true,
          };
        }
      }

      // order_info 에러
      if (parsed.module === 'order_info') {
        const message = ORDER_INFO_ERRORS[parsed.code];
        if (message) {
          return {
            message,
            code: `ORDER_INFO-${parsed.code}`,
            isKnown: true,
          };
        }
      }

      // 알 수 없는 Move 에러
      return {
        message: `Transaction failed (${parsed.module}:${parsed.code})`,
        code: `${parsed.module.toUpperCase()}-${parsed.code}`,
        isKnown: false,
      };
    }
  }

  // Dry run 에러 래핑 제거
  if (errorStr.includes('Dry run failed')) {
    // 내부 MoveAbort 추출
    if (errorStr.includes('MoveAbort')) {
      const innerParsed = parseMoveAbort(errorStr);
      if (innerParsed) {
        // balance_manager 에러
        if (innerParsed.module === 'balance_manager') {
          const message = BALANCE_MANAGER_ERRORS[innerParsed.code];
          if (message) {
            return {
              message,
              code: `BM-${innerParsed.code}`,
              isKnown: true,
            };
          }
        }
        // pool 에러
        if (innerParsed.module === 'pool') {
          const message = POOL_ERRORS[innerParsed.code];
          if (message) {
            return {
              message,
              code: `POOL-${innerParsed.code}`,
              isKnown: true,
            };
          }
        }
        // order_info 에러
        if (innerParsed.module === 'order_info') {
          const message = ORDER_INFO_ERRORS[innerParsed.code];
          if (message) {
            return {
              message,
              code: `ORDER_INFO-${innerParsed.code}`,
              isKnown: true,
            };
          }
        }
        // 알 수 없는 Move 에러
        return {
          message: `Transaction failed (${innerParsed.module}:${innerParsed.code})`,
          code: `${innerParsed.module.toUpperCase()}-${innerParsed.code}`,
          isKnown: false,
        };
      }
    }
  }

  // 일반적인 에러 패턴 매칭
  for (const { pattern, message, errorType } of GENERAL_ERRORS) {
    if (pattern.test(errorStr)) {
      return {
        message,
        isKnown: true,
        errorType,
      };
    }
  }

  // 알 수 없는 에러는 원본 메시지 반환 (최대 100자)
  const truncated = errorStr.length > 100 ? errorStr.slice(0, 100) + '...' : errorStr;
  return {
    message: truncated,
    isKnown: false,
  };
}

/**
 * 에러 메시지 포맷팅 (UI 표시용)
 * Gas 에러의 경우 Faucet 안내 메시지 추가 (devnet/testnet)
 */
export function formatErrorMessage(error: unknown): string {
  const parsed = parseError(error);
  let message = parsed.code ? `${parsed.message} [${parsed.code}]` : parsed.message;

  // Gas-related errors: add faucet guidance on devnet/testnet
  // Import dynamically to avoid circular dependency
  if (parsed.errorType === 'GAS_REQUIRED') {
    try {
      // Check network type inline to avoid circular import
      const chainId = import.meta.env.VITE_CHAIN_ID || '6681cdfd';
      const rpcUrl = import.meta.env.VITE_RPC_URL || '';
      const isDevOrTest =
        chainId === '6681cdfd' ||
        rpcUrl.includes('devnet') ||
        rpcUrl.includes('testnet');
      if (isDevOrTest) {
        message += ' Get NASUN from the faucet in your wallet.';
      }
    } catch {
      // Ignore env access errors
    }
  }

  return message;
}
