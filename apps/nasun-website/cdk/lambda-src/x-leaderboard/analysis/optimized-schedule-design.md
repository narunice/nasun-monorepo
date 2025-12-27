# 최적화된 X API 스케줄 설계

**작성일**: 2025-01-13  
**목적**: Rate Limit 최적화 및 24시간 분산 스케줄링

---

## 🎯 설계 원칙

### 1. Rate Limit 안전성
- **15분 제한**: 최대 8회 호출 (53% 사용률)
- **일일 제한**: 최대 833회 호출 (50% 사용률)
- **안전 여유**: 47% 버퍼 유지

### 2. 시간 분산
- 24시간에 걸친 균등 배치
- 집중 실행 방지
- 의존성 고려한 순서 배치

### 3. 운영 효율성
- 한국 시간대 고려
- 유지보수 시간 확보
- 모니터링 용이성

---

## 📅 최적화된 스케줄 설계

### 🌅 새벽 시간대 (00:00-06:00 UTC / 09:00-15:00 KST)

#### 00:00 UTC (09:00 KST) - V1 데이터 수집
```
Function: nasun-dailydatacollection
Description: V1 Legacy system daily collection
API Calls: ~46 requests
Duration: ~30 minutes
15min Usage: 3-4 requests/15min (26%)
```

#### 02:00 UTC (11:00 KST) - V2 누적 데이터 수집  
```
Function: nasun-cumulative-data-collector-v2
Description: V2 Cumulative data collection
API Calls: ~50 requests
Duration: ~45 minutes
15min Usage: 3-4 requests/15min (26%)
```

### 🌞 오전 시간대 (06:00-12:00 UTC / 15:00-21:00 KST)

#### 06:00 UTC (15:00 KST) - 리트윗 보너스 배치 1-4
```
06:00: Batch 1 (8 retweets) - 8 API calls
06:15: Batch 2 (8 retweets) - 8 API calls  
06:30: Batch 3 (8 retweets) - 8 API calls
06:45: Batch 4 (8 retweets) - 8 API calls
Total: 32 requests in 1 hour
```

#### 07:00 UTC (16:00 KST) - 리트윗 보너스 배치 5-8
```
07:00: Batch 5 (8 retweets) - 8 API calls
07:15: Batch 6 (8 retweets) - 8 API calls
07:30: Batch 7 (8 retweets) - 8 API calls  
07:45: Batch 8 (8 retweets) - 8 API calls
Total: 32 requests in 1 hour
```

#### 08:00 UTC (17:00 KST) - 리트윗 보너스 배치 9-12
```
08:00: Batch 9 (8 retweets) - 8 API calls
08:15: Batch 10 (8 retweets) - 8 API calls
08:30: Batch 11 (8 retweets) - 8 API calls
08:45: Batch 12 (8 retweets) - 8 API calls  
Total: 32 requests in 1 hour
```

#### 09:00 UTC (18:00 KST) - 리트윗 보너스 마지막 배치
```
09:00: Batch 13 (4 retweets) - 4 API calls
09:15: Buffer time (monitoring/cleanup)
Total: 4 requests + cleanup
```

### 🌆 저녁/밤 시간대 (12:00-24:00 UTC / 21:00-09:00 KST)

#### 12:00-18:00 UTC (21:00-03:00 KST) - 예비 시간
```
Description: 장애 복구, 수동 처리, 추가 수집용 예비 시간
Usage: 필요시에만 사용
API Reserve: 50 requests 예약
```

#### 18:00-24:00 UTC (03:00-09:00 KST) - 시스템 유지보수
```
Description: 시스템 점검, 로그 분석, 성능 모니터링
Usage: API 호출 최소화
API Reserve: 20 requests (긴급시)
```

---

## 📊 최적화된 스케줄 요약

### ⏰ 시간별 API 호출 분포
```
00:00-01:00 UTC: 46 requests (V1)
01:00-02:00 UTC: 0 requests (대기)
02:00-03:00 UTC: 50 requests (V2)  
03:00-06:00 UTC: 0 requests (대기)
06:00-07:00 UTC: 32 requests (리트윗 1-4)
07:00-08:00 UTC: 32 requests (리트윗 5-8)
08:00-09:00 UTC: 32 requests (리트윗 9-12)
09:00-10:00 UTC: 4 requests (리트윗 13)
10:00-24:00 UTC: 1 requests (예비/유지보수)
```

### 📈 15분 단위 최대 호출량
```
Peak Usage: 8 requests/15min (리트윗 배치)
Percentage: 53% (8/15)
Safety Buffer: 47%
Risk Level: LOW ✅
```

### 📉 일일 총 호출량
```
V1 System: 46 requests
V2 System: 50 requests  
Retweet Bonus: 100 requests (13 batches × 8 - 4)
Reserve/Maintenance: 21 requests
Total: 217 requests/day
Percentage: 13.0% (217/1,667)
Safety Buffer: 87%
```

---

## 🛡️ 안전 장치 및 복구 메커니즘

### 1. Rate Limit 방어
```typescript
// 배치별 Rate Limit 체크
const BATCH_SIZE = 8;
const BATCH_INTERVAL = 15 * 60 * 1000; // 15분
const MAX_RETRIES = 3;

async function processBatchWithRateLimit(tweets: Tweet[]) {
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      await processBatch(tweets.slice(0, BATCH_SIZE));
      break;
    } catch (error) {
      if (isRateLimitError(error)) {
        await sleep(BATCH_INTERVAL);
        retryCount++;
      } else {
        throw error;
      }
    }
  }
}
```

### 2. 적응형 백오프
```typescript
// 지수 백오프 전략
const backoffDelays = [15, 30, 60, 120]; // 분 단위

async function adaptiveBackoff(attempt: number) {
  const delay = Math.min(
    backoffDelays[attempt] || 120, 
    120 // 최대 2시간
  ) * 60 * 1000;
  
  await sleep(delay);
}
```

### 3. 장애 복구 메커니즘
```typescript  
// 실패한 배치 재처리
interface FailedBatch {
  batchNumber: number;
  tweets: Tweet[];
  failureTime: Date;
  retryCount: number;
}

// 다음 예비 시간에 재처리
const recoverySchedule = "12:00 UTC"; // 예비 시간 활용
```

---

## 🔄 의존성 관리

### 시스템 간 의존성
```
V1 System (00:00) → 독립 실행 ✅
V2 System (02:00) → V1 완료 대기 ✅  
Retweet Bonus (06:00) → 독립 실행 ✅
```

### 데이터 정합성
```
각 시스템은 독립된 데이터 소스 사용
크로스 체크는 일일 보고서에서 수행
실시간 정합성 체크 불필요
```

---

## 📋 구현 체크리스트

### Phase 3.2 준비사항
- [ ] EventBridge 스케줄 규칙 13개 생성
- [ ] Lambda 배치 처리 로직 구현
- [ ] Rate Limit 모니터링 추가
- [ ] 백오프 메커니즘 구현
- [ ] 장애 복구 시나리오 테스트

### 예상 구현 시간
- **스케줄 재설정**: 2시간
- **배치 로직 구현**: 4시간  
- **모니터링 추가**: 2시간
- **테스트 및 검증**: 4시간
- **총 예상 시간**: 12시간

---

## 🎯 성공 지표

### Rate Limit 안전성
- ✅ 15분 사용률 < 60%
- ✅ 일일 사용률 < 20%
- ✅ Rate Limit Hit 횟수 < 월 1회

### 시스템 안정성
- ✅ 99.5% 이상 성공률
- ✅ 평균 장애 복구 시간 < 30분
- ✅ 데이터 수집 완료율 > 95%

### 운영 효율성
- ✅ 수동 개입 횟수 < 주 1회
- ✅ 알림 수 < 일 2회
- ✅ 모니터링 정확도 > 99%

---

**설계 완료일**: 2025-01-13  
**승인 대기 중**: NASUN 개발팀  
**구현 예정일**: Phase 3.2