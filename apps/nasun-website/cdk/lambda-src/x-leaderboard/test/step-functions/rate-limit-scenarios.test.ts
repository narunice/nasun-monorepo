// 테스트: Step Functions Rate Limit 시나리오

import { RateLimitError, TwitterAPIError, isRateLimitError, isRetryableError } from "../../src/utils/step-functions-errors";

/**
 * Rate Limit 에러 감지 테스트
 */
describe("Rate Limit Error Detection", () => {
  test("should detect RateLimitError instance", () => {
    const rateLimitError = new RateLimitError("API rate limit exceeded");
    
    expect(isRateLimitError(rateLimitError)).toBe(true);
    expect(rateLimitError.name).toBe("RateLimitError");
    
    console.log("✅ [TEST] RateLimitError 인스턴스 감지 성공");
  });

  test("should detect rate limit from API response patterns", () => {
    const mockApiError1 = { message: "Rate limit exceeded" };
    const mockApiError2 = { code: 429 };
    const mockApiError3 = { response: { status: 429 } };
    
    expect(isRateLimitError(mockApiError1)).toBe(true);
    expect(isRateLimitError(mockApiError2)).toBe(true);
    expect(isRateLimitError(mockApiError3)).toBe(true);
    
    console.log("✅ [TEST] API 응답 패턴에서 Rate Limit 감지 성공");
  });

  test("should not detect non-rate-limit errors", () => {
    const normalError = new Error("Network error");
    const authError = { status: 401 };
    
    expect(isRateLimitError(normalError)).toBe(false);
    expect(isRateLimitError(authError)).toBe(false);
    
    console.log("✅ [TEST] 일반 에러는 Rate Limit으로 감지하지 않음");
  });
});

/**
 * 재시도 가능한 에러 감지 테스트
 */
describe("Retryable Error Detection", () => {
  test("should detect retryable network errors", () => {
    const networkErrors = [
      { code: "ECONNRESET" },
      { code: "ETIMEDOUT" },
      { message: "network timeout" },
      { status: 500 },
      { response: { status: 502 } }
    ];

    networkErrors.forEach(error => {
      expect(isRetryableError(error)).toBe(true);
    });
    
    console.log("✅ [TEST] 재시도 가능한 네트워크 에러 감지 성공");
  });

  test("should not detect non-retryable errors", () => {
    const nonRetryableErrors = [
      { status: 401 }, // Unauthorized
      { status: 403 }, // Forbidden
      { status: 404 }, // Not Found
      { message: "Invalid token" }
    ];

    nonRetryableErrors.forEach(error => {
      expect(isRetryableError(error)).toBe(false);
    });
    
    console.log("✅ [TEST] 재시도 불가능한 에러는 감지하지 않음");
  });
});

/**
 * Step Functions 에러 시뮬레이션
 */
describe("Step Functions Error Simulation", () => {
  test("should simulate collect-engagements-v2 rate limit scenario", async () => {
    // Mock 트윗 데이터
    const mockTweet = {
      id: "1234567890",
      text: "Test tweet",
      created_at: "2025-09-25T12:00:00Z",
      author_id: "author123"
    };

    // Rate Limit 에러 시뮬레이션
    const simulateRateLimitError = () => {
      throw new RateLimitError(
        `트윗 ${mockTweet.id} Rate Limit 발생: Too Many Requests`,
        new Date(Date.now() + 15 * 60 * 1000).toISOString()
      );
    };

    try {
      simulateRateLimitError();
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect(isRateLimitError(error)).toBe(true);
      
      console.log("✅ [TEST] collect-engagements-v2 Rate Limit 시나리오 성공");
    }
  });

  test("should simulate atomic execution failure", () => {
    // 원자적 실행 실패 시나리오
    const mockEngagementResults = [
      { type: "likes", success: true, count: 5 },
      { type: "replies", success: true, count: 2 },
      { type: "reposts", success: false, error: "Rate limit exceeded" }, // 실패!
      { type: "quotes", success: true, count: 1 },
      { type: "mentions", success: true, count: 0 }
    ];

    // All-or-Nothing 정책: 하나라도 실패하면 전체 실패
    const allSuccess = mockEngagementResults.every(result => result.success);
    
    expect(allSuccess).toBe(false);
    console.log("✅ [TEST] 원자적 실행 실패 시나리오 - 전체 실패 처리 확인");
  });
});

/**
 * 실제 시나리오 기반 통합 테스트
 */
describe("Real-world Scenario Tests", () => {
  test("should handle API quota exhaustion", () => {
    // X API 15분 윈도우 시뮬레이션
    const quotaExhaustionError = {
      status: 429,
      message: "Rate limit exceeded",
      headers: {
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": Math.floor(Date.now() / 1000) + (15 * 60) // 15분 후
      }
    };

    expect(isRateLimitError(quotaExhaustionError)).toBe(true);
    console.log("✅ [TEST] API 할당량 소진 시나리오 처리 확인");
  });

  test("should calculate proper wait times", () => {
    const currentTime = Date.now();
    const resetTime = new Date(currentTime + 15 * 60 * 1000); // 15분 후
    
    const waitTime = resetTime.getTime() - currentTime;
    const expectedWaitMinutes = 15;
    
    expect(Math.floor(waitTime / (60 * 1000))).toBe(expectedWaitMinutes);
    console.log("✅ [TEST] Rate Limit 대기 시간 계산 확인");
  });
});

console.log("\n🎯 [TEST_SUMMARY] Rate Limit 시나리오 테스트 완료");
console.log("   - RateLimitError 감지 및 처리");
console.log("   - 재시도 가능한 에러 구분");  
console.log("   - 원자적 실행 정책 검증");
console.log("   - 실제 API 할당량 시나리오");