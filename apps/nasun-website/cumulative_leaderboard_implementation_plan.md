# 누적 점수 리더보드 구현 계획서 (Version 2.0)

## 🎯 구현 전략: 병렬 개발 (Zero Risk)

### 핵심 원칙
- **기존 시스템 (v1) 완전 보존**: 아무것도 건드리지 않음
- **새 시스템 (v2) 별도 구현**: 완전히 독립적인 구조  
- **점진적 전환**: 충분한 테스트 후 단계별 전환
- **롤백 가능**: 문제 발생 시 즉시 v1으로 복구

---

## 🏗️ 시스템 아키텍처 설계

### 📊 데이터 레이어

#### 새 DynamoDB 테이블 추가
```
기존: nasun-leaderboard-engagement (v1용, 그대로 유지)
신규: nasun-leaderboard-cumulative (v2용, 새로 생성)
```

#### v2 테이블 스키마
```typescript
// 1. 누적 점수 레코드
{
  pk: "USER#{user_id}",
  sk: "CUMULATIVE_SCORE",  
  user_id: string,
  username: string,
  total_score: number,           // 누적 총점
  total_likes: number,           // 누적 좋아요
  total_replies: number,         // 누적 답글
  total_reposts: number,         // 누적 리포스트
  total_quotes: number,          // 누적 인용
  first_activity: string,        // 최초 활동일
  last_updated: string,          // 마지막 업데이트
  version: "v2"                  // 버전 식별
}

// 2. 리더보드 엔트리 (v2)
{
  pk: "LEADERBOARD_V2",
  sk: "RANK#{rank:04d}#{timestamp}",
  rank: number,
  user_id: string,
  username: string,
  total_score: number,
  last_updated: string,
  version: "v2"
}

// 3. 최근 활동 추적 (감점 계산용)
{
  pk: "USER#{user_id}",
  sk: "RECENT_ACTIVITY#{tweet_id}#{engagement_type}",
  tweet_id: string,
  engagement_type: string,
  added_at: string,
  tweet_created_at: string,
  ttl: number  // 7일 후 자동 삭제
}
```

### 🔧 Lambda Functions (v2)

```
기존 함수들 (그대로 유지):
- nasun-get-leaderboard (v1)
- nasun-updateleaderboard (v1)
- nasun-aggregate-scores-v2 (v1)

새 함수들:
- nasun-cumulative-aggregate (v2 점수 계산)
- nasun-cumulative-leaderboard-update (v2 리더보드)
- nasun-get-cumulative-leaderboard (v2 API)
```

---

## 🚀 구현 단계별 계획

### Phase 1: 인프라 준비 (1주)

#### 1.1 CDK 인프라 확장
```typescript
// cdk/lib/cdk-stack.ts 에 추가
const cumulativeTable = new dynamodb.Table(this, "CumulativeLeaderboardTable", {
  tableName: "nasun-leaderboard-cumulative",
  partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
  // TTL 설정으로 최근 활동만 7일간 유지
  timeToLiveAttribute: "ttl",
  // 기타 설정...
});
```

#### 1.2 새 Lambda 함수 생성
```bash
cdk/lambda-src/
├── x-leaderboard-v1/     # 기존 (이름 변경)
└── x-leaderboard-v2/     # 신규 (누적 시스템)
    ├── src/
    │   ├── handlers/
    │   │   ├── batch/
    │   │   │   ├── cumulative-aggregate.ts
    │   │   │   └── cumulative-leaderboard.ts  
    │   │   └── api/
    │   │       └── get-cumulative-leaderboard.ts
    │   ├── services/
    │   └── types/
    └── package.json
```

### Phase 2: 데이터 마이그레이션 도구 개발 (1주)

#### 2.1 히스토리 데이터 복원
현재 v1 시스템은 최근 6일만 유지하므로, 과거 데이터가 손실됨.
**해결 방안**: 

```typescript
// 마이그레이션 전략
const MIGRATION_STRATEGIES = {
  // Option 1: 현재 시점부터 새로 시작
  FRESH_START: {
    description: "10월 1일부터 새로운 누적 시작",
    pros: ["간단한 구현", "깨끗한 시작"],
    cons: ["기존 활동 히스토리 손실"]
  },
  
  // Option 2: 과거 데이터 재수집 (권장)
  HISTORICAL_REBUILD: {
    description: "9월 초부터 트위터 API로 역추적 수집", 
    pros: ["완전한 히스토리 보존", "공정한 경쟁"],
    cons: ["API 사용량 증가", "복잡한 구현"]
  }
};
```

#### 2.2 데이터 검증 도구
```typescript
// 검증 프로세스
function validateMigration() {
  // v1과 v2 최근 6일 점수 비교
  // 사용자별 점수 차이 분석  
  // 데이터 정합성 검증
}
```

### Phase 3: v2 핵심 로직 구현 (2주)

#### 3.1 누적 점수 계산 엔진
```typescript
// cumulative-aggregate.ts
export class CumulativeScoreEngine {
  
  async processEngagementChanges(
    currentEngagements: Engagement[],
    previousEngagements: Engagement[]
  ) {
    const delta = this.calculateDelta(currentEngagements, previousEngagements);
    
    for (const userDelta of delta) {
      await this.updateCumulativeScore(userDelta);
    }
  }
  
  private calculateDelta(current, previous): UserDelta[] {
    // 새 활동: 항상 점수 증가
    // 제거된 활동: 최근 6일 내에서만 점수 감소
    // 7일 이상 지난 활동 제거: 점수 변화 없음
  }
  
  private async updateCumulativeScore(userDelta: UserDelta) {
    // 누적 점수 테이블 업데이트
    // 최근 활동 추적 테이블 업데이트 (TTL 7일)
  }
}
```

#### 3.2 리더보드 생성 로직
```typescript
// cumulative-leaderboard.ts
export class CumulativeLeaderboardGenerator {
  
  async updateLeaderboard() {
    const allUsers = await this.getAllCumulativeScores();
    const rankedUsers = this.sortByScore(allUsers);
    
    await this.saveLeaderboardEntries(rankedUsers);
    await this.updateMetadata(rankedUsers.length);
  }
}
```

### Phase 4: API 레이어 구현 (1주)

#### 4.1 새 API 엔드포인트
```typescript
// API 경로 분리
기존: GET /api/v1/leaderboard       (v1 유지)
신규: GET /api/v2/leaderboard       (v2 누적 점수)
```

#### 4.2 API 응답 형식
```typescript
// v2 API 응답
interface CumulativeLeaderboardResponse {
  success: boolean;
  version: "v2";
  data: {
    entries: Array<{
      rank: number;
      userId: string;
      username: string;
      displayName: string;
      profileImageUrl: string;
      totalScore: number;          // 누적 총점
      totalActivities: number;     // 총 활동 수
      firstActivity: string;       // 최초 활동일
      lastActivity: string;        // 최근 활동일
      // 상세 분석 정보
      breakdown: {
        totalLikes: number;
        totalReplies: number; 
        totalReposts: number;
        totalQuotes: number;
      };
      xUrl: string;
    }>;
    pagination: {
      page: number;
      limit: number; 
      total: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    metadata: {
      totalUsers: number;
      systemVersion: "v2";
      dataStartDate: string;       // 누적 시작일
      lastUpdated: string;
      description: "누적 점수 리더보드";
    };
  };
}
```

### Phase 5: 프론트엔드 확장 (1주)

#### 5.1 새 페이지 구조
```
기존 페이지 (그대로 유지):
/leaderboard                  # v1 (기존)

새 페이지:
/leaderboard/cumulative       # v2 (누적 점수)
/leaderboard/compare          # v1 vs v2 비교 페이지
```

#### 5.2 React 컴포넌트 설계
```typescript
// 새 컴포넌트
src/components/app/CumulativeLeaderboard/
├── CumulativeLeaderboard.tsx         // 메인 컨테이너
├── components/
│   ├── CumulativeTable.tsx          // v2 전용 테이블
│   ├── UserProgressChart.tsx        // 사용자별 누적 차트
│   ├── SystemVersionToggle.tsx      // v1/v2 전환 토글
│   └── MigrationNotice.tsx          // 마이그레이션 안내
├── hooks/
│   ├── useCumulativeData.ts         // v2 API 호출
│   └── useVersionComparison.ts      // v1/v2 비교
└── types/
    └── cumulative.ts                // v2 전용 타입
```

### Phase 6: 테스팅 & 검증 (1주)

#### 6.1 자동화 테스트
```typescript
// 테스트 시나리오
describe("Cumulative Leaderboard v2", () => {
  test("새 활동 시 누적 점수 증가", async () => {
    // 시나리오: 사용자 A가 좋아요 추가
    // 기대: 누적 점수 +1
  });
  
  test("최근 6일 내 활동 취소 시 점수 감소", async () => {
    // 시나리오: 3일 전 좋아요 취소
    // 기대: 누적 점수 -1
  });
  
  test("7일 이상 지난 활동 취소 시 점수 불변", async () => {
    // 시나리오: 10일 전 좋아요 취소 
    // 기대: 누적 점수 변화 없음
  });
});
```

#### 6.2 성능 테스트
- 대량 사용자 시뮬레이션
- API 응답 시간 측정
- DynamoDB 읽기/쓰기 용량 최적화

### Phase 7: 점진적 배포 (2주)

#### 7.1 Beta 테스트 (1주)
```typescript
// Feature Flag를 통한 점진적 공개
const featureFlags = {
  CUMULATIVE_LEADERBOARD_V2: {
    enabled: true,
    allowedUsers: ["admin", "beta_testers"],  // 초기에는 제한된 사용자만
    percentage: 10  // 10% 사용자에게만 노출
  }
};
```

#### 7.2 전체 공개 (1주)
```typescript
// 단계적 전환
Week 1: v2 Beta (제한된 사용자)
Week 2: v2 Public (모든 사용자, v1 병행 제공)  
Week 3: v2 Default (기본값을 v2로, v1은 여전히 접근 가능)
Week 4+: v2 Only (v1 deprecated, 하지만 데이터는 보존)
```

---

## 🔒 안전 장치 & 롤백 계획

### 안전 장치
1. **독립적 인프라**: v1과 완전히 분리된 AWS 리소스
2. **Feature Flag**: 실시간 on/off 가능 
3. **모니터링**: v2 전용 CloudWatch 대시보드
4. **알림**: 오류 발생 시 즉시 Slack/이메일 알림

### 롤백 계획
```typescript
// 3단계 롤백 시나리오
LEVEL_1: Feature Flag OFF          // 1분 내 복구
LEVEL_2: API Gateway 라우팅 변경   // 5분 내 복구  
LEVEL_3: DNS 수준 트래픽 차단      // 10분 내 복구
```

---

## 📊 성공 지표 (KPI)

### 기술적 지표
- API 응답 시간: < 500ms (v1과 동일 수준)
- 에러율: < 0.1%
- 데이터 정합성: 99.99%

### 사용자 경험 지표  
- 페이지 로딩 시간: < 2초
- 사용자 만족도: v1 대비 개선
- 기능 사용률: Beta 테스터 80% 이상 활성 사용

---

## 💰 비용 추정

### AWS 리소스 비용 (월간)
```
DynamoDB (새 테이블): ~$20
Lambda 실행: ~$15  
API Gateway: ~$10
CloudWatch 모니터링: ~$5
총 예상 비용: ~$50/월 (기존 대비 +50%)
```

### 개발 시간 투입
- 백엔드 개발: 3주
- 프론트엔드 개발: 1주
- 테스팅 & 배포: 2주
- **총 소요 시간: 6주**

---

## ✅ 마일스톤 체크리스트

### Week 1-2: 인프라 & 마이그레이션
- [ ] v2 DynamoDB 테이블 생성
- [ ] Lambda 함수 스켈레톤 구현
- [ ] 과거 데이터 수집 스크립트 작성
- [ ] CDK 배포 스크립트 완성

### Week 3-4: 핵심 로직 구현  
- [ ] 누적 점수 계산 엔진 완성
- [ ] 리더보드 생성 로직 완성
- [ ] v2 API 엔드포인트 구현
- [ ] 단위 테스트 작성

### Week 5: 프론트엔드 구현
- [ ] 누적 리더보드 페이지 구현
- [ ] v1/v2 비교 페이지 구현  
- [ ] 사용자 인터페이스 완성
- [ ] 반응형 디자인 적용

### Week 6: 테스팅 & 배포
- [ ] 통합 테스트 완료
- [ ] 성능 테스트 완료
- [ ] Beta 배포 완료
- [ ] 모니터링 시스템 설정

---

## 🎯 결론

이 **병렬 구현 전략**을 통해:

✅ **Zero Risk**: 기존 시스템에 전혀 영향 없음
✅ **점진적 전환**: 충분한 테스트 후 안전한 이주  
✅ **롤백 가능**: 언제든 v1으로 복구 가능
✅ **사용자 선택권**: v1과 v2를 동시에 제공

**이 계획이 어떠신가요? 수정하고 싶은 부분이 있으면 말씀해 주세요!**