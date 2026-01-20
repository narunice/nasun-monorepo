# NASUN Website 문서

**프로젝트**: NASUN Website (nasun.io)
**최종 업데이트**: 2026-01-12
**버전**: 3.3.0 (Document Consolidation)

---

## 📋 목차

1. [핵심 문서](#핵심-문서)
2. [환경 구성](#환경-구성)
3. [개발 가이드](#개발-가이드)
4. [주요 프로젝트](#주요-프로젝트)
5. [기술 문서](#기술-문서)
6. [문서 작성 가이드](#문서-작성-가이드)

---

## 핵심 문서

### 📖 프로젝트 개요
- **[../CLAUDE.md](../CLAUDE.md)**
  프로젝트 전체 가이드 - 개발, 배포, 트러블슈팅 필수 읽기 자료

### 🚀 최근 완료 프로젝트 (2025-11)

#### **리더보드 동적 구성 (완료)** ✅
백엔드 설정만으로 프론트엔드 리더보드 탭 제어
- **[LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md](./LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md)**
  - API 기반 동적 구성 아키텍처
  - 프론트엔드/백엔드 구현 상세
  - 5/5 자동화 테스트 통과

#### **Top Climbers Spotlight (완료)** ✅
기간별 순위 급상승자 표시 기능
- **[TOP_CLIMBERS_SPOTLIGHT_FEATURE.md](./TOP_CLIMBERS_SPOTLIGHT_FEATURE.md)**
  - 반응형 그리드 레이아웃
  - TimeRangeSelector (Today, 7D, 4W, 3M)
  - UI/UX 개선 사항 (스크롤바, 폰트 등)

#### **지갑 재연결 UX 개선 (완료)** ✅
NFT Event 등록 후 지갑 해제 시 재연결 유도
- **[NFT_EVENT_COMPREHENSIVE_GUIDE.md](./NFT_EVENT_COMPREHENSIVE_GUIDE.md)** (섹션 5 통합됨)
  - WalletDisconnectedCard 컴포넌트
  - 재연결 및 자동 복원 플로우
  - 초기화 옵션 제공

---

## 환경 구성

### Development 환경
**용도**: 로컬 개발 및 Staging 서버
- **AWS 계정**: 135808943968
- **API Gateway**: bb4zdy0rwe
- **Target Account**: @Naru010110
- **Target User ID**: 1863020068785004544
- **Secret**: nasun-twitter-tokens
- **URL**:
  - 로컬: http://localhost:5174
  - Staging: https://staging.nasun.io

### Production 환경
**용도**: 실제 서비스
- **AWS 계정**: 466841130170
- **API Gateway**: bumvhwfbj4
- **Target Account**: @Nasun_io
- **Target User ID**: 1725466995565752320
- **Secret**: nasun-twitter-tokens-prod
- **URL**: https://nasun.io

### 환경 분리 상세
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**
  개발/프로덕션 환경 분리 및 배포 가이드 (통합 문서)

---

## 개발 가이드

### 🛠️ 빌드 & 배포
필수 읽기 자료 - 배포 전 반드시 확인하세요!

- **[BUILD_CONFIGURATION_GUIDE.md](./BUILD_CONFIGURATION_GUIDE.md)** ⭐ **필수**
  스택별 빌드 및 배포 가이드 (AuthStack, CommonStack, CdkStack, NftEventStack)
  - TypeScript vs JavaScript 수정 규칙
  - Lambda 빌드 프로세스
  - 배포 스크립트 사용법
  - 트러블슈팅 가이드

- **[LAMBDA_CREATION_GUIDE.md](./LAMBDA_CREATION_GUIDE.md)**
  새로운 Lambda 함수 생성 및 CDK 통합 가이드
  - Lambda 함수 작성 패턴
  - CDK 스택 통합 방법
  - 환경 변수 설정
  - IAM 권한 관리

- **[API_ENDPOINT_SYNC_GUIDE.md](./API_ENDPOINT_SYNC_GUIDE.md)**
  API Gateway 엔드포인트 자동 동기화 시스템
  - 배포 후 .env 자동 업데이트
  - CloudFormation Outputs 수집
  - Dry-run 모드 지원

---

## 주요 프로젝트

### ✅ 완료된 프로젝트 (2025-10 ~ 11)

#### 1. 리더보드 기능 확장
- **Top Climbers Spotlight**: 순위 급상승자 표시
- **동적 구성**: API 기반 리더보드 탭 제어
- **Pagination**: 데이터 수집 범위 확대 (1000개)

**문서**:
- [TOP_CLIMBERS_SPOTLIGHT_FEATURE.md](./TOP_CLIMBERS_SPOTLIGHT_FEATURE.md)
- [LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md](./LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md)
- [PAGINATION_COMPREHENSIVE_COMPLETION_REPORT.md](./PAGINATION_COMPREHENSIVE_COMPLETION_REPORT.md)

---

#### 2. NFT Event 시스템
**목표**: Wave 1 Battalion NFT 화이트리스트 등록
- ✅ 6단계 등록 플로우
- ✅ MetaMask 연동 및 서명
- ✅ 지갑 재연결 UX 개선 (11/02)

**문서**: [NFT_EVENT_COMPREHENSIVE_GUIDE.md](./NFT_EVENT_COMPREHENSIVE_GUIDE.md)

---

#### 3. OAuth Token Management
**목표**: 개발/프로덕션 환경별 OAuth 토큰 관리
- ✅ AWS 계정 분리
- ✅ X API 프로덕션 앱 생성
- ✅ 토큰 갱신 모니터링 시스템 구축
- ✅ 계정 검증 스크립트 및 일일 점검 통합

**문서**: [../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md](../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md)

---

## 기술 문서

### 📊 리더보드 시스템

#### 기능 구현 보고서
- **[LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md](./LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md)** ⭐ **NEW!**
  리더보드 동적 구성 기능 구현 보고서

- **[TOP_CLIMBERS_SPOTLIGHT_FEATURE.md](./TOP_CLIMBERS_SPOTLIGHT_FEATURE.md)** ⭐ **NEW!**
  Top Climbers Spotlight 기능 명세

- **[LEADERBOARD_DATA_COLLECTION_AND_SCORING_COMPREHENSIVE.md](./LEADERBOARD_DATA_COLLECTION_AND_SCORING_COMPREHENSIVE.md)**
  리더보드 시스템 전체 아키텍처 및 데이터 수집 메커니즘

- **[LEADERBOARD_MECHANISM_GUIDE.md](./LEADERBOARD_MECHANISM_GUIDE.md)**
  리더보드 반영 메커니즘 상세 가이드 (targetDate vs added_at)

- **[LEADERBOARD_SCORING-METRICS_v2.3.md](./LEADERBOARD_SCORING-METRICS_v2.3.md)**
  점수 가중치 및 메트릭 (Option 2 반영)

- **[LEADERBOARD_FEATURE_COMPLETION_HISTORY.md](./LEADERBOARD_FEATURE_COMPLETION_HISTORY.md)**
  Phase 1-5 리더보드 기능 완료 히스토리

#### OAuth Token Management
- **[../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md](../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md)** ⭐ **통합 문서**
  OAuth 2.0 토큰 관리, 계정 검증, 일일 점검 통합 가이드

### 🎨 NFT Event 시스템

- **[NFT_EVENT_COMPREHENSIVE_GUIDE.md](./NFT_EVENT_COMPREHENSIVE_GUIDE.md)** ⭐ **UPDATED (v1.1.0)**
  Wave 1 Battalion NFT Event 종합 가이드
  - 지갑 재연결(Wallet Reconnection) UX 추가
  - 프로젝트 개요 및 기술 아키텍처
  - Phase 1-5 구현 계획 및 완료 히스토리
  - E2E 테스트 및 운영 가이드

---

## 문서 작성 가이드

### 새 문서 작성 시
1. **제목**: 대문자와 언더스코어 사용 (`MY_NEW_DOCUMENT.md`)
2. **헤더**: 프로젝트명, 날짜, 상태 명시
3. **목차**: 3개 이상 섹션인 경우 필수
4. **코드 예제**: 언어 명시 (```typescript, ```bash 등)
5. **완료 상태**: ✅ 표시

### 문서 업데이트
- 하단에 "최종 업데이트" 날짜 명시
- 주요 변경사항은 상단에 별도 섹션으로 추가

### 문서 통합 및 정리 기준 (NEW!)
- **구현 계획서**: 구현 완료 후 삭제 또는 Archive
- **완료 보고서**: 프로젝트 완료 시 통합하여 종합 보고서 작성
- **중복 문서**: 최신 버전만 유지, 나머지는 삭제
- **버그 조사 보고서**: 해결 완료 시 종합 보고서로 통합

---

## 유지된 핵심 문서 (14개)

### 1. 종합 완료 보고서 (3개)
- LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md
- TOP_CLIMBERS_SPOTLIGHT_FEATURE.md
- PAGINATION_COMPREHENSIVE_COMPLETION_REPORT.md

### 2. 개발 가이드 (4개)
- BUILD_CONFIGURATION_GUIDE.md
- LAMBDA_CREATION_GUIDE.md
- API_ENDPOINT_SYNC_GUIDE.md
- DEPLOYMENT_GUIDE.md

### 3. 기술 문서 (6개)
- LEADERBOARD_DATA_COLLECTION_AND_SCORING_COMPREHENSIVE.md
- LEADERBOARD_MECHANISM_GUIDE.md
- LEADERBOARD_FEATURE_COMPLETION_HISTORY.md
- LEADERBOARD_SCORING-METRICS_v2.3.md
- LEADERBOARD_EVENT_ADDITION_GUIDE.md
- TARGET_ACCOUNT_ID_MIGRATION_ANALYSIS.md
- NFT_EVENT_COMPREHENSIVE_GUIDE.md

### 4. OAuth 토큰 관리 (cdk/docs/)
- ../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md (통합 문서)

### 5. 인덱스 (1개)
- README.md

---

## 문서 버전 히스토리

### v3.3.0 (2026-01-12) - 리더보드 문서 통합/정리 ⭐ **최신**
- ✅ **삭제된 문서 (8개)**:
  - `LEADERBOARD_EVENT3_IMPLEMENTATION_PLAN.md` (구현 완료)
  - `LIKES_COLLECTION_BUG_COMPREHENSIVE_REPORT.md` (해결 완료)
  - `QUOTE_TWEET_PASSIVE_COLLECTION_COMPLETION_REPORT.md` (구현 완료)
  - `PASSIVE_ENGAGEMENT_DISCREPANCY_INVESTIGATION.md` (조사 완료)
  - `OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md` (복구 완료)
  - `OAUTH_TOKEN_REPLACEMENT_COMPREHENSIVE_REPORT.md` (마이그레이션 완료)
  - `PIPELINE_EXECUTION_REPORT_20251031.md` (특정 날짜 리포트)
  - `OAUTH_TOKEN_MANAGEMENT_GUIDE.md` (cdk/docs로 통합)
- ✅ **OAuth 문서 통합**: `../cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md`로 통합
- ✅ **환경 정보 업데이트**: Production 타겟 계정 (@Nasun_io), Secret 이름 수정

### v3.2.0 (2025-12-03) - 문서 정리 및 최신화
- ✅ **신규 문서 추가**:
  - `LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md`
  - `TOP_CLIMBERS_SPOTLIGHT_FEATURE.md`
- ✅ **문서 통합 및 삭제**:
  - `NFT_EVENT_WALLET_RECONNECTION_IMPLEMENTATION_REPORT.md` → `NFT_EVENT_COMPREHENSIVE_GUIDE.md`로 통합 후 삭제
  - `ROADMAP_DESIGN_PROPOSAL.md` 삭제 (구현 완료)
  - `STAGING_ENVIRONMENT_SIMPLIFICATION.md` 삭제 (대체됨)
- ✅ **README.md 최신화**: 최근 프로젝트 반영

### v3.1.0 (2025-10-29) - 문서 복원 및 NFT Event 통합
- ✅ 문서 복원 및 NFT Event 관련 문서 통합

### v3.0.0 (2025-10-28) - 대규모 통합 및 정리
- ✅ OAuth, Pagination, 버그 리포트 등 통합

---

**프로젝트 관리자**: development@nasun.io
**기술 지원**: support@nasun.io
