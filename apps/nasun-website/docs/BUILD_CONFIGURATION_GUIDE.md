# 빌드/배포 설정 가이드

> **작성일**: 2025-10-05
> **최종 업데이트**: 2026-01-14 ✅ **환경별 시크릿 분리 및 CORS 설정 개선**
> **목적**: 프로젝트의 모든 빌드 및 배포 설정 파일 관리 + 배포 실패 방지

---

## 📋 목차

1. [🏗️ 스택 구조 (2025-10-21 Phase 3 완료)](#️-스택-구조-2025-10-21-phase-3-완료)
2. [🚨 중요: 디버깅 시 절대 규칙](#-중요-디버깅-시-절대-규칙)
3. [🚀 완전한 배포 워크플로우 (2025-10-21 최종 검증)](#-완전한-배포-워크플로우-2025-10-21-최종-검증)
4. [⚠️ 치명적 배포 문제 및 해결책](#️-치명적-배포-문제-및-해결책)
5. [🔍 배포 후 최종 검증 (필수!)](#-배포-후-최종-검증-필수)
6. [📦 Lambda 패키징 구조 가이드](#-lambda-패키징-구조-가이드)
7. [🛠️ 긴급 수동 배포 가이드](#️-긴급-수동-배포-가이드)
8. [🕐 TTL 설정 및 트러블슈팅](#-ttl-time-to-live-설정-및-트러블슈팅)

---

## 🏗️ 스택 구조 (2025-10-21 Phase 3 완료)

### 📊 전체 아키텍처

**2025-10-25 기준: 5개 스택 완전 분리 완료 ✅**
- **AuthStack**: 트위터 OAuth 인증 전담 (독립 배포 가능)
- **CommonStack**: 공통 인프라 전담 - NFT, User, Price API (독립 배포 가능) ✅
- **CdkStack**: Leaderboard 시스템 전담 (독립 배포 가능) ✅
- **NftEventStack**: NFT 이벤트 전담 - 화이트리스트, 검증 (독립 배포 가능) ✅ **NEW!**
- **MonitoringStack**: 통합 모니터링 (CommonStack + CdkStack 참조)

```
AuthStack (독립)
├── Lambda: 2개 (login, callback)
└── API Gateway: 1개

CommonStack (독립) ✅ **Phase 3 완료**
├── Lambda: 13개
│   ├── NFT/Supply: 4개
│   ├── User Profile: 3개
│   ├── Price API: 3개
│   ├── AWS Credentials: 1개
│   └── Account Mgmt: 2개
├── API Gateway: 9개
└── EventBridge: 1개

CdkStack (Leaderboard 전용) ✅ **Phase 3 정리 완료**
├── Lambda: 17개 (공통 인프라 11개 제거됨)
├── DynamoDB: 1개
├── Step Functions: 1개
└── EventBridge: 2개

NftEventStack (NFT Event 전용) ✅ **2025-10-25 추가**
├── Lambda: 2개
│   ├── verify-eligibility: X 태스크 검증 (TypeScript)
│   └── register-user: 화이트리스트 등록
├── DynamoDB: 2개
│   ├── nasun-nft-whitelist: 화이트리스트 관리
│   └── nasun-nft-event-tasks: 태스크 추적
└── API Gateway: 1개

MonitoringStack (통합 모니터링)
├── CommonStack 참조
├── CdkStack 참조
└── CloudWatch 대시보드 + Alarms
```

### 🎯 Phase 3 완료 후 핵심 이점

1.  **✅ 완전한 독립 배포**:
    - Leaderboard 수정 시 `pnpm cdk deploy CdkStack` → CommonStack 영향 없음
    - NFT/User/Price 수정 시 `pnpm cdk deploy CommonStack` → CdkStack 영향 없음

2.  **✅ 리소스 중복 제거**:
    - CdkStack의 구 Lambda 11개 완전 삭제
    - 비용 절감 및 관리 용이성 향상

3.  **✅ 명확한 관심사 분리**:
    - CommonStack: 공통 인프라 (재사용 가능)
    - CdkStack: Leaderboard 전용 (도메인 특화)

4.  **✅ 배포 실패 문제 해결**:
    - "백엔드 코드 변경 시 수정하지 않은 부분까지 빌드/배포" 문제 완전 해결!

### 📦 스택별 배포 명령어 (2025-10-29 환경 분리 업데이트)

> ⚠️ **중요**: 스택별 개별 배포 시에도 환경을 구분해야 합니다. 개발/프로덕션 환경이 완전히 분리되어 있습니다.

#### 0. 전체 스택 배포 (권장 방법) ⭐

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 개발 환경 (모든 Lambda 빌드 + 검증 + CdkStack 배포)
pnpm deploy:dev

# 프로덕션 환경 (모든 Lambda 빌드 + 검증 + CdkStack 배포)
pnpm deploy:prod
```

#### 1. AuthStack (트위터 로그인 관련 변경 시)

> **Secrets Manager 시크릿이 환경에 따라 `nasun-twitter-tokens` (Dev)와 `nasun-twitter-tokens-prod` (Prod)로 자동 분기됩니다.**

**개발 환경 배포:**
```bash
# 1. .env 확인/설정
cd cdk
cp .env.development .env

# 2. auth-twitter 빌드 (필수!)
cd lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../../

# 3. AuthStack 배포 (NODE_ENV 명시)
NODE_ENV=development pnpm cdk deploy AuthStack --require-approval never
```

**프로덕션 환경 배포:**
```bash
# 1. .env 확인/설정
cd cdk
cp .env.production .env

# 2. auth-twitter 빌드
cd lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../../

# 3. AuthStack 배포 (Profile 지정 + NODE_ENV 명시)
NODE_ENV=production pnpm cdk deploy AuthStack --profile nasun-prod --require-approval never
```

#### 2. CommonStack (공통 인프라 변경 시)

**개발 환경 배포:**
```bash
cd cdk
cp .env.development .env
pnpm cdk deploy CommonStack --require-approval never
```

**프로덕션 환경 배포:**
```bash
cd cdk
cp .env.production .env
pnpm cdk deploy CommonStack --profile nasun-prod --require-approval never
```

#### 3. CdkStack (리더보드 관련 변경 시)

**개발 환경 배포 (권장):**
```bash
# pnpm deploy:dev 사용 (자동 빌드 + 검증 + 배포)
pnpm deploy:dev
```

**프로덕션 환경 배포 (권장):**
```bash
# pnpm deploy:prod 사용 (자동 빌드 + 검증 + 배포)
pnpm deploy:prod
```

**수동 배포 (고급):**
```bash
# 개발 환경
cd cdk
cp .env.development .env
cd lambda-src/x-leaderboard
pnpm build
cd ../../
pnpm cdk deploy CdkStack --require-approval never

# 프로덕션 환경
cd cdk
cp .env.production .env
cd lambda-src/x-leaderboard
pnpm build
cd ../../
pnpm cdk deploy CdkStack --profile nasun-prod --require-approval never
```

#### 4. NftEventStack (NFT 이벤트 관련 변경 시)

> **로컬 개발 편의를 위해 `localhost` CORS가 모든 환경에서 허용되도록 설정되었습니다.**

**개발 환경 배포:**
```bash
# 1. .env 확인/설정
cd cdk
cp .env.development .env

# 2. verify-eligibility Lambda 빌드 (필수!)
cd lambda-src/nft-event/verify-eligibility
npm run rebuild  # 또는 npm run clean && npm run build
cd ../../../

# 3. NftEventStack 배포
NODE_ENV=development pnpm cdk deploy NftEventStack --require-approval never
```

**프로덕션 환경 배포:**
```bash
cd cdk
cp .env.production .env
cd lambda-src/nft-event/verify-eligibility
npm run rebuild
cd ../../../
NODE_ENV=production pnpm cdk deploy NftEventStack --profile nasun-prod --require-approval never
```

**⚠️ 중요**: `verify-eligibility` Lambda는 **TypeScript로 작성**되어 있으므로, 소스 수정 후 **반드시 `npm run rebuild`** 를 실행해야 합니다.

#### 5. MonitoringStack (모니터링 대시보드 변경 시)

**개발 환경 배포:**
```bash
cd cdk
cp .env.development .env
pnpm cdk deploy MonitoringStack --require-approval never
```

**프로덕션 환경 배포:**
```bash
cd cdk
cp .env.production .env
pnpm cdk deploy MonitoringStack --profile nasun-prod --require-approval never
```

#### 6. 전체 스택 일괄 배포 (특별한 경우에만)

**개발 환경:**
```bash
cd cdk
cp .env.development .env
pnpm cdk deploy --all --require-approval never
```

**프로덕션 환경:**
```bash
cd cdk
cp .env.production .env
pnpm cdk deploy --all --profile nasun-prod --require-approval never
```

**⚠️ 주의**: 일괄 배포는 시간이 오래 걸리고 불필요한 스택까지 배포될 수 있으므로, **스택별 개별 배포**를 권장합니다.

### 🔄 스택 의존성

- `AuthStack` → 독립
- `CommonStack` → 독립
- `CdkStack` → 독립
- `NftEventStack` → 독립 ✅ **NEW!**
- `MonitoringStack` → `CommonStack` 및 `CdkStack` 참조

### 📝 스택별 주요 리소스 요약

| 스택 | Lambda 수 | API Gateway | DynamoDB | EventBridge | 용도 |
|---|---|---|---|---|---|
| **AuthStack** | 2개 | 1개 | 참조 1개 | - | 트위터 OAuth |
| **CommonStack** | 13개 | 9개 | 참조 5개 | 1개 | 공통 인프라 (NFT, User, Price) |
| **CdkStack** | 17개 | 1개 | 생성 1개 | 2개 | 리더보드 시스템 |
| **NftEventStack** | 2개 | 1개 | 생성 2개 | - | NFT 이벤트 (화이트리스트, 검증) ✅ **NEW!** |
| **MonitoringStack** | - | - | - | - | 통합 모니터링 |
| **합계** | **34개** | **12개** | **8개** | **3개** | - |

---

## 🚨 중요: 디버깅 시 절대 규칙

### ❌ 절대 금지: 빌드 결과물 수정

```typescript
// ❌ 잘못된 디버깅 - 변경사항이 다음 빌드에서 소실됨!
lambda-src/x-leaderboard/dist/api/get-leaderboard-snapshot.js  // 수정 금지!
lambda-src/x-leaderboard/src/handlers/batch/collect-likes.js   // 수정 금지!
```

**이유**:
- `dist/` 디렉토리는 **esbuild가 매번 재생성**
- `src/` 디렉토리의 `.js` 파일은 **TypeScript 컴파일로 재생성**
- 재빌드/재배포 시 **모든 수정사항이 소실**됨

### ✅ 올바른 디버깅 프로세스

```bash
# 1. 원본 TypeScript 소스 수정
vim lambda-src/x-leaderboard/src/handlers/batch/collect-likes.ts

# 2. Git 커밋 (변경사항 영구 보존)
git add src/handlers/batch/collect-likes.ts
git commit -m "Fix: 좋아요 수집 로직 개선"

# 3. 아래의 '완전한 배포 워크플로우' 실행
```

---

## 🚀 완전한 배포 워크플로우 (2025-10-29 환경 분리 업데이트)

> ⚠️ **중요**: 이 워크플로우는 **환경 분리(개발/프로덕션)**와 **스택 분리(AuthStack, CommonStack, CdkStack, MonitoringStack)**가 모두 적용된 최신 버전입니다.

### ⭐ 권장 방법 1: CdkStack만 빠르게 배포 (2025-10-29 업데이트)

**⚠️ 황금률: 환경을 명시적으로 지정하세요!**

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# ✅ 개발 환경 배포 (타겟: @Naru010110, AWS 계정: 135808943968)
pnpm deploy:dev

# ✅ 프로덕션 환경 배포 (타겟: @Nasun_io, AWS 계정: 466841130170)
pnpm deploy:prod

# ❌ 환경 미지정 (에러 발생)
pnpm deploy  # → 환경 선택 에러 메시지 출력
```

**이 명령어가 자동으로 수행하는 작업:**
1. ✅ 모든 Lambda 함수 빌드 (auth-twitter, x-leaderboard, wallet-api, PriceAPI, sync-community-members)
2. ✅ 빌드 검증 (필수 파일 존재 확인, pnpm symlink 체크)
3. ✅ `.env.development` 또는 `.env.production` → `.env` 자동 전환
4. ✅ AWS 자격 증명 vs 환경 설정 불일치 검증
5. ✅ CDK synth/diff
6. ✅ **CdkStack만 배포** (빠른 배포)
7. ✅ 프로덕션 배포 시 `--profile nasun-prod` 자동 지정
8. ✅ 배포 후 .env 복원 옵션

**왜 이 방법이 안전한가?**
- `auth-twitter` 빌드 누락으로 인한 **트위터 로그인 502 에러 완전 방지**
- **환경 불일치 방지**: 프로덕션 설정으로 개발 계정에 배포하는 문제 차단
- pnpm symlink 문제 자동 해결
- 배포 전 검증으로 잘못된 배포 차단

---

### ⭐ 권장 방법 2: 전체 스택 배포 + API 엔드포인트 자동 동기화 (2025-10-30 신규 추가!)

**API Gateway URL이 변경될 수 있는 경우 사용하세요!**

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 🔍 Dry-run으로 먼저 확인 (개발 환경)
pnpm deploy:all:dev:dry

# ✅ 개발 환경: 전체 배포 + API 동기화
pnpm deploy:all:dev

# 🔍 Dry-run으로 먼저 확인 (프로덕션 환경) - 필수!
pnpm deploy:all:prod:dry

# ✅ 프로덕션 환경: 전체 배포 + API 동기화
pnpm deploy:all:prod

# ❌ 환경 미지정 (에러 발생)
pnpm deploy:all  # → 환경 선택 에러 메시지 출력
```

**이 명령어가 자동으로 수행하는 작업:**
1. ✅ 환경 변수 로드 (`.env.development` 또는 `.env.production`)
2. ✅ 모든 Lambda 함수 빌드
3. ✅ 빌드 검증
4. ✅ **AuthStack, CommonStack, CdkStack 모두 배포**
5. ✅ **API Gateway 엔드포인트를 프론트엔드 `.env` 파일에 자동 동기화**
6. ✅ 프로덕션 배포 시 `--profile nasun-prod` 자동 지정
7. ✅ 배포 후 .env 복원 옵션

**언제 사용하나?**
- ✅ AuthStack 또는 CommonStack도 함께 배포해야 할 때
- ✅ API Gateway URL이 변경될 가능성이 있을 때
- ✅ 프론트엔드 `.env` 파일을 자동으로 업데이트하고 싶을 때
- ✅ 처음 배포하거나 인프라 전체를 업데이트할 때

**상세 가이드**: [API_ENDPOINT_SYNC_GUIDE.md](API_ENDPOINT_SYNC_GUIDE.md)

---

### 📊 배포 방법 비교표

| 항목 | CdkStack만 배포<br/>(`pnpm deploy:dev`) | 전체 배포 + API 동기화<br/>(`pnpm deploy:all:dev`) |
|------|----------------------------------------|--------------------------------------------------|
| **배포 스택** | CdkStack만 | AuthStack + CommonStack + CdkStack |
| **소요 시간** | ~6분 | ~15분 |
| **API 엔드포인트 동기화** | ❌ 수동 | ✅ 자동 |
| **Lambda 빌드** | ✅ 모두 | ✅ 모두 |
| **환경 검증** | ✅ | ✅ |
| **권장 상황** | 리더보드 로직만 수정 | 공통 인프라 변경, API URL 변경 |

---

**❌ 구식 명령어 (더 이상 사용하지 마세요!)**
```bash
pnpm run deploy:safe           # 환경 구분 없음 - 제거됨
pnpm cdk deploy                # 빌드 누락 + 환경 불일치 위험
bash scripts/deploy-all-with-sync.sh  # 환경 구분 없는 구버전
```

**📚 상세 가이드**:
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 환경별 배포 가이드
- [API_ENDPOINT_SYNC_GUIDE.md](API_ENDPOINT_SYNC_GUIDE.md) - API 엔드포인트 동기화 가이드

---

### 📝 수동 배포 워크플로우 (고급 사용자용)

```bash
# ... (기존 수동 배포 워크플로우 내용) ...
```

---

## ⚠️ 치명적 배포 문제 및 해결책

### 🔴 문제 0: 트위터 로그인 502 에러 (반복 재발)

**2025-10-14 최종 해결: 스택 분리**

... (기존 내용) ...

---

### 🔴 문제 1: CDK가 Lambda 코드를 업데이트하지 않음 (Silent Deployment Failure)

... (기존 내용) ...

---

### 🔴 문제 2: Runtime.ImportModuleError (핸들러를 찾을 수 없음)

... (기존 내용) ...

---

### 🔴 문제 3: LastModified가 업데이트되었는데 코드는 변경되지 않음

... (기존 내용) ...

---

### 🔴 문제 4: 빌드는 성공했는데 파일 크기가 너무 작음

... (기존 내용) ...

---

### 🔴 문제 5: 이벤트 리더보드 데이터 불일치 (2025-10-20 추가)

**증상:**
- 이벤트 리더보드에서 특정 사용자의 `displayName`, `followersCount` 등 프로필 정보가 누락됨.
- 이벤트 리더보드의 점수에 언어/팔로워 가중치가 적용되지 않고 기본 점수만 표시됨.
- 날짜가 바뀌면 이전 날짜에 있던 사용자가 리더보드에서 사라짐.

**근본 원인:**
- `leaderboard-generator` 함수가 이벤트 리더보드를 생성할 때, 파이프라인이 전달한 완전한 최신 데이터를 사용하지 않고, **자체적으로 데이터베이스를 다시 조회**하는 로직 결함 때문.
- 이 과정에서 조회하는 `RECENT#` 데이터에는 `displayName`, `followersCount`와 같은 상세 프로필 정보가 저장되지 않아 데이터가 누락됨.
- 또한, 이벤트 기간 전체가 아닌 **'오늘 수집된' 데이터**만을 기준으로 리더보드를 생성하여, 이전 날짜의 사용자가 사라지는 문제가 발생함.

**✅ 해결책 (하이브리드 방식):**
- `leaderboard-generator`의 이벤트 리더보드 생성 로직을 수정.
- **1. 활동 데이터 조회:** 데이터베이스의 `RECENT#` 아이템을 스캔하여 이벤트 기간 전체의 활동을 누락 없이 가져옴 (사용자 사라짐 문제 해결).
- **2. 프로필 정보 보강:** 1번에서 가져온 불완전한 데이터에, 파이프라인이 전달한 최신 프로필 정보와 전체 누적 리더보드(`CUMULATIVE_SCORE`)의 정보를 결합하여 완전한 데이터셋을 만듦 (프로필 누락 문제 해결).
- **3. 점수 재계산:** 이렇게 완성된 데이터셋을 `delta-calculator`에 전달하여, 전체 누적 리더보드와 동일한 가중치를 적용해 점수를 계산함 (가중치 미적용 문제 해결).

---

### 🔴 문제 6: 환경 변수 업데이트 후 프론트엔드에 반영 안됨 (2025-10-20 추가)

**증상:**
- `.env` 파일에서 `EVENT2_START_DATE`, `EVENT2_END_DATE` 등 환경 변수를 수정함
- CDK 재배포 또는 AWS CLI로 일부 Lambda 환경 변수를 업데이트함
- 파이프라인 Lambda(`nasun-score-calculator`, `nasun-leaderboard-generator`)의 환경 변수는 정상 업데이트됨
- **하지만 프론트엔드에서 보이는 이벤트 날짜가 여전히 옛날 값으로 표시됨**

**근본 원인:**
- 프론트엔드가 호출하는 **API Lambda 함수**(`nasun-get-leaderboard`, `nasun-get-leaderboard-snapshot`)의 환경 변수가 업데이트되지 않음
- CDK 배포 실패(MonitoringStack 의존성 등) 후 AWS CLI로 수동 업데이트 시, API Lambda 함수를 빠뜨림
- API Lambda 함수가 옛날 환경 변수를 읽어서 프론트엔드에 전달

**✅ 해결책:**

환경 변수 업데이트 시 **모든 관련 Lambda 함수**를 빠짐없이 업데이트해야 합니다:

```bash
# 1. 파이프라인 Lambda 함수들
aws lambda update-function-configuration \
  --function-name nasun-score-calculator \
  --region ap-northeast-2 \
  --environment file:///tmp/updated-env.json

aws lambda update-function-configuration \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --environment file:///tmp/updated-env.json

# 2. ⚠️ API Lambda 함수들 (빠뜨리기 쉬움!)
aws lambda update-function-configuration \
  --function-name nasun-get-leaderboard \
  --region ap-northeast-2 \
  --environment file:///tmp/updated-env.json

aws lambda update-function-configuration \
  --function-name nasun-get-leaderboard-snapshot \
  --region ap-northeast-2 \
  --environment file:///tmp/updated-env.json
```

**🔍 검증 방법:**

```bash
# 모든 Lambda 함수의 환경 변수 일괄 확인
for func in nasun-score-calculator nasun-leaderboard-generator nasun-get-leaderboard nasun-get-leaderboard-snapshot; do
  echo "=== $func ==="
  aws lambda get-function-configuration \
    --function-name $func \
    --region ap-northeast-2 \
    --query 'Environment.Variables.{EVENT1_START_DATE:EVENT1_START_DATE,EVENT1_END_DATE:EVENT1_END_DATE,EVENT2_START_DATE:EVENT2_START_DATE,EVENT2_END_DATE:EVENT2_END_DATE,ADMIN_USERNAMES:ADMIN_USERNAMES}' \
    --output json | jq '.'
done
```

**프론트엔드 API 응답 검증:**

```bash
# API가 반환하는 날짜 확인
curl -s "https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard/cumulative?page=1&limit=1&period=event2" \
  | jq '{period: .data.metadata.period, periodStartDate: .data.metadata.periodStartDate, periodEndDate: .data.metadata.periodEndDate}'
```

**📝 핵심 교훈:**
- **API Lambda 함수는 프론트엔드와 직접 연결**되므로, 환경 변수 업데이트 시 반드시 포함해야 함
- 파이프라인 Lambda만 업데이트하면 데이터는 올바르게 생성되지만, 프론트엔드에는 옛날 값이 표시됨
- 환경 변수 변경 후에는 **모든 관련 Lambda 함수 + API 검증**까지 완료해야 함

---

### ✅ 문제 7: 백엔드 코드 변경 시 독립 배포 불가 (2025-10-21 완전 해결!)

**증상:**
- Leaderboard 관련 코드만 수정해도 CommonStack(NFT, User, Price)까지 함께 빌드/배포해야 함
- CommonStack 수정 시 Leaderboard까지 영향받음
- 배포 시간이 길어지고 실수 가능성 증가

**근본 원인:**
- CdkStack 하나에 Leaderboard(30개) + 공통 인프라(17개) 리소스가 혼재
- 스택 분리 실패 (Physical Name 충돌, Export 의존성 문제)

**✅ 최종 해결책 (Phase 3 완료, 2025-10-21):**

**역발상 전략: Leaderboard는 그대로 두고 공통 인프라만 분리**

```bash
# Phase 0-1: CommonStack 생성 및 배포 (새 이름으로)
pnpm cdk deploy CommonStack  # nasun-common-* Lambda 생성

# Phase 2: 프론트엔드 환경변수 업데이트 (점진적 전환)
# .env 파일에서 API URL을 CommonStack의 새 URL로 변경

# Phase 3: CdkStack 정리 (2025-10-21 완료!)
# 1. MonitoringStack 삭제 (Export 의존성 제거)
pnpm cdk destroy MonitoringStack --force

# 2. CdkStack에서 공통 인프라 11개 Lambda 제거
# lib/cdk-stack.ts 수정 (172 라인 제거)

# 3. CdkStack 배포
pnpm cdk deploy CdkStack  # 구 Lambda 11개 삭제됨

# 4. MonitoringStack 재생성
pnpm cdk deploy MonitoringStack  # CommonStack 참조로 전환
```

**🎉 결과:**
- ✅ **Leaderboard만 배포**: `pnpm cdk deploy CdkStack` (CommonStack 영향 없음)
- ✅ **공통 인프라만 배포**: `pnpm cdk deploy CommonStack` (CdkStack 영향 없음)
- ✅ **리소스 중복 제거**: 구 Lambda 11개 완전 삭제
- ✅ **배포 시간 단축**: ~10분 → ~6분 (추정)

---

### 🔴 문제 8: Lambda Runtime.ImportModuleError - 의존성 패키지 누락 (2025-10-22 추가)

**증상:**
- Lambda 함수 호출 시 `Runtime.ImportModuleError` 발생
- 에러 메시지: `Cannot find module '/var/task/node_modules/@aws/lambda-invoke-store/dist/invoke-store.js'`
- 502 Bad Gateway 에러가 API에서 발생
- Lambda 함수는 배포되었지만 실행 시 모듈을 찾지 못함

**근본 원인:**
- Lambda 함수의 transitive dependency(간접 의존성)에서 필요한 dist 폴더가 node_modules에 설치되지 않음
- `@aws/lambda-invoke-store`는 `@aws-sdk/client-dynamodb`의 간접 의존성으로, package.json에 명시되지 않음
- npm install 시 특정 패키지의 빌드 산출물(dist 폴더)이 제대로 생성되지 않았거나 손상됨
- Lambda 배포 시 zip 파일에 해당 패키지의 dist 폴더가 포함되지 않음

**영향받은 함수:**
- `nasun-common-link-account` (Google/Twitter 계정 연결 API)

**✅ 해결책:**

**1단계: 문제 패키지 재설치**
```bash
# Lambda 함수 디렉토리로 이동
cd cdk/lambda-src/link-account

# 문제 패키지 재설치
npm install @aws/lambda-invoke-store@latest

# dist 폴더 존재 확인
ls -la node_modules/@aws/lambda-invoke-store/
# 출력에 'dist' 폴더가 있어야 함
```

**2단계: Lambda 함수 코드 재배포**
```bash
# TypeScript 컴파일 (필요한 경우)
npm run build

# 전체 패키지(node_modules 포함) zip 생성
zip -r /tmp/lambda-function.zip .

# Lambda 함수 코드 직접 업데이트
aws lambda update-function-code \
  --function-name nasun-common-link-account \
  --zip-file fileb:///tmp/lambda-function.zip \
  --region ap-northeast-2
```

**3단계: 검증**
```bash
# Lambda 함수 테스트 호출
echo '{"httpMethod":"OPTIONS","headers":{}}' | \
aws lambda invoke \
  --function-name nasun-common-link-account \
  --region ap-northeast-2 \
  --cli-binary-format raw-in-base64-out \
  --payload file:///dev/stdin \
  /tmp/test-result.json

# 결과 확인 (statusCode: 200이어야 함)
cat /tmp/test-result.json | jq .
```

**예상 성공 응답:**
```json
{
  "statusCode": 200,
  "headers": {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  "body": ""
}
```

**🔍 디버깅 방법:**

**Lambda 로그 확인:**
```bash
# 최근 Lambda 로그 확인
aws logs tail /aws/lambda/nasun-common-link-account \
  --region ap-northeast-2 \
  --follow
```

**의존성 트리 확인:**
```bash
# 패키지 의존성 구조 파악
npm ls @aws/lambda-invoke-store

# 출력 예시:
# link-account-lambda@1.0.0
# └─┬ @aws-sdk/client-dynamodb@3.902.0
#   └─┬ @aws-sdk/middleware-recursion-detection@3.901.0
#     └── @aws/lambda-invoke-store@0.0.1
```

**node_modules 검증:**
```bash
# 패키지 내용 확인
ls -la node_modules/@aws/lambda-invoke-store/
# dist/ 폴더가 반드시 있어야 함

# dist 폴더 내용 확인
ls -la node_modules/@aws/lambda-invoke-store/dist/
# invoke-store.js, invoke-store.d.ts 파일이 있어야 함
```

**📝 핵심 교훈:**
- CDK 배포는 성공했더라도 node_modules의 의존성 상태를 보장하지 않음
- Lambda 함수에 새로운 의존성이 추가되면 node_modules를 완전히 재설치하는 것이 안전함
- Runtime.ImportModuleError 발생 시, npm install만으로는 해결되지 않을 수 있으며 직접 zip + update-function-code가 필요함
- 간접 의존성(transitive dependencies)의 빌드 산출물 누락은 CDK 배포로 자동 해결되지 않음

**📊 스택 분리 현황:**
```
CommonStack (13 Lambda)     CdkStack (17 Lambda)
├─ NFT/Supply (4)          ├─ API (4)
├─ User Profile (3)        ├─ Batch (2)
├─ Price API (3)           ├─ Data Collection (9)
├─ AWS Creds (1)           └─ Community (2)
└─ Account Mgmt (2)

→ 완전히 독립적으로 배포 가능! ✅
```

**📝 핵심 교훈:**
- ✅ "움직이기 어려운 큰 덩어리는 그대로 두고, 작은 것을 분리한다"
- ✅ Export 의존성 문제는 스택 재생성으로 해결
- ✅ Physical Name 충돌은 새 이름 사용으로 회피
- ✅ 독립 배포 문제 **완전 해결!**

---

### ✅ 문제 8: 이벤트 리더보드 날짜 비교 버그 (2025-10-21 근본 해결!)

**증상:**
- 2025-10-21 09:10 AM 자동 파이프라인 실행 시 EVENT1 리더보드가 생성되지 않음
- 누적 리더보드는 정상 생성됨 (109개 항목)
- CloudWatch 로그: `⏭️ 1차 이벤트 종료됨 (종료일: 2025-10-21)`
- 환경 변수는 정상: `EVENT1_END_DATE="2025-10-21"`

**원인 분석:**
```typescript
// ❌ 문제 코드
const event1Config = eventPeriodConfigs[LeaderboardPeriod.EVENT1];
if (event1Config &&
    today >= new Date(event1Config.startDate) &&
    today <= new Date(event1Config.endDate)) {  // 🐛 버그!
  // 리더보드 생성
}

// 실행 시나리오 (2025-10-21 09:10 AM KST)
today = new Date()  // 2025-10-21T00:10:00.000Z (UTC, KST 09:10)
endDate = new Date("2025-10-21")  // 2025-10-21T00:00:00.000Z (자정)

// 비교 결과
2025-10-21 00:10 <= 2025-10-21 00:00  // ❌ FALSE!
```

**근본 원인:**
- `new Date("2025-10-21")`는 해당 날짜의 **자정 (00:00:00)**을 의미
- 파이프라인이 오전 9시 10분에 실행되면 이미 자정을 지남
- 따라서 `today > endDate`로 판단되어 "이벤트 종료"로 잘못 처리
- **종료일 당일이 이벤트 기간에서 제외되는 버그**

**해결 방법 (근본적 개선):**

```typescript
// ✅ 해결책 1: 헬퍼 함수 추가 (재사용성, 유지보수성 향상)
/**
 * 주어진 날짜가 이벤트 기간 내에 있는지 확인
 * 종료일의 23:59:59.999까지 포함 (해당 날짜 전체 포함)
 */
private isWithinEventPeriod(
  today: Date,
  startDate: string,
  endDate: string,
  eventName: string = "EVENT"
): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // 종료일 전체 포함

  const isWithin = today >= start && today <= end;

  // 디버깅 로그 (기간 외일 때만)
  if (!isWithin) {
    console.log(`⏰ [${eventName}] 이벤트 기간 확인:`, {
      today: today.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      beforeStart: today < start,
      afterEnd: today > end
    });
  }

  return isWithin;
}

// ✅ 해결책 2: EVENT1, EVENT2 로직을 헬퍼 함수로 교체
const event1Config = eventPeriodConfigs[LeaderboardPeriod.EVENT1];
if (event1Config && this.isWithinEventPeriod(
  today,
  event1Config.startDate,
  event1Config.endDate,
  "EVENT1"
)) {
  console.log(`📅 1차 이벤트 진행 중 (${event1Config.startDate} ~ ${event1Config.endDate})`);
  results.event1 = await this.generateEvent1Leaderboard(collectedEngagements);
}
```

**검증 결과:**
```bash
# Lambda 수동 실행
aws lambda invoke --function-name nasun-leaderboard-generator \
  --payload '{}' --region ap-northeast-2 /tmp/result.json

# 결과 확인
{
  "event1": {
    "period": "EVENT1",
    "entriesGenerated": 10,    # ✅ 생성 성공!
    "topScore": 18.56,
    "description": "1차 이벤트 기간 (환경변수 기반)"
  }
}

# DynamoDB 확인
aws dynamodb query --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"LEADERBOARD#EVENT1"}}'

# ✅ 11개 항목 저장됨
# 1위: kimberrynice (18.56점)
# 2위: GgaengEHandsome (16.56점)
```

**개선 효과:**

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| **버그** | 종료일 당일 제외 ❌ | 종료일 23:59:59까지 포함 ✅ |
| **코드 중복** | EVENT1, EVENT2 각각 날짜 로직 반복 | 헬퍼 함수 1개로 통일 ✅ |
| **유지보수성** | 2곳 수정 필요 | 1곳만 수정 ✅ |
| **확장성** | EVENT3 추가 시 코드 반복 | 헬퍼 재사용 ✅ |
| **디버깅** | 기본 로그만 | 상세 디버깅 로그 ✅ |

**핵심 교훈:**
- ✅ 날짜 비교 시 **시간 부분을 항상 고려**해야 함
- ✅ "2025-10-21까지"는 사람에게는 "그 날 끝까지"를 의미하지만, 코드에서는 "그 날 자정"을 의미
- ✅ 재사용 가능한 헬퍼 함수로 추출하면 향후 동일한 버그 방지
- ✅ 디버깅 로그를 포함하면 문제 발생 시 빠른 원인 파악 가능
- ✅ **DRY 원칙**: 동일한 로직이 반복되면 반드시 함수로 추출

**파일 위치:**
- `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts`

**커밋:**
- `b101218` - fix(leaderboard): Fix EVENT1/EVENT2 date comparison logic bug

---

## 🔍 배포 후 최종 검증 (필수!)

> ⚠️ **중요**: 배포 로그만 믿지 마세요! 실제 Lambda 코드를 다운로드하여 검증해야 합니다.

... (기존 내용) ...

### 검증 방법 4: 환경변수 정상 주입 확인 (중요!)

> ⚠️ **중요**: 코드가 정상 배포되어도 환경변수가 누락되거나 잘못 주입되면 런타임 에러가 발생합니다.

> 🔍 **Gemini의 교훈 (2025-10-20 업데이트)**: 성공적인 `cdk deploy`가 환경변수 업데이트를 보장하지 않습니다. 특히 이벤트 날짜와 같이 중요한 설정을 변경한 후에는, 반드시 `aws lambda get-function-configuration` 명령어로 실제 배포된 Lambda의 환경변수 값이 로컬 `.env` 파일의 값과 일치하는지 교차 검증해야 합니다. 이 과정을 통해 '배포는 성공했지만 설정은 반영되지 않는' 문제를 사전에 방지할 수 있습니다.

... (기존 내용) ...

---

## 📦 Lambda 패키징 구조 가이드

... (기존 내용) ...

---

## 🛠️ 긴급 수동 배포 가이드

... (기존 내용) ...

---

## 🕐 TTL (Time-To-Live) 설정 및 트러블슈팅

### 개요

DynamoDB 아이템의 자동 삭제를 위한 TTL 설정 및 검증 방법입니다. 리더보드 스냅샷과 사용자 랭킹 히스토리에 적용됩니다.

### TTL 정책 (2025-10-31 업데이트)

**이중 TTL 정책**:
1. **일일 스냅샷/히스토리**: 1년 후 자동 삭제 (365일)
2. **이벤트 최종 스냅샷/히스토리**: 10년 보관 (3650일, 실질적 영구 보관)

**적용 범위**:
- ✅ `LEADERBOARD#{period}#{date}` - 리더보드 스냅샷
- ✅ `USER#{userId}` → `RANK_HISTORY#{period}#{date}` - 사용자 랭킹 히스토리

**TTL 결정 로직** (Lambda: `leaderboard-generator.ts`):
```typescript
// 이벤트 종료 여부 확인
const today = new Date().toISOString().split('T')[0];
const eventEndDate = config.endDate.split('T')[0];
const isEventEnded = today > eventEndDate;

// TTL 계산
let ttl: number;
if (isEventEnded) {
  // 이벤트 최종 스냅샷: 10년 보관
  ttl = Math.floor(Date.now() / 1000) + (3650 * 24 * 60 * 60);
} else {
  // 일일 스냅샷: 1년 보관
  ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
}
```

### DynamoDB TTL 활성화 확인

```bash
# 개발 환경 확인
aws dynamodb describe-time-to-live \
  --table-name nasun-leaderboard-data \
  --region ap-northeast-2

# 프로덕션 환경 확인
aws dynamodb describe-time-to-live \
  --table-name nasun-leaderboard-data \
  --profile nasun-prod \
  --region ap-northeast-2

# 예상 출력:
# {
#   "TimeToLiveDescription": {
#     "TimeToLiveStatus": "ENABLED",
#     "AttributeName": "ttl"
#   }
# }
```

### TTL 값 검증 (CloudWatch Logs)

**검증 키워드**:
```bash
# 이벤트 종료 후 - 10년 TTL 확인
"[EVENT_SNAPSHOT] 최종 스냅샷 영구 보관 (TTL: 10년)"
"[EVENT_HISTORY] 최종 히스토리 영구 보관 (TTL: 10년)"

# 일일 스냅샷 - 1년 TTL 확인
"[DAILY_SNAPSHOT] 일일 스냅샷 TTL: 1년"
"[DAILY_HISTORY] 일일 히스토리 TTL: 1년"
```

**CloudWatch Logs Insights 쿼리**:
```sql
fields @timestamp, @message
| filter @message like /TTL/
| sort @timestamp desc
| limit 20
```

### TTL 값 직접 확인 (DynamoDB)

```bash
# 최근 스냅샷 TTL 확인
aws dynamodb query \
  --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk":{"S":"LEADERBOARD#EVENT1#2025-10-31"}}' \
  --region ap-northeast-2 \
  --limit 1 | jq '.Items[0].ttl.N'

# TTL 값을 사람이 읽을 수 있는 날짜로 변환
# (출력된 Unix timestamp를 복사하여 아래 명령 실행)
date -d @1762185600  # 예: 2025-11-03 01:00:00

# 예상 결과:
# - 일일 스냅샷: 약 1년 후 날짜
# - 이벤트 최종 스냅샷: 약 10년 후 날짜
```

### 트러블슈팅

**문제 1: TTL이 설정되지 않음**

증상:
```bash
aws dynamodb describe-time-to-live --table-name nasun-leaderboard-data
# TimeToLiveStatus: "DISABLED"
```

해결:
```bash
# TTL 활성화 (AttributeName: ttl)
aws dynamodb update-time-to-live \
  --table-name nasun-leaderboard-data \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region ap-northeast-2

# 상태 확인 (ENABLING → ENABLED로 변경됨, 수 분 소요)
aws dynamodb describe-time-to-live --table-name nasun-leaderboard-data
```

**문제 2: 이벤트 종료 후에도 1년 TTL이 적용됨**

증상:
```bash
# CloudWatch Logs에서 이벤트 종료 후에도 다음 메시지 발견:
"[DAILY_SNAPSHOT] 일일 스냅샷 TTL: 1년"
```

원인:
- 이벤트 종료 날짜(`EVENT1_END_DATE`, `EVENT2_END_DATE`)가 잘못 설정됨
- 또는 `isEventEnded` 로직 버그

해결:
```bash
# 1. 환경 변수 확인
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --query 'Environment.Variables.EVENT1_END_DATE'

# 2. 오늘 날짜와 비교
date -I  # 예: 2025-10-31

# 3. 날짜가 잘못되었다면 .env 파일 수정 후 재배포
vim cdk/.env.development  # 또는 .env.production
pnpm deploy:dev           # 또는 deploy:prod
```

**문제 3: 일부 아이템에만 TTL이 없음**

증상:
```bash
# DynamoDB 조회 시 일부 아이템에 ttl 필드 누락
aws dynamodb query --table-name nasun-leaderboard-data ... | jq '.Items[].ttl'
# null  # ← TTL 없음
```

원인:
- Lambda 배포 전에 생성된 구 데이터
- 또는 TTL 로직 버그

해결:
```bash
# 1. 파이프라인 재실행 (새 스냅샷 생성)
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:ap-northeast-2:135808943968:stateMachine:nasun-leaderboard-pipeline \
  --region ap-northeast-2

# 2. 새 스냅샷 확인
aws dynamodb query --table-name nasun-leaderboard-data ... | jq '.Items[0].ttl'
# "1762185600"  # ← TTL 정상
```

### 환경 변수

**이벤트 기간 설정** (cdk/.env.development 또는 .env.production):
```bash
# Event 1
EVENT1_START_DATE=2025-10-19
EVENT1_END_DATE=2025-10-21

# Event 2
EVENT2_START_DATE=2025-10-22
EVENT2_END_DATE=2025-10-30
```

⚠️ **중요**: 이벤트 종료 날짜 변경 시 Lambda 재배포 필수!

### 관련 파일

- **Lambda**: `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts`
  - `generateEvent1Leaderboard()`: Line 236-268
  - `generateEvent2Leaderboard()`: Line 270-302
  - `saveLeaderboardSnapshot()`: Line 1298-1469
  - `saveUserRankHistories()`: Line 1544-1639

- **환경 변수**: `cdk/.env.development`, `cdk/.env.production`

---

## 📊 트러블슈팅 체크리스트

... (기존 내용) ...

---

## 🎯 핵심 원칙 요약

... (기존 내용) ...

---

## 📚 참고 자료

... (기존 내용) ...

---

## 📝 변경 이력

### 2025-10-30 (Update 8) ✅ **통합 배포 + API 엔드포인트 자동 동기화**
- **🚀 통합 배포 스크립트 환경 분리**: `deploy-all-with-sync-env.sh` 신규 생성
  - 전체 스택 배포 (AuthStack + CommonStack + CdkStack)
  - API Gateway 엔드포인트 자동 동기화 (환경별 `.env` 파일)
  - Dry-run 모드 지원
- **📦 npm 스크립트 추가**:
  - `pnpm deploy:all:dev` - 개발 환경 전체 배포 + API 동기화
  - `pnpm deploy:all:prod` - 프로덕션 환경 전체 배포 + API 동기화
  - `pnpm deploy:all:dev:dry` - 개발 환경 Dry-run
  - `pnpm deploy:all:prod:dry` - 프로덕션 환경 Dry-run
  - `pnpm deploy:all` - 환경 미지정 시 에러 메시지 표시
- **📚 문서 업데이트**:
  - [API_ENDPOINT_SYNC_GUIDE.md](API_ENDPOINT_SYNC_GUIDE.md) v2.0.0 - 환경별 동기화 가이드 전면 개편
  - BUILD_CONFIGURATION_GUIDE.md - 통합 배포 섹션 추가
  - 배포 방법 비교표 추가 (CdkStack만 vs 전체 배포)
- **🎯 사용성 개선**:
  - API URL 변경 시 프론트엔드 `.env` 파일 자동 업데이트
  - 환경별 체크리스트 추가
  - 모든 배포 명령어에 환경 명시 강제
- **관련 PR**: 환경 분리 통합 배포 시스템 구축

### 2025-10-29 (Update 7) ✅ **환경 분리 (Dev/Prod) 업데이트**
- **🚀 환경별 배포 명령어 도입**: `pnpm deploy:dev` / `pnpm deploy:prod`
  - 기존 `pnpm run deploy:safe` 제거 (환경 구분 없는 배포 차단)
  - `.env.development` / `.env.production` 자동 전환
  - AWS 자격 증명 vs 환경 설정 불일치 검증
  - 프로덕션 배포 시 `--profile nasun-prod` 자동 지정
- **📦 스택별 배포 명령어 환경 분리**
  - 모든 스택 (AuthStack, CommonStack, CdkStack, NftEventStack, MonitoringStack) 개발/프로덕션 구분
  - 각 스택별로 환경별 배포 방법 명시
- **📚 통합 문서**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
  - 환경 구조 (개발 vs 프로덕션)
  - 환경별 배포 프로세스
  - 환경 불일치 트러블슈팅
  - FAQ 및 긴급 복구 방법
- **🎯 배포 안전성 강화**
  - "프로덕션 설정으로 개발 계정에 배포" 문제 근본 해결
  - 환경 검증 스크립트 (`pre-deployment-check.sh`) 추가
  - 배포 전 AWS 계정 ID 자동 검증

### 2025-10-20 (Update 6)
- 🔴 **문제 6: 환경 변수 업데이트 후 프론트엔드에 반영 안됨** 디버깅 사례 추가
  - API Lambda 함수(`nasun-get-leaderboard`, `nasun-get-leaderboard-snapshot`)의 환경 변수 업데이트 누락 문제
  - AWS CLI로 수동 업데이트 시 모든 관련 Lambda 함수를 빠짐없이 업데이트해야 함
  - 프론트엔드 API 응답 검증 방법 추가

### 2025-10-20 (Update 5)
- 🔴 **문제 5: 이벤트 리더보드 데이터 불일치** 디버깅 사례 추가
- 🔍 **Gemini의 교훈**에 환경변수 배포 실패 사례에 대한 내용 보강