# 데이터 품질 모니터링 대시보드

NASUN 리더보드 시스템의 데이터 품질을 실시간으로 모니터링하고 이상 패턴을 감지하는 대시보드입니다.

## 🎯 주요 기능

### 1. 데이터 품질 메트릭
- **Engagement Type 품질**: 유효한 engagement_type 비율 및 미분류 항목 추적
- **Followers Count 커버리지**: 팔로워 수 수집 완성도 및 분포 분석
- **가중치 계산 정확도**: 커뮤니티별 가중치 적용 정확성 검증
- **데이터 파이프라인 상태**: 처리 지연시간, 오류율, 완성도 모니터링

### 2. 이상 패턴 감지
- **동일 카운트 패턴**: replies와 mentions가 동일한 의심스러운 사용자 감지
- **과도한 engagement**: 비정상적으로 높은 engagement 수 탐지
- **가중치 계산 오류**: 잘못된 가중치 적용 사례 발견
- **데이터 누락**: 필수 데이터 필드 누락 감지

### 3. 실시간 알림 시스템
- **심각도별 분류**: HIGH/MEDIUM/LOW 3단계 경고 수준
- **자동 알림**: 긴급 상황 발생시 즉시 알림
- **CloudWatch 연동**: AWS CloudWatch 메트릭으로 자동 발행

## 🚀 사용 방법

### CLI 명령어

```bash
# 현재 상태 확인
npm run dashboard status

# 특정 날짜 상태 확인
npm run dashboard status 2023-12-01

# 상세 품질 리포트 생성
npm run dashboard report

# 이상 패턴 분석
npm run dashboard anomalies

# 특정 심각도의 이상 패턴만 확인
npm run dashboard anomalies 2023-12-01 HIGH

# 핵심 메트릭 요약
npm run dashboard metrics

# 도움말
npm run dashboard help
```

### 테스트 실행

```bash
# 대시보드 기능 테스트
npm run test:dashboard
```

### Lambda 함수 실행

```bash
# 모니터링 Lambda 직접 실행
npm run monitor
```

## 📊 대시보드 위젯

### 1. Engagement Type 품질 위젯
```
✅ Engagement Type 품질: HEALTHY
├─ 유효 비율: 97.8%
├─ 미분류 수: 12개
└─ 타입별 분포:
   ├─ like: 1,234개
   ├─ reply: 567개
   ├─ repost: 234개
   ├─ quote: 123개
   ├─ mention: 89개
   └─ unknown: 12개
```

### 2. Followers Count 커버리지 위젯
```
✅ Followers Count 커버리지: HEALTHY
├─ 커버리지: 94.5%
├─ 평균 팔로워: 2,345명
└─ 범위별 분포:
   ├─ 0: 45명
   ├─ 1-100: 234명
   ├─ 101-500: 456명
   └─ 1K-5K: 123명
```

### 3. 가중치 계산 정확도 위젯
```
✅ 가중치 계산 정확도: HEALTHY
├─ 계산 정확도: 98.2%
├─ 한국 커뮤니티: 65.4%
├─ 글로벌 커뮤니티: 34.6%
└─ 평균 가중치: 1.85
```

### 4. 이상 패턴 알림 위젯
```
⚠️ 이상 패턴 알림: WARNING
├─ 총 이상 패턴: 3개
├─ 🔴 높음: 0개
├─ 🟡 보통: 2개
├─ 🟢 낮음: 1개
└─ 최근 패턴:
   ├─ User xyz has excessive engagement: 1,500
   └─ Missing followers_count for 5% of users
```

### 5. 데이터 파이프라인 상태 위젯
```
✅ 데이터 파이프라인 상태: HEALTHY
├─ 지연시간: 3 minutes
├─ 오류율: 0.15%
├─ 완성도: 96.8%
└─ 일일 처리량: 15,234건
```

## 🔧 설정

### 환경 변수
```bash
# DynamoDB 테이블 (필수)
CUMULATIVE_TABLE_NAME=nasun-leaderboard-cumulative-v2

# CloudWatch 설정 (선택사항)
AWS_REGION=ap-northeast-2
```

### 임계값 설정
- **Engagement Type 품질**: 95% 이상 양호, 90% 이상 경고
- **Followers Count 커버리지**: 90% 이상 양호, 70% 이상 경고
- **가중치 계산 정확도**: 95% 이상 양호, 90% 이상 경고
- **오류율**: 1% 미만 양호, 5% 미만 경고

## 📈 CloudWatch 메트릭

대시보드는 다음 메트릭을 CloudWatch로 자동 발행합니다:

- `NASUN/DataQuality/ValidEngagementTypeRatio`
- `NASUN/DataQuality/FollowersCountCoverage`
- `NASUN/DataQuality/WeightCalculationAccuracy`
- `NASUN/DataQuality/AnomalyCount`
- `NASUN/DataQuality/DataProcessingLatency`
- `NASUN/DataQuality/ErrorRate`

## 🚨 알림 규칙

### 자동 알림 조건
1. **긴급 (RED)**: HIGH 심각도 이상 패턴 1개 이상 또는 MEDIUM 10개 이상
2. **경고 (YELLOW)**: MEDIUM 심각도 이상 패턴 1개 이상 또는 전체 20개 이상
3. **정상 (GREEN)**: 위 조건에 해당하지 않는 경우

### 실시간 모니터링
- **스케줄 실행**: 매일 자정에 전날 데이터 분석
- **실시간 체크**: 15분마다 긴급 이상 패턴 감지
- **데이터 보존**: 대시보드 데이터 30일, 긴급 알림 7일

## 📋 출력 예시

### 상태 확인 출력
```
🔍 데이터 품질 상태 확인 중...

📅 분석 일자: 2023-12-01
🚨 전체 경고 수준: ✅ GREEN

📊 핵심 품질 지표:
├─ Engagement Type 품질: ✅ 97.8%
├─ Followers Count 커버리지: ✅ 94.5%
├─ 가중치 계산 정확도: ✅ 98.2%
├─ 데이터 완성도: ✅ 96.8%
└─ 오류율: ✅ 0.15%

✅ 이상 패턴이 감지되지 않았습니다.

💡 더 상세한 정보를 보려면 "report" 명령어를 사용하세요.
```

### 이상 패턴 감지 출력
```
🕵️ 이상 패턴 분석 중...

📅 분석 일자: 2023-12-01
📊 감지된 패턴: 3개

🟡 MEDIUM 심각도 (2개):
├─ EXCESSIVE_ENGAGEMENT: User abc123 has excessive engagement count: 1,500
└─ DATA_MISSING: Missing followers_count for 5% of users

🟢 LOW 심각도 (1개):
└─ IDENTICAL_COUNTS: User xyz789 has identical replies (20) and mentions (20) counts
```

## 🛠️ 개발자 정보

### 파일 구조
```
src/
├─ services/
│  └─ data-quality-monitor.ts      # 핵심 모니터링 로직
├─ handlers/
│  └─ monitoring/
│     └─ data-quality-dashboard.ts # Lambda 핸들러
└─ utils/
   └─ dashboard-cli.ts             # CLI 인터페이스

test-dashboard.ts                  # 테스트 스크립트
README-dashboard.md               # 이 문서
```

### 주요 클래스
- `DataQualityMonitor`: 핵심 품질 분석 로직
- `DashboardCLI`: 명령줄 인터페이스
- Lambda 핸들러: API Gateway 및 스케줄 실행 지원

### 확장 방법
1. `DataQualityMonitor`에 새로운 메트릭 추가
2. `detectAnomalies()` 메서드에 새로운 이상 패턴 추가
3. `DashboardCLI`에 새로운 명령어 추가
4. CloudWatch 대시보드 설정으로 시각화 강화