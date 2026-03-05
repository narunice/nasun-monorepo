# API 엔드포인트 자동 동기화 가이드

**작성일**: 2025-10-24
**최종 업데이트**: 2026-01-14 ✅ **API Gateway ID 고정 설명 추가 및 개별 스택 수동 동기화 가이드 보강**
**버전**: 2.2.0

CDK 백엔드 배포 후 API Gateway 엔드포인트가 변경될 때, 프론트엔드 `.env` 파일을 **환경별로** 자동 업데이트하는 시스템입니다.

> ⚠️ **중요**: 개발(development)과 프로덕션(production) 환경이 완전히 분리되어 있으므로, **반드시 환경을 명시**해야 합니다.

> 📌 **참고**: API Gateway ID는 고정되어 있으며, CDK 재배포로 변경되지 않습니다.
> - 개발 환경: `bb4zdy0rwe` (고정)
> - 프로덕션 환경: `bumvhwfbj4` (고정)
> - API Gateway 리소스를 완전히 삭제하고 재생성하지 않는 한 변경되지 않습니다.

---

## 📋 목차

1. [문제 상황](#문제-상황)
2. [해결 방법](#해결-방법)
3. [사용 방법](#사용-방법)
4. [아키텍처](#아키텍처)
5. [트러블슈팅](#트러블슈팅)
6. [수동 동기화 가이드 (비상시)](#수동-동기화-가이드-비상시)

---

## 🚨 문제 상황

### 증상
- CDK 스택을 재배포하면 API Gateway 엔드포인트가 변경됨
- 프론트엔드 `.env.development`, `.env.production`, `.env.staging` 파일의 엔드포인트가 예전 주소로 남아있음
- **Staging 배포 시 해당 기능이 작동하지 않음** ❌

### 예시
```bash
# CDK 배포 전
VITE_JOIN_WHITELIST_API=https://OLD_URL.execute-api.ap-northeast-2.amazonaws.com/prod/

# CDK 배포 후 (자동 변경 안 됨)
# CloudFormation Output: https://NEW_URL.execute-api.ap-northeast-2.amazonaws.com/prod/
# 하지만 .env 파일은 여전히 OLD_URL을 가리킴 ❌
```

---

## ✅ 해결 방법

### 자동화 시스템

**1. 자동 동기화 스크립트**
- 위치: `cdk/scripts/sync-api-endpoints.js`
- 기능: CloudFormation Outputs → 프론트엔드 `.env` 파일 자동 업데이트

**2. 통합 배포 스크립트**
- 위치: `cdk/scripts/deploy-all-with-sync.sh`
- 기능: 배포 + 자동 동기화를 한 번에 실행

**3. 개별 동기화 명령어**
- `pnpm sync:endpoints` - 즉시 동기화
- `pnpm sync:endpoints:dry` - 미리보기 (실제 파일 수정 안 함)

---

## 🚀 사용 방법

> ⚠️ **중요 변경사항 (2025-10-30)**: 모든 명령어에 환경을 명시해야 합니다!

### 방법 1: 통합 배포 + 자동 동기화 (권장 ⭐)

**개발 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# Dry-run으로 먼저 확인 (권장)
pnpm deploy:all:dev:dry

# 실제 배포 + 자동 동기화
pnpm deploy:all:dev
```

**프로덕션 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# Dry-run으로 먼저 확인 (필수!)
pnpm deploy:all:prod:dry

# 실제 배포 + 자동 동기화
pnpm deploy:all:prod
```

**실행 순서:**
1. ✅ 환경 변수 로드 (.env.development 또는 .env.production)
2. ✅ 모든 Lambda 빌드
3. ✅ 빌드 검증
4. ✅ AuthStack, CommonStack, CdkStack 배포 (환경별)
5. ✅ API 엔드포인트 자동 동기화 (frontend/.env.{environment})

---

### 방법 2: 개별 스택 배포 후 환경별 동기화

**개발 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 1. 특정 스택만 배포
pnpm cdk deploy CommonStack --require-approval never

# 2. API 엔드포인트 동기화 (개발 환경)
pnpm sync:endpoints
```

**프로덕션 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 1. 특정 스택만 배포 (프로덕션 프로필 사용)
pnpm cdk deploy CommonStack --profile nasun-prod --require-approval never

# 2. API 엔드포인트 동기화 (프로덕션 환경)
pnpm sync:endpoints:prod
```

---

### 방법 3: 동기화만 실행 (배포 없이)

**개발 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# Dry-run (미리보기)
pnpm sync:endpoints:dry

# 실제 동기화
pnpm sync:endpoints
```

**프로덕션 환경:**
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# Dry-run (미리보기)
pnpm sync:endpoints:prod:dry

# 실제 동기화
pnpm sync:endpoints:prod
```

**사용 시나리오:**
- 이미 배포는 완료했는데 `.env` 파일만 업데이트하고 싶을 때
- Git에서 `.env` 파일을 잘못 되돌렸을 때
- 환경 변수 파일만 재동기화하고 싶을 때

---

## 🏗️ 아키텍처

### 1. CloudFormation Outputs 수집

```javascript
// cdk/scripts/sync-api-endpoints.js

const STACKS = ['CommonStack', 'AuthStack', 'CdkStack'];

// AWS SDK로 각 스택의 Outputs 가져오기
const outputs = await getStackOutputs('CommonStack');
// {
//   "JoinWhitelistApiUrl": "https://x33snho5x7.execute-api.ap-northeast-2.amazonaws.com/prod/",
//   "WithdrawWhitelistApiUrl": "https://ixcrsh9ueb.execute-api.ap-northeast-2.amazonaws.com/prod/",
//   ...
// }
```

### 2. 매핑 테이블

```javascript
const MAPPING = {
  // CloudFormation Output Key → .env 변수명
  'JoinWhitelistApiUrl': 'VITE_JOIN_WHITELIST_API',
  'WithdrawWhitelistApiUrl': 'VITE_WITHDRAW_WHITELIST_API',
  'CheckWhitelistApiUrl': 'VITE_CHECK_WHITELIST_API',
  'DeactivateAccountApiUrl': 'VITE_DEACTIVATE_USER_API_URL',
  'UserProfileApiUrl': 'VITE_USER_PROFILE_API',
  'RandomImageApiUrl': 'VITE_RANDOM_IMAGE_API_ENDPOINT',
  'PriceApiUrl': 'VITE_PRICE_API_ENDPOINT',
  'GetSupplyCountApiUrl': 'VITE_SUPPLY_COUNT_API_ENDPOINT',
  'GetBackupPricesApiUrl': 'VITE_BACKUP_API_ENDPOINT',
  'LinkAccountApiUrl': 'VITE_LINK_ACCOUNT_API',
  'GetAwsCredentialsApiUrl': 'VITE_AWS_CREDENTIALS_API',
  'WalletApiUrl': 'VITE_WALLET_API_ENDPOINT',

  // 특수 처리: URL 끝에 path 추가
  'TwitterAuthApiUrl': {
    envVar: 'VITE_TWITTER_AUTH_API',
    appendPath: 'auth/twitter'
  },
  'MetaMaskAuthApiUrl': {
    envVar: 'VITE_METAMASK_AUTH_API',
    appendPath: 'auth/metamask'
  },

  // 리더보드 API
  'ApiEndpoint': 'VITE_X_LEADERBOARD_V2_API_ENDPOINT'
};
```

### 3. .env 파일 업데이트

```javascript
// 대상 파일
const ENV_FILES = [
  '.env.development',
  '.env.production',
  '.env.staging'
];

// 각 파일 업데이트
ENV_FILES.forEach(file => {
  updateEnvFile(file, updates);
});
```

**업데이트 로직:**
- 기존 `.env` 파일을 파싱
- 매핑된 변수만 업데이트
- 주석과 다른 변수는 그대로 유지
- 변경사항 콘솔에 출력

---

## 🔍 실행 결과 예시

### Dry-run 모드

```bash
$ pnpm sync:endpoints:dry

🚀 API 엔드포인트 동기화 시작

🔍 DRY-RUN 모드: 실제 파일은 수정되지 않습니다.

📡 CloudFormation Outputs 수집 중...

   - CommonStack 조회 중...
   - AuthStack 조회 중...
   - CdkStack 조회 중...

✅ 총 45개 Outputs 수집 완료

📝 14개 환경 변수 업데이트 대상:

   VITE_JOIN_WHITELIST_API = https://x33snho5x7.execute-api.ap-northeast-2.amazonaws.com/prod/
   VITE_WITHDRAW_WHITELIST_API = https://ixcrsh9ueb.execute-api.ap-northeast-2.amazonaws.com/prod/
   VITE_CHECK_WHITELIST_API = https://d42wpjjupi.execute-api.ap-northeast-2.amazonaws.com/prod/
   ...

📄 .env.development 업데이트 중...
   VITE_JOIN_WHITELIST_API
     Before: https://OLD_URL.execute-api.ap-northeast-2.amazonaws.com/prod/
     After:  https://x33snho5x7.execute-api.ap-northeast-2.amazonaws.com/prod/
   🔍 [DRY-RUN] 3개 변경사항 (실제 적용 안 함)

📄 .env.production 업데이트 중...
   ℹ️  변경사항 없음

📄 .env.staging 업데이트 중...
   VITE_JOIN_WHITELIST_API
     Before: https://OLD_URL.execute-api.ap-northeast-2.amazonaws.com/prod/
     After:  https://x33snho5x7.execute-api.ap-northeast-2.amazonaws.com/prod/
   🔍 [DRY-RUN] 1개 변경사항 (실제 적용 안 함)

🔍 DRY-RUN 완료: 실제 변경사항 없음

💡 다음 단계:
   1. git diff로 변경사항 확인
   2. 프론트엔드 재빌드 및 배포
```

### 실제 동기화 모드

```bash
$ pnpm sync:endpoints

📄 .env.development 업데이트 중...
   VITE_JOIN_WHITELIST_API
     Before: https://OLD_URL.execute-api.ap-northeast-2.amazonaws.com/prod/
     After:  https://x33snho5x7.execute-api.ap-northeast-2.amazonaws.com/prod/
   ✅ 3개 변경사항 저장됨

✅ 동기화 완료: 2개 파일 업데이트됨

💡 다음 단계:
   1. git diff로 변경사항 확인
   2. 프론트엔드 재빌드 및 배포
```

---

## 🎯 배포 워크플로우 (환경별 권장 방법)

### 시나리오 1: 개발 환경 - 백엔드 수정 후 전체 배포

```bash
# 1. 백엔드 배포 + 자동 동기화 (개발 환경)
cd cdk
pnpm deploy:all:dev

# 2. 변경사항 확인
git diff ../frontend/.env.development

# 3. 프론트엔드 재빌드
cd ../frontend
npm run build

# 4. 개발 서버 테스트
npm run dev
```

### 시나리오 2: 프로덕션 환경 - 백엔드 수정 후 전체 배포

```bash
# 1. Dry-run으로 먼저 확인 (필수!)
cd cdk
pnpm deploy:all:prod:dry

# 2. 실제 배포 + 자동 동기화 (프로덕션 환경)
pnpm deploy:all:prod

# 3. 변경사항 확인
git diff ../frontend/.env.production

# 4. 프론트엔드 프로덕션 빌드
cd ../frontend
npm run build

# 5. 프로덕션 배포
# (S3 또는 호스팅 서비스에 배포)
```

### 시나리오 3: 개별 스택만 배포 (개발)

```bash
# 1. 특정 스택 배포 (개발 환경)
cd cdk
pnpm cdk deploy CommonStack --require-approval never

# 2. API 엔드포인트 동기화 (개발)
pnpm sync:endpoints

# 3. 변경사항 확인 및 프론트엔드 재빌드
git diff ../frontend/.env.development
cd ../frontend && npm run build
```

### 시나리오 4: 개별 스택만 배포 (프로덕션)

```bash
# 1. 특정 스택 배포 (프로덕션 환경)
cd cdk
pnpm cdk deploy CommonStack --profile nasun-prod --require-approval never

# 2. API 엔드포인트 동기화 (프로덕션)
pnpm sync:endpoints:prod

# 3. 변경사항 확인 및 프론트엔드 재빌드
git diff ../frontend/.env.production
cd ../frontend && npm run build
```

---

## 🛠️ 트러블슈팅

### 문제 1: "스택을 찾을 수 없습니다"

**증상:**
```
⚠️  스택 'CommonStack'을(를) 찾을 수 없습니다.
```

**원인:**
- 해당 스택이 배포되지 않음
- AWS 리전이 다름

**해결:**
```bash
# 1. 스택 존재 확인
aws cloudformation describe-stacks --stack-name CommonStack --region ap-northeast-2

# 2. 스택 배포
pnpm cdk deploy CommonStack --require-approval never
```

---

### 문제 2: "AWS credentials가 없습니다"

**증상:**
```
❌ 스택 'CommonStack' Outputs 가져오기 실패: Unable to locate credentials
```

**원인:**
- AWS CLI 설정이 안 됨

**해결:**
```bash
# AWS credentials 확인
aws configure list

# 설정
aws configure
# AWS Access Key ID: ...
# AWS Secret Access Key: ...
# Default region name: ap-northeast-2
```

---

### 문제 3: ".env 파일이 업데이트되지 않음"

**증상:**
```
📄 .env.development 업데이트 중...
   ℹ️  변경사항 없음
```

**원인:**
- CloudFormation Output 키와 매핑이 일치하지 않음
- 엔드포인트가 실제로 변경되지 않음

**확인:**
```bash
# 1. CloudFormation Outputs 직접 확인
aws cloudformation describe-stacks \
  --stack-name CommonStack \
  --region ap-northeast-2 \
  --query 'Stacks[0].Outputs'

# 2. 현재 .env 파일 확인
grep VITE_JOIN_WHITELIST_API ../frontend/.env.development
```

**해결:**
- `cdk/scripts/sync-api-endpoints.js`의 `MAPPING` 테이블 확인
- 필요 시 매핑 추가

---

### 문제 4: "파일 권한 에러"

**증상:**
```
Error: EACCES: permission denied
```

**해결:**
```bash
# 스크립트 실행 권한 부여
chmod +x cdk/scripts/sync-api-endpoints.js
chmod +x cdk/scripts/deploy-all-with-sync.sh

# .env 파일 쓰기 권한 확인
ls -la frontend/.env*
chmod 644 frontend/.env.*
```

---

## 6. 수동 동기화 가이드 (비상시)

스크립트 실행이 실패하거나 개별 스택만 빠르게 업데이트해야 할 경우, CDK 배포 로그를 보고 직접 `.env` 파일을 수정할 수 있습니다.

### 1. CDK Outputs 확인

CDK 배포가 완료되면 터미널에 `Outputs:` 섹션이 표시됩니다.

```bash
# 예시: NftEventStack 배포 결과
Outputs:
NftEventStack.ApiGatewayUrl = https://jrrge0lqtk.execute-api.ap-northeast-2.amazonaws.com/prod/
NftEventStack.RegisterEndpoint = https://jrrge0lqtk.execute-api.ap-northeast-2.amazonaws.com/prod/event/register
...
```

### 2. .env 파일 수정

확인한 URL을 프론트엔드 환경 설정 파일(`frontend/.env.development` 또는 `frontend/.env.production`)에 직접 복사합니다.

**주요 매핑 테이블:**

| Stack | CDK Output Key | .env Variable Name | 예시 값 (Prod) |
|-------|----------------|-------------------|---------------|
| **NftEventStack** | `ApiGatewayUrl` | `VITE_BATTALION_NFT_API` | `https://jrrge0lqtk.../prod` |
| **AuthStack** | `TwitterAuthApiUrl` | `VITE_TWITTER_AUTH_API` | `https://br30jspm8j.../prod/auth/twitter` |
| **AuthStack** | `MetaMaskAuthApiUrl` | `VITE_METAMASK_AUTH_API` | `https://gtzq164xhb.../prod/auth/metamask` |
| **CommonStack** | `JoinWhitelistApiUrl` | `VITE_JOIN_WHITELIST_API` | `https://shx1fpd8qi.../prod/` |
| **CommonStack** | `UserProfileApiUrl` | `VITE_USER_PROFILE_API` | `https://aanboqet5i.../prod/` |

> ⚠️ **주의**: URL 끝의 슬래시(`/`) 포함 여부를 기존 값과 동일하게 맞춰주세요.

### 3. 프론트엔드 재빌드 (필수)

`.env` 파일을 수정한 후에는 반드시 프론트엔드를 재빌드해야 변경 사항이 반영됩니다.

```bash
cd frontend
npm run build
```

---

## 📚 관련 파일

### 스크립트
- **`cdk/scripts/sync-api-endpoints.js`** - 메인 동기화 스크립트
- **`cdk/scripts/deploy-all-with-sync.sh`** - 통합 배포 스크립트

### 설정
- **`cdk/package.json`** - npm 스크립트 정의
- **`frontend/.env.development`** - 개발 환경 변수
- **`frontend/.env.production`** - 프로덕션 환경 변수
- **`frontend/.env.staging`** - 스테이징 환경 변수

### 문서
- **`doc/API_ENDPOINT_SYNC_GUIDE.md`** - 이 문서
- **`cdk/README.md`** - CDK 배포 가이드
- **`cdk/DEPLOYMENT_CHECKLIST.md`** - 배포 체크리스트

---

## 🔄 유지보수

### 새로운 API 추가 시

1. **CDK 스택에 API Gateway 추가**
   ```typescript
   // cdk/lib/common-stack.ts
   const newApiGateway = new apigateway.RestApi(this, 'NewApi', {
     restApiName: 'NewApi',
   });

   new cdk.CfnOutput(this, 'NewApiUrl', {
     value: newApiGateway.url,
     exportName: 'NewApiUrl'
   });
   ```

2. **매핑 테이블에 추가**
   ```javascript
   // cdk/scripts/sync-api-endpoints.js
   const MAPPING = {
     ...
     'NewApiUrl': 'VITE_NEW_API',
   };
   ```

3. **프론트엔드 .env 파일에 추가**
   ```bash
   # frontend/.env.development
   VITE_NEW_API=https://temporary-url.execute-api.ap-northeast-2.amazonaws.com/prod/
   ```

4. **배포 및 동기화**
   ```bash
   bash scripts/deploy-all-with-sync.sh
   ```

---

## 📝 npm 스크립트 요약 (환경별)

### 개발 환경 (Development)

| 명령어 | 설명 |
|--------|------|
| `pnpm deploy:dev` | CdkStack만 배포 (빠른 배포) |
| `pnpm deploy:all:dev` | 전체 스택 배포 + API 동기화 |
| `pnpm deploy:all:dev:dry` | Dry-run (미리보기) |
| `pnpm sync:endpoints` | API 엔드포인트 동기화만 |
| `pnpm sync:endpoints:dry` | 동기화 미리보기 |

### 프로덕션 환경 (Production)

| 명령어 | 설명 |
|--------|------|
| `pnpm deploy:prod` | CdkStack만 배포 (빠른 배포) |
| `pnpm deploy:all:prod` | 전체 스택 배포 + API 동기화 |
| `pnpm deploy:all:prod:dry` | Dry-run (미리보기) ⚠️ **필수!** |
| `pnpm sync:endpoints:prod` | API 엔드포인트 동기화만 |
| `pnpm sync:endpoints:prod:dry` | 동기화 미리보기 |

### 환경 미지정 시 (에러 발생)

```bash
$ pnpm deploy:all

❌ 배포 환경을 명시적으로 지정해주세요:

  📦 개발 환경 전체 배포:
    pnpm deploy:all:dev

  🚀 프로덕션 환경 전체 배포:
    pnpm deploy:all:prod
```

---

## ✅ 체크리스트

### 개발 환경 배포 전 확인사항:

- [ ] AWS credentials 설정 확인 (`aws configure list`)
- [ ] 개발 계정 확인 (AWS 계정: 135808943968)
- [ ] 타겟 계정 확인 (@Naru010110)
- [ ] 모든 Lambda 빌드 완료
- [ ] Git 작업 디렉토리 클린 (`git status`)
- [ ] Dry-run으로 변경사항 미리보기 (`pnpm deploy:all:dev:dry`)
- [ ] 실제 배포 + 동기화 (`pnpm deploy:all:dev`)
- [ ] `.env.development` 변경사항 확인 (`git diff frontend/.env.development`)
- [ ] 프론트엔드 재빌드 (`cd frontend && npm run build`)
- [ ] 개발 서버 테스트 (`npm run dev`)

### 프로덕션 환경 배포 전 확인사항:

- [ ] AWS credentials 설정 확인 (Profile: nasun-prod)
- [ ] 프로덕션 계정 확인 (AWS 계정: 466841130170)
- [ ] 타겟 계정 확인 (@Nasun_io)
- [ ] 모든 Lambda 빌드 완료
- [ ] Git 작업 디렉토리 클린 (`git status`)
- [ ] **⚠️ Dry-run으로 변경사항 미리보기 (필수!)** (`pnpm deploy:all:prod:dry`)
- [ ] 실제 배포 + 동기화 (`pnpm deploy:all:prod`)
- [ ] `.env.production` 변경사항 확인 (`git diff frontend/.env.production`)
- [ ] 프론트엔드 프로덕션 빌드 (`cd frontend && npm run build`)
- [ ] 프로덕션 배포 및 테스트

---

## 📞 문의

문제 발생 시:
1. 이 문서의 트러블슈팅 섹션 확인
2. `cdk/README.md` 참고
3. [BUILD_CONFIGURATION_GUIDE.md](BUILD_CONFIGURATION_GUIDE.md) 참고
4. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) 참고
5. GitHub Issues에 버그 리포트

**작성자**: Claude Code
**최종 업데이트**: 2025-10-30 (v2.0.0 - 환경 분리 업데이트)
