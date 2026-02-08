# NASUN 배포 가이드

**Last Updated**: 2026-01-14
**Version**: 2.1.0

이 문서는 NASUN 웹사이트의 개발(Development), 스테이징(Staging), 프로덕션(Production) 배포 과정을 상세하게 설명합니다.

---

## 목차

1. [환경 구성 개요](#1-환경-구성-개요)
2. [환경별 상세 설정](#2-환경별-상세-설정)
3. [사전 요구사항](#3-사전-요구사항)
4. [로컬 개발 환경](#4-로컬-개발-환경-development)
5. [CDK 백엔드 배포](#5-cdk-백엔드-배포)
6. [스테이징 배포](#6-스테이징-배포)
7. [프로덕션 배포](#7-프로덕션-배포)
8. [배포 후 검증](#8-배포-후-검증)
9. [트러블슈팅](#9-트러블슈팅)
10. [긴급 복구 방법](#10-긴급-복구-방법)
11. [FAQ](#11-faq)
12. [배포 스크립트 레퍼런스](#12-배포-스크립트-레퍼런스)

---

## 1. 환경 구성 개요

### AWS 계정 분리 아키텍처

NASUN은 보안과 안정성을 위해 AWS 계정을 완전히 분리하여 운영합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Dev Account                         │
│                        (135808943968)                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐      ┌──────────────────┐                 │
│  │   Development    │      │     Staging      │                 │
│  │   (localhost)    │      │ staging.nasun.io │                 │
│  └────────┬─────────┘      └────────┬─────────┘                 │
│           │                         │                           │
│           └─────────┬───────────────┘                           │
│                     ▼                                           │
│         ┌──────────────────────┐                                │
│         │  Lambda / API Gateway │                               │
│         │  DynamoDB / S3        │                               │
│         │  Step Functions       │                               │
│         └──────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       AWS Prod Account                          │
│                        (466841130170)                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐                                           │
│  │    Production    │                                           │
│  │    nasun.io      │                                           │
│  └────────┬─────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────────┐                                       │
│  │  Lambda / API Gateway │                                      │
│  │  DynamoDB / S3        │                                      │
│  │  Step Functions       │                                      │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 환경별 차이점 요약

| 항목 | Development | Staging | Production |
|------|-------------|---------|------------|
| **URL** | localhost:5174 | staging.nasun.io | nasun.io |
| **AWS 계정** | 135808943968 | 135808943968 | 466841130170 |
| **Lambda/API** | Dev 계정 | Dev 계정 | Prod 계정 |
| **X 타겟 계정** | @Naru010110 | @Naru010110 | @Nasun_io |
| **Ethereum 네트워크** | Sepolia Testnet | Sepolia Testnet | Mainnet |
| **Vite 빌드 모드** | `development` | `staging` | `production` |
| **환경 파일** | .env.development | .env.staging | .env.production |

### 서버 정보

| 환경 | EC2 서버 | SSH 키 | 배포 경로 |
|------|---------|-------|---------|
| Staging | ubuntu@15.165.19.180 | ~/.ssh/.awskey/naru_seoul.pem | /var/www/staging.nasun.io/ |
| Production | ec2-user@43.200.67.52 | ~/.ssh/nasun-prod-key.pem | /var/www/nasun/dist/ |

### ⚠️ 핵심 원칙

1. **환경을 명시적으로 지정**: `pnpm deploy:dev` 또는 `pnpm deploy:prod`
2. **환경 불일치 절대 금지**: 프로덕션 설정으로 개발 계정에 배포 금지
3. **.env 파일 수동 복사 금지**: 배포 스크립트가 자동으로 처리
4. **AWS Profile 자동 지정**: 프로덕션 배포 시 `--profile nasun-prod` 자동 적용

---

## 2. 환경별 상세 설정

### 개발 환경 (Development)

| 항목 | 값 |
|------|-----|
| **X API 타겟 계정** | @Naru010110 |
| **X API 타겟 User ID** | 1863020068785004544 |
| **AWS 계정 ID** | 135808943968 |
| **AWS Profile** | `default` (기본 자격 증명) |
| **API Gateway ID** | bb4zdy0rwe |
| **Secrets Manager** | `nasun-twitter-tokens` |
| **OAuth Client ID** | S1g0aW9HcDZsbDgzSDBDNnFCREI6MTpjaQ |
| **Redirect URI** | http://localhost:5174/callback |
| **OAuth Token 갱신 주기** | 70분 |
| **Log Level** | DEBUG |

### 프로덕션 환경 (Production)

| 항목 | 값 |
|------|-----|
| **X API 타겟 계정** | @Nasun_io |
| **X API 타겟 User ID** | 1936784207453507584 |
| **AWS 계정 ID** | 466841130170 |
| **AWS Profile** | `nasun-prod` |
| **API Gateway ID** | bumvhwfbj4 |
| **Secrets Manager** | `nasun-twitter-tokens-prod` |
| **OAuth Client ID** | Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ |
| **Redirect URI** | https://nasun.io/callback |
| **OAuth Token 갱신 주기** | 70분 |
| **Log Level** | INFO |

### 환경별 DynamoDB 테이블

**개발 환경 (Dev 계정):**
- `nasun-leaderboard-data` - 리더보드 데이터
- `nasun-leaderboard-cumulative-v2` - 누적 데이터
- `UserProfiles` - 사용자 프로필
- `GenesisNftWhitelist` - NFT 화이트리스트
- `MetaMaskAuthNonces` - MetaMask 인증 nonce

**프로덕션 환경 (Prod 계정):**
- 동일한 테이블 구조, 독립적인 데이터

---

## 3. 사전 요구사항

### 필수 도구

```bash
# Node.js (v18+)
node --version

# pnpm (프론트엔드 패키지 관리)
pnpm --version

# AWS CLI (백엔드 배포)
aws --version

# SSH (서버 연결)
ssh -V
```

### AWS CLI 프로필 설정

```bash
# ~/.aws/credentials
[default]
aws_access_key_id = YOUR_DEV_ACCESS_KEY
aws_secret_access_key = YOUR_DEV_SECRET_KEY

[nasun-prod]
aws_access_key_id = YOUR_PROD_ACCESS_KEY
aws_secret_access_key = YOUR_PROD_SECRET_KEY
```

### SSH 키 설정

```bash
# 스테이징 서버용 SSH 키
chmod 400 ~/.ssh/.awskey/naru_seoul.pem

# 프로덕션 서버용 SSH 키
chmod 400 ~/.ssh/nasun-prod-key.pem
```

---

## 4. 로컬 개발 환경 (Development)

### 개발 서버 시작

```bash
cd frontend
pnpm install
pnpm dev
```

**기본 URL**: http://localhost:5174

### 환경 변수 (.env.development)

로컬 개발 시 `.env.development` 파일이 자동으로 로드됩니다.

```env
# 빌드 모드
VITE_ENV=development

# API 엔드포인트 (Dev 계정)
VITE_API_GATEWAY_ID=bb4zdy0rwe

# X (Twitter) 설정
VITE_TARGET_TWEET_ACCOUNT=Naru010110

# Ethereum 설정
VITE_ETHEREUM_CHAIN_ID=11155111  # Sepolia Testnet
VITE_ETHEREUM_NETWORK_NAME=Sepolia
```

### Vite 프록시 설정 (CORS 우회)

개발 환경에서는 Vite 프록시를 통해 CORS 문제를 해결합니다.

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/proxy-price-api': {
        target: 'https://lw5tmx1pz2.execute-api.ap-northeast-2.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-price-api/, '')
      },
      '/proxy-backup-api': {
        target: 'https://lw5tmx1pz2.execute-api.ap-northeast-2.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-backup-api/, '')
      }
    }
  }
})
```

### 개발 vs 빌드 모드 차이

| 항목 | `pnpm dev` | `pnpm build` |
|------|-----------|--------------|
| CORS | Vite 프록시 사용 | 직접 API 호출 |
| 환경 변수 | .env.development | .env.{mode} |
| `import.meta.env.MODE` | "development" | "{mode}" |
| HMR | 활성화 | N/A |

**중요**: `import.meta.env.MODE`를 사용하는 코드는 빌드 모드에 따라 다르게 동작합니다.

---

## 5. CDK 백엔드 배포

### ✅ 권장 명령어 1: CdkStack 배포 (기본)

**리더보드 로직만 변경한 경우 사용**

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 개발 환경 배포
pnpm deploy:dev

# 프로덕션 환경 배포
pnpm deploy:prod
```

**배포 내용:**
- ✅ CdkStack만 배포 (리더보드 Lambda, Step Functions)
- ✅ 모든 Lambda 자동 빌드
- ✅ 환경 변수 자동 전환
- ✅ AWS 자격 증명 검증
- ⏱️ 소요 시간: ~6분

### ⭐ 권장 명령어 2: 통합 배포 + API 동기화 (전체)

**API Gateway URL이 변경될 수 있는 경우 사용 (AuthStack, CommonStack 변경 포함)**

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
```

**배포 내용:**
- ✅ AuthStack + CommonStack + CdkStack 모두 배포
- ✅ 모든 Lambda 자동 빌드
- ✅ 환경 변수 자동 전환
- ✅ AWS 자격 증명 검증
- ✅ **API Gateway 엔드포인트를 프론트엔드 `.env` 파일에 자동 동기화**
- ⏱️ 소요 시간: ~15분

**언제 사용하나요?**
- 인증 시스템 변경 (AuthStack)
- 공통 Lambda 변경 (CommonStack)
- API Gateway 재생성/변경
- 새로운 환경 셋업
- 프론트엔드 API URL이 변경될 가능성이 있는 모든 배포

### ❌ 사용 금지 명령어

```bash
# 환경 미지정 (에러 발생)
pnpm deploy         # ← 에러 메시지 + 가이드 출력
pnpm deploy:all     # ← 에러 메시지 + 가이드 출력

# 구식 명령어 (제거됨)
pnpm deploy:safe           # ← 더 이상 존재하지 않음
pnpm deploy:safe:dev       # ← 제거됨 (deploy:dev 사용)
pnpm deploy:safe:prod      # ← 제거됨 (deploy:prod 사용)

# 빌드 누락 위험
pnpm cdk deploy            # ← auth-twitter 빌드 누락 시 502 에러

# .env 파일 수동 복사 (금지!)
cp .env.development .env   # ← 스크립트가 자동 처리
pnpm cdk deploy
```

### 배포 프로세스 상세

**배포 스크립트 자동 실행 단계:**

```
🔨 Step 1/6: 모든 Lambda 함수 빌드 중...
├── auth-twitter (npm)
├── wallet-api (pnpm)
└── PriceAPI (pnpm)

🔍 Step 2/6: 빌드 결과 검증 중...
├── auth-twitter: index.js, login.js, callback.js 확인
└── pnpm symlink 체크 (auth-twitter에서 npm 강제)

🔄 Step 3/6: 환경 변수 로드 중...
├── .env 백업 (.env.backup)
└── .env.{environment} → .env 복사

🔍 Step 4/6: 환경 변수 및 AWS 자격 증명 검증 중...
├── X_TARGET_USERNAME 확인
├── TWITTER_TOKENS_SECRET_NAME 확인
└── AWS 계정 확인

🔍 Step 5/6: CDK Synth (검증) 중...
└── CloudFormation 템플릿 생성 검증

📊 CDK Diff (변경사항 확인)...
└── 변경될 리소스 목록 표시

⚠️  {environment} 환경에 배포하시겠습니까? (y/N): y

🚀 Step 6/6: CDK 배포 시작...
└── pnpm cdk deploy CdkStack [--profile nasun-prod] --require-approval never
```

### API 엔드포인트 동기화

백엔드 배포 후 프론트엔드 환경 변수를 동기화합니다.

```bash
cd cdk
pnpm sync:endpoints        # 즉시 동기화
pnpm sync:endpoints:dry    # 변경사항 미리보기
```

**상세 가이드**: [doc/API_ENDPOINT_SYNC_GUIDE.md](API_ENDPOINT_SYNC_GUIDE.md)

---

## 6. 스테이징 배포

### 배포 스크립트 실행

```bash
# 일반 배포
./deploy_staging.sh

# 드라이런 (빌드만 테스트)
./deploy_staging.sh --dry-run

# 도움말
./deploy_staging.sh --help
```

### 배포 과정

```
Phase 1/6: 환경 검증
  ✅ SSH 키 확인
  ✅ EC2 연결 테스트
  ✅ .env.staging 파일 확인

Phase 2/6: TypeScript 타입 체크
  ✅ npx tsc --noEmit

Phase 3/6: 스테이징 빌드
  ✅ pnpm vite build --mode staging
  ✅ .env.staging 사용

Phase 4/6: 파일 배포
  ✅ rsync로 EC2에 동기화

Phase 5/6: Nginx 재시작
  ✅ sudo nginx -t && sudo systemctl reload nginx

Phase 6/6: 헬스 체크
  ✅ curl https://staging.nasun.io
  ⚠️ HTTP 401은 정상 (htaccess 보호)
```

### 검증 절차

배포 완료 후 확인 사항:

1. **사이트 접속**: https://staging.nasun.io (htaccess 인증 필요)
2. **콘솔 에러**: F12 → Console 탭 확인
3. **API 연결**: Network 탭에서 API 요청 확인
4. **주요 기능 테스트**:
   - 로그인 (Google, Twitter, MetaMask)
   - 리더보드 데이터 로딩
   - NFT 가격 표시

---

## 7. 프로덕션 배포

### 배포 스크립트 실행

```bash
# 드라이런 (권장! 먼저 테스트)
./deploy_production.sh --dry-run

# 일반 배포 (확인 프롬프트 포함)
./deploy_production.sh

# 확인 없이 즉시 배포
./deploy_production.sh --force

# 롤백 (문제 발생 시)
./deploy_production.sh --rollback
```

### 배포 과정

```
Phase 1/7: 환경 검증
  ✅ SSH 키 확인
  ✅ EC2 연결 테스트
  ✅ .env.production 파일 확인

Phase 2/7: 빌드 전 검사
  ✅ TypeScript 타입 체크

Phase 3/7: 프로덕션 빌드
  ✅ pnpm build
  ✅ .env.production 사용

Phase 4/7: 현재 배포본 백업
  ✅ /var/www/nasun/backups/backup_YYYYMMDD_HHMMSS

Phase 5/7: 파일 배포
  ✅ rsync로 EC2에 동기화

Phase 6/7: Nginx 재시작
  ✅ sudo nginx -t && sudo systemctl reload nginx

Phase 7/7: 헬스 체크
  ✅ curl https://nasun.io (Basic Auth 포함)
```

### 롤백 절차

문제 발생 시 이전 버전으로 즉시 롤백:

```bash
./deploy_production.sh --rollback
```

**롤백 과정**:
1. 가장 최근 백업 찾기
2. 확인 프롬프트 표시
3. 백업 복원
4. Nginx 재시작

### 백업 관리

- **위치**: `/var/www/nasun/backups/`
- **형식**: `backup_YYYYMMDD_HHMMSS`
- **보관**: 최근 5개만 유지 (자동 정리)

---

## 8. 배포 후 검증

### Lambda 환경 변수 검증

```bash
# 개발 환경
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --query 'Environment.Variables.[X_TARGET_USERNAME, TWITTER_TOKENS_SECRET_NAME]'
# 예상 결과: ["Naru010110", "nasun-twitter-tokens-dev"]

# 프로덕션 환경
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --profile nasun-prod \
  --region ap-northeast-2 \
  --query 'Environment.Variables.[X_TARGET_USERNAME, TWITTER_TOKENS_SECRET_NAME]'
# 예상 결과: ["Nasun_io", "nasun-twitter-tokens-prod"]
```

### Lambda 최종 업데이트 시간 확인

```bash
aws lambda get-function \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --query 'Configuration.LastModified'
# 배포 직후 시간인지 확인
```

### 파이프라인 수동 실행

```bash
# 개발 환경
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-2:135808943968:stateMachine:nasun-leaderboard-pipeline" \
  --name "manual-test-$(date +%Y%m%d-%H%M%S)" \
  --region ap-northeast-2

# 프로덕션 환경
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-2:466841130170:stateMachine:nasun-leaderboard-pipeline" \
  --name "manual-test-$(date +%Y%m%d-%H%M%S)" \
  --profile nasun-prod \
  --region ap-northeast-2
```

---

## 9. 트러블슈팅

### 문제 1: "❌ 배포 환경을 명시적으로 지정해주세요" 에러

**증상**:
```bash
$ pnpm deploy

❌ 배포 환경을 명시적으로 지정해주세요:

  📦 개발 환경 배포:
    pnpm deploy:dev

  🚀 프로덕션 환경 배포:
    pnpm deploy:prod
```

**원인**: 환경을 지정하지 않고 `pnpm deploy` 실행

**해결 방법**:
```bash
pnpm deploy:dev    # 개발 환경
pnpm deploy:prod   # 프로덕션 환경
```

### 문제 2: "❌ 오류: AWS 계정 불일치" 에러

**증상**:
```bash
❌ 오류: AWS 계정 불일치
  예상 계정 (production): 466841130170
  현재 계정: 135808943968
```

**원인**: 프로덕션 배포를 시도했지만 AWS CLI가 개발 계정 자격 증명 사용 중

**해결 방법**:

1. **프로덕션 AWS Profile 설정 확인**:
```bash
aws configure --profile nasun-prod
# AWS Access Key ID: (프로덕션 계정 키 입력)
# AWS Secret Access Key: (프로덕션 계정 시크릿 입력)
# Default region name: ap-northeast-2
```

2. **Profile 테스트**:
```bash
aws sts get-caller-identity --profile nasun-prod
# "Account": "466841130170"이 나와야 함
```

3. **재배포**:
```bash
pnpm deploy:prod
```

### 문제 3: Lambda가 잘못된 타겟 계정 데이터 수집 시도

**증상**:
```bash
Error: [searchRecentTweets(@Nasun_io -is:retweet)] 3회 재시도 실패: Request failed with code 401
```

**원인**: Lambda 환경 변수가 프로덕션 설정으로 되어 있음

**확인 방법**:
```bash
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --query 'Environment.Variables.X_TARGET_USERNAME'
# "Nasun_io"가 나오면 문제! (개발 환경에서는 "Naru010110"이어야 함)
```

**해결 방법**:
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
pnpm deploy:dev
```

### 문제 4: auth-twitter Lambda에서 "Cannot find module" 에러

**증상**:
```bash
# Twitter 로그인 시 502 Bad Gateway
```

**원인**: auth-twitter Lambda가 빌드되지 않았거나 pnpm symlink 문제

**해결 방법**:
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk/lambda-src/auth-twitter

# pnpm symlink 제거
rm -rf node_modules package-lock.json

# npm으로 재설치
npm install

# 빌드
npm run build

# 재배포
cd ../../
pnpm deploy:dev  # 또는 deploy:prod
```

**예방책**: `deploy:dev` / `deploy:prod` 스크립트를 사용하면 자동으로 감지 및 처리됨

### 문제 5: CORS 에러

**증상**: 브라우저 콘솔에 CORS 에러 표시
```
Access to fetch at 'https://api...' from origin 'https://staging.nasun.io'
has been blocked by CORS policy
```

**원인 1**: 잘못된 빌드 모드
```bash
# 잘못된 예시 (development 모드로 빌드)
pnpm vite build --mode development  # ❌ Vite 프록시 경로 사용

# 올바른 예시
pnpm vite build --mode staging     # ✅ 직접 API 호출
```

**원인 2**: Lambda CORS 헤더 누락

Lambda 함수에 CORS 헤더가 설정되어 있는지 확인:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};
```

### 문제 6: SSH 연결 실패

**증상**: EC2 연결 테스트 실패
```bash
❌ EC2 서버에 연결할 수 없습니다
```

**해결 방법**:

1. SSH 키 권한 확인:
```bash
chmod 400 ~/.ssh/nasun-prod-key.pem
```

2. EC2 보안 그룹에서 IP 허용 확인

3. 직접 연결 테스트:
```bash
ssh -i ~/.ssh/nasun-prod-key.pem ec2-user@43.200.67.52
```

---

## 10. 긴급 복구 방법

### 잘못된 환경에 배포한 경우

**시나리오**: 프로덕션 설정으로 개발 환경에 배포함

**복구 절차**:

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 1. 올바른 환경으로 즉시 재배포
pnpm deploy:dev

# 2. Lambda 환경 변수 검증
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --query 'Environment.Variables.[X_TARGET_USERNAME, TWITTER_TOKENS_SECRET_NAME]'

# 3. 파이프라인 재실행 (데이터 수집 정상화)
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-2:135808943968:stateMachine:nasun-leaderboard-pipeline" \
  --name "recovery-$(date +%Y%m%d-%H%M%S)" \
  --region ap-northeast-2

# 4. 실행 상태 모니터링
aws stepfunctions describe-execution \
  --execution-arn <EXECUTION_ARN> \
  --region ap-northeast-2 \
  --query 'status'
```

### 배포 스크립트 실행 중 중단된 경우

**복구 절차**:

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 1. .env 파일 상태 확인
cat .env | grep "^ENVIRONMENT="

# 2. 백업 파일 확인
if [ -f .env.backup ]; then
  echo "백업 파일 존재"
  cat .env.backup | grep "^ENVIRONMENT="
fi

# 3. .env 복원 (필요 시)
cp .env.backup .env

# 4. 재배포
pnpm deploy:dev  # 또는 deploy:prod
```

---

## 11. FAQ

### Q1: 개발 환경과 프로덕션 환경을 어떻게 구분하나요?

**A**: AWS 계정 ID로 구분합니다.
- 개발: 135808943968 (AWS CLI 기본 자격 증명)
- 프로덕션: 466841130170 (AWS CLI `--profile nasun-prod`)

배포 스크립트가 자동으로 AWS 자격 증명을 확인하여 환경 불일치를 방지합니다.

### Q2: `.env` 파일을 직접 수정해도 되나요?

**A**: 아니요! `.env.development` 또는 `.env.production` 파일을 수정하세요.

- ✅ `.env.development` 수정 → `pnpm deploy:dev` 실행
- ✅ `.env.production` 수정 → `pnpm deploy:prod` 실행
- ❌ `.env` 직접 수정 (배포 시 덮어씌워짐)

### Q3: 배포 후 `.env` 파일이 어떤 환경으로 남아있나요?

**A**: 배포 스크립트 종료 시 선택할 수 있습니다.

```bash
🔄 .env 파일을 원래대로 복원하시겠습니까? (y/N):
```

- `y` 입력: 원래 .env 파일로 복원 (권장)
- `n` 입력: 배포한 환경 설정 유지

### Q4: 프로덕션 배포 시 승인 프롬프트를 건너뛸 수 있나요?

**A**: 아니요, 프로덕션 배포는 항상 수동 승인이 필요합니다.

```bash
⚠️  production 환경에 배포하시겠습니까? (y/N): y
```

이는 실수로 프로덕션에 배포하는 것을 방지하기 위한 안전장치입니다.

### Q5: 여러 스택을 동시에 배포할 수 있나요?

**A**: 기본 배포 명령어는 `CdkStack`만 배포합니다. 여러 스택 배포 방법:

**방법 1: 통합 배포 명령어 (권장 ⭐)**
```bash
# 개발 환경: AuthStack + CommonStack + CdkStack + API 동기화
pnpm deploy:all:dev

# 프로덕션 환경: AuthStack + CommonStack + CdkStack + API 동기화
pnpm deploy:all:prod
```

**방법 2: 개별 스택 수동 배포**
```bash
# AuthStack만 배포 (개발 환경)
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
cp .env.development .env
pnpm cdk deploy AuthStack --require-approval never
```

### Q6: 환경 변수 변경 후 배포가 필요한가요?

**A**: 네! 환경 변수 변경 후 반드시 재배포해야 Lambda에 반영됩니다.

```bash
# .env.development 수정 후
pnpm deploy:dev

# Lambda 환경 변수 확인
aws lambda get-function-configuration \
  --function-name nasun-leaderboard-generator \
  --region ap-northeast-2 \
  --query 'Environment.Variables'
```

### Q7: OAuth Token 갱신 주기는 어떻게 되나요?

**A**: EventBridge 스케줄러가 **70분** 주기로 자동 갱신합니다.
- Secrets Manager 재시도: 5회 (Exponential Backoff)
- 토큰 만료 시간: ~2시간
- 갱신 버퍼: 충분한 여유 시간 확보

---

## 12. 배포 스크립트 레퍼런스

### deploy_staging.sh

| 옵션 | 설명 |
|------|------|
| (없음) | 일반 배포 |
| `--dry-run` | 빌드만 수행, 배포 건너뛰기 |
| `--help` | 도움말 표시 |

**기능**:
- ✅ SSH 키 검증
- ✅ EC2 연결 테스트
- ✅ TypeScript 타입 체크
- ✅ 스테이징 빌드 (--mode staging)
- ✅ rsync 배포
- ✅ Nginx 재시작
- ✅ 헬스 체크 (HTTP 401은 정상 - htaccess 보호)
- ✅ 컬러 출력 및 진행 상황 표시

### deploy_production.sh

| 옵션 | 설명 |
|------|------|
| (없음) | 일반 배포 (확인 프롬프트 포함) |
| `--dry-run` | 빌드만 수행, 배포 건너뛰기 |
| `--force` | 확인 없이 즉시 배포 |
| `--rollback` | 이전 버전으로 롤백 |

**기능**:
- ✅ SSH 키 검증
- ✅ EC2 연결 테스트
- ✅ TypeScript 타입 체크
- ✅ 프로덕션 빌드 (--mode production)
- ✅ 자동 백업 (최근 5개 유지)
- ✅ rsync 배포
- ✅ Nginx 재시작
- ✅ 헬스 체크 (Basic Auth 포함)
- ✅ 롤백 기능
- ✅ 컬러 출력 및 진행 상황 표시

### CDK 배포 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm deploy:dev` | 개발 환경 CdkStack 배포 |
| `pnpm deploy:prod` | 프로덕션 환경 CdkStack 배포 |
| `pnpm deploy:all:dev` | 개발 환경 전체 스택 + API 동기화 |
| `pnpm deploy:all:prod` | 프로덕션 환경 전체 스택 + API 동기화 |
| `pnpm deploy:all:dev:dry` | 개발 환경 Dry-run |
| `pnpm deploy:all:prod:dry` | 프로덕션 환경 Dry-run |
| `pnpm sync:endpoints` | API 엔드포인트 동기화 |
| `pnpm sync:endpoints:dry` | 동기화 Dry-run |

---

## 관련 문서

- [API 엔드포인트 동기화 가이드](API_ENDPOINT_SYNC_GUIDE.md)
- [CSP 설정 가이드](CSP_CONFIGURATION_GUIDE.md)
- [빌드 설정 가이드](BUILD_CONFIGURATION_GUIDE.md)
- [Lambda 생성 가이드](LAMBDA_CREATION_GUIDE.md)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| 1.0.0 | 2025-12-13 | 최초 작성 |
| 2.0.0 | 2025-12-13 | DEPLOYMENT_ENVIRONMENT_GUIDE.md 통합, OAuth 70분 주기 업데이트 |
