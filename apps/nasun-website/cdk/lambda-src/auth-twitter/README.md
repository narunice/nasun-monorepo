# Twitter OAuth Lambda

Twitter OAuth 2.0 인증을 처리하는 Lambda 함수입니다.

## ⚠️ 중요: 배포 전 필수 사항

이 Lambda 함수는 **TypeScript 컴파일이 필수**입니다.

### 배포 전 반드시 실행

```bash
npm run build
```

또는 빌드 스크립트 사용:

```bash
bash build.sh
```

### 빌드 누락 시 발생하는 문제

❌ **502 Bad Gateway** 에러 발생
❌ **Runtime.ImportModuleError** - node_modules를 찾을 수 없음
❌ 트위터 로그인 기능 작동 불가

## 디렉토리 구조

```
auth-twitter/
├── index.ts              # 메인 핸들러 (라우팅)
├── src/
│   ├── handlers/
│   │   ├── login.ts      # OAuth 로그인 시작
│   │   └── callback.ts   # OAuth 콜백 처리
│   └── utils/
│       ├── secrets.ts    # Secrets Manager 연동
│       ├── session-manager.ts  # DynamoDB 세션 관리
│       ├── twitter-api.ts      # Twitter API 호출
│       ├── cognito.ts          # Cognito 연동
│       └── pkce.ts             # PKCE 생성
├── package.json
├── tsconfig.json
├── build.sh              # 빌드 스크립트
└── README.md            # 이 파일
```

## 빌드 프로세스

### 1. TypeScript 컴파일

```bash
npm run build
```

실행 결과:
- `*.ts` 파일들이 `*.js`로 컴파일됨
- `src/handlers/*.js` 파일 생성
- `src/utils/*.js` 파일 생성
- `index.js` 파일 생성

### 2. 의존성 관리

**중요:** npm을 사용해야 합니다 (pnpm 사용 금지)

```bash
# 의존성 재설치 (pnpm에서 npm으로 전환 시)
rm -rf node_modules package-lock.json
npm install
```

#### 왜 npm을 사용해야 하나요?

- pnpm은 symlink를 사용하여 node_modules를 구성
- CDK Asset 패키징 시 symlink가 제대로 복사되지 않음
- Lambda 런타임에서 node_modules를 찾을 수 없어 에러 발생

## 배포

### 로컬에서 배포 (CDK 프로젝트 루트에서)

```bash
# 1. auth-twitter 빌드
cd lambda-src/auth-twitter
npm run build
cd ../..

# 2. CDK 배포
pnpm cdk deploy CdkStack --require-approval never
```

### 자동화된 배포 (권장)

CDK 프로젝트 루트에서:

```bash
# 모든 Lambda 빌드 + 배포
pnpm run deploy:safe
```

이 명령어는:
1. `scripts/build-all-lambdas.sh` 실행 (auth-twitter 포함)
2. CDK 배포 실행
3. 배포 전 핸들러 검증 자동 실행

## 검증

### 배포 후 확인

```bash
# Lambda 함수 최신 버전 확인
aws lambda get-function \
  --function-name CdkStack-TwitterAuthLambdaEB81C7F7-XXXXX \
  --region ap-northeast-2 \
  --query 'Configuration.LastModified'

# API 엔드포인트 테스트
curl https://API_ID.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter/login
```

### 정상 응답 예시

```json
{
  "authUrl": "https://twitter.com/i/oauth2/authorize?...",
  "sessionId": "fc9f5a319227f3a069cbb3d9d2f38849",
  "state": "e8a1316f6be4b4d6b6d3ffb707f29fba..."
}
```

### 에러 발생 시

#### 502 Bad Gateway

**원인:** TypeScript 컴파일 누락

**해결책:**
```bash
cd lambda-src/auth-twitter
npm run build
cd ../..
pnpm cdk deploy CdkStack --require-approval never
```

#### Runtime.ImportModuleError

**원인:** node_modules가 제대로 패키징되지 않음 (pnpm symlink 문제)

**해결책:**
```bash
cd lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../..
pnpm cdk deploy CdkStack --require-approval never
```

## 환경 변수

Lambda 함수는 다음 환경 변수를 사용합니다:

- `SECRET_NAME`: `nasun-twitter-tokens` (Secrets Manager에 저장된 Twitter API 키)
- `SESSIONS_TABLE_NAME`: OAuth 세션을 저장하는 DynamoDB 테이블
- `USER_PROFILES_TABLE`: 사용자 프로필을 저장하는 DynamoDB 테이블
- `COGNITO_IDENTITY_POOL_ID`: Cognito Identity Pool ID
- `COGNITO_DEVELOPER_PROVIDER_NAME`: `nasun.io` (Cognito 개발자 제공자 이름)
- `OAUTH2_CLIENT_ID`: Twitter OAuth 클라이언트 ID
- `OAUTH2_CLIENT_SECRET`: Twitter OAuth 클라이언트 시크릿

이 환경 변수들은 `cdk-stack.ts`에서 자동으로 설정됩니다.

**⚠️ 중요**:
- Secret 이름은 반드시 `nasun-twitter-tokens`이어야 합니다 (v2 없음!)
- AWS Secrets Manager에 동일한 이름의 Secret이 존재해야 합니다
- Secret 이름 불일치 시 `Could not retrieve secrets` 에러 발생

## API 엔드포인트

### GET /auth/twitter/login

OAuth 로그인 프로세스를 시작합니다.

**응답:**
```json
{
  "authUrl": "https://twitter.com/i/oauth2/authorize?...",
  "sessionId": "session-id",
  "state": "state-value"
}
```

### POST /auth/twitter/callback

Twitter OAuth 콜백을 처리하고 Cognito 토큰을 생성합니다.

**요청:**
```json
{
  "code": "oauth-code",
  "state": "state-value"
}
```

**응답:**
```json
{
  "token": "cognito-token",
  "identityId": "identity-id",
  "user": {
    "twitterId": "123456789",
    "username": "user123",
    "displayName": "User Name"
  }
}
```

## 개발

### TypeScript 컴파일 watch 모드

```bash
npm run watch
```

파일 변경 시 자동으로 재컴파일됩니다.

### 로컬 테스트

```bash
# 의존성 설치
npm install

# 컴파일
npm run build

# 컴파일된 파일 확인
ls -la index.js src/handlers/*.js src/utils/*.js
```

## 트러블슈팅

### 문제: 로그인 버튼 클릭 시 502 에러

1. Lambda 로그 확인:
```bash
aws logs tail CdkStack-TwitterAuthLambdaLogGroup-XXXXX \
  --region ap-northeast-2 \
  --since 5m
```

2. Runtime.ImportModuleError 확인
3. 로컬에서 재빌드 및 재배포

### 문제: 배포 후에도 변경사항 반영 안 됨

1. CDK Asset 캐시 삭제:
```bash
rm -rf cdk.out
```

2. Lambda 재빌드:
```bash
cd lambda-src/auth-twitter
rm -rf node_modules dist
npm install
npm run build
```

3. 재배포:
```bash
cd ../..
pnpm cdk deploy CdkStack --require-approval never --force
```

## 재발 방지

이 문서와 빌드 스크립트를 작성한 이유:

✅ Git log에서 "트위터 로그인 복구" 커밋이 반복적으로 나타남
✅ 근본 원인: TypeScript 컴파일 누락
✅ 해결: 자동화된 빌드 프로세스 + 배포 전 검증

### 이제 방지된 문제들

- ✅ TypeScript 컴파일 누락으로 인한 502 에러
- ✅ pnpm symlink로 인한 node_modules 패키징 실패
- ✅ 배포 전 검증 누락으로 인한 반복적인 에러

## 관련 문서

- [CDK Build Configuration Guide](../../doc/BUILD_CONFIGURATION_GUIDE.md)
- [Lambda Creation Guide](../../doc/LAMBDA_CREATION_GUIDE.md)
- [Debugging Deployment Guide](../../doc/DEBUGGING_DEPLOYMENT_GUIDE.md)
