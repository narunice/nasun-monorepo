// Step Functions 워크플로우용 커스텀 에러 클래스 정의

/**
 * Rate Limit 에러 - Step Functions Retry 정책에서 인식
 * 15분 대기 후 재시도 필요
 */
export class RateLimitError extends Error {
  constructor(message: string, public readonly resetTime?: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * 데이터 유효성 검사 에러 - 재시도하지 않고 즉시 실패
 */
export class DataValidationError extends Error {
  constructor(message: string, public readonly invalidData?: any) {
    super(message);
    this.name = 'DataValidationError';
  }
}

/**
 * Twitter API 일반 에러 - 3회 재시도 후 실패
 */
export class TwitterAPIError extends Error {
  constructor(message: string, public readonly apiResponse?: any) {
    super(message);
    this.name = 'TwitterAPIError';
  }
}

/**
 * 최종 실패 에러 - Dead-Letter 핸들러로 전송
 */
export class TerminalFailureError extends Error {
  constructor(
    message: string, 
    public readonly originalError: Error,
    public readonly retryCount: number
  ) {
    super(message);
    this.name = 'TerminalFailureError';
  }
}

/**
 * Rate Limit 에러인지 확인하는 유틸리티 함수
 */
export function isRateLimitError(error: any): boolean {
  if (error instanceof RateLimitError) return true;
  
  // Twitter API 응답에서 Rate Limit 에러 패턴 감지
  if (error?.message?.includes('Rate limit')) return true;
  if (error?.code === 429) return true;
  if (error?.status === 429) return true;
  if (error?.response?.status === 429) return true;
  
  return false;
}

/**
 * 재시도 가능한 에러인지 확인하는 유틸리티 함수
 */
export function isRetryableError(error: any): boolean {
  // Rate Limit 에러는 특별 처리
  if (isRateLimitError(error)) return true;
  
  // 네트워크 관련 일시적 에러
  if (error?.code === 'ECONNRESET') return true;
  if (error?.code === 'ETIMEDOUT') return true;
  if (error?.message?.includes('timeout')) return true;
  if (error?.message?.includes('network')) return true;
  
  // HTTP 5xx 에러
  if (error?.status >= 500 && error?.status < 600) return true;
  if (error?.response?.status >= 500 && error?.response?.status < 600) return true;
  
  return false;
}

/**
 * Rate Limit 리셋 시간 계산 (기본 15분)
 */
export function calculateRateLimitResetTime(): string {
  const now = new Date();
  const resetTime = new Date(now.getTime() + 15 * 60 * 1000); // 15분 후
  return resetTime.toISOString();
}

/**
 * Step Functions에서 사용할 에러 객체 생성
 */
export function createStepFunctionsError(error: Error): any {
  return {
    Error: error.name,
    Cause: JSON.stringify({
      errorMessage: error.message,
      errorType: error.name,
      stackTrace: error.stack?.split('\n') || []
    })
  };
}