# Lambda 함수 생성 가이드

> **작성일**: 2025-10-07
> **최종 업데이트**: 2025-10-31 (v2.0.0)
> **목적**: 새로운 Lambda 함수 생성 시 표준 절차 및 베스트 프랙티스

---

## 🎯 핵심 원칙

### 1. **Single Entry Point 패턴 권장**
- 대부분의 Lambda는 `src/index.ts` 하나로 충분
- Handler: `index.handler` (고정)
- Asset Path: `lambda-src/{lambda-name}/dist`

### 2. **Multi Entry Point는 예외적으로**
- 다수의 핸들러가 필요한 경우 (예: leaderboard-v3)
- 각 핸들러가 독립적인 기능을 수행

### 3. **Handler 경로 불일치 방지**
- `handler: "index.handler"` (✅)
- `handler: "dist/index.handler"` (❌ dist는 assetPath에 포함)
- 배포 전 자동 검증: `pnpm run verify-handlers`

---

## 🚀 Step-by-Step 가이드

### Step 1: 🥞 스택(Stack) 결정하기

새로운 Lambda 함수를 추가하기 전, **어떤 스택에 포함할지** 먼저 결정해야 합니다. 프로젝트는 기능에 따라 여러 스택으로 분리되어 있습니다.

| 스택 이름 | `lib/` 경로 | 담당 기능 | 언제 이 스택을 선택하나요? |
|---|---|---|---|
| **CdkStack** | `cdk-stack.ts` | X(트위터) 리더보드 | 리더보드 데이터 수집, 점수 계산, 순위 생성 등 리더보드 핵심 기능과 직접 관련된 함수를 추가할 때 |
| **CommonStack** | `common-stack.ts` | 공용 인프라 | 여러 서비스에서 공통으로 사용할 수 있는 기능 (NFT 공급량, 가격, 사용자 프로필, 계정 관리 등)을 추가할 때 |
| **NftEventStack** | `nft-event-stack.ts` | NFT 이벤트 | 특정 NFT 이벤트(예: 화이트리스트 신청, 자격 검증)와 관련된 독립적인 기능을 추가할 때 |
| **AuthStack** | `auth-stack.ts` | 인증 | 트위터, 구글, 지갑 등 사용자 인증/로그인과 관련된 기능을 추가하거나 수정할 때 |

**결정했다면, 해당 스택의 `.ts` 파일을 수정 대상으로 선택합니다.** (예: `lib/common-stack.ts`)

---


### Step 2: 템플릿 복사

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk/lambda-src
cp -r template-lambda my-new-lambda
cd my-new-lambda
```

### Step 3: package.json 수정

```bash
vim package.json
```

```json
{
  "name": "my-new-lambda",
  "description": "My new Lambda function description",
  "version": "1.0.0"
}
```

### Step 4: 비즈니스 로직 구현

```bash
vim src/index.ts
```

```typescript
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // TODO: 여기에 비즈니스 로직 구현
  const result = await yourBusinessLogic(event);
  
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

### Step 5: 의존성 설치 및 빌드

```bash
# 의존성 설치
npm install

# 타입 체크
npm run typecheck

# 빌드
npm run build

# 결과 확인
ls -lh dist/
# 출력: index.js, index.js.map
```

### Step 6: CDK에 Lambda 정의 추가

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
# Step 1에서 결정한 스택 파일을 엽니다.
vim lib/common-stack.ts 
```

```typescript
// Lambda Function 생성
const myNewFunction = new lambda.Function(this, "MyNewFunction", {
  functionName: "my-new-lambda",
  runtime: lambda.Runtime.NODEJS_20_X,  // ✅ 항상 최신 런타임 사용
  handler: "index.handler",  // ⚠️ 항상 "index.handler"
  code: lambda.Code.fromAsset("lambda-src/my-new-lambda/dist"),
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
  environment: {
    TABLE_NAME: myTable.tableName,
    // 기타 환경 변수
  }
});

// 권한 부여 (필요시)
myTable.grantReadWriteData(myNewFunction);
```

### Step 7: Handler 검증

```bash
# 이 스크립트는 모든 스택의 Lambda를 검증합니다.
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
pnpm run verify-handlers
```

### Step 8: 배포 및 테스트

```bash
# 환경별 배포 (권장 ⭐)
# cdk/ 디렉토리에서 실행
pnpm deploy:dev         # 개발 환경 배포

# 프로덕션 배포가 필요할 경우
# pnpm deploy:prod

# Lambda 함수 테스트 (개발 환경)
aws lambda invoke \
  --function-name my-new-lambda \
  --payload '{\"test\": \"data\"}' \
  /tmp/result.json && cat /tmp/result.json

# Lambda 함수 테스트 (프로덕션 환경)
aws lambda invoke \
  --function-name my-new-lambda \
  --profile nasun-prod \
  --payload '{\"test\": \"data\"}' \
  /tmp/result.json && cat /tmp/result.json
```

**💡 Tip**: `pnpm deploy:dev` 스크립트가 빌드, 검증, 환경 변수 로드 등 모든 과정을 자동으로 처리해줍니다.

---

## ⚠️ 흔한 실수 및 해결 방법

### 실수 1: Handler 경로에 "dist/" 포함

```typescript
// ❌ 잘못됨
handler: "dist/index.handler"
code: lambda.Code.fromAsset("lambda-src/my-lambda/dist")

// ✅ 올바름
handler: "index.handler"
code: lambda.Code.fromAsset("lambda-src/my-lambda/dist")
```

**이유**: `fromAsset("dist")`가 이미 dist 디렉토리를 가리킴. handler는 dist 내부의 상대 경로만 필요.

### 실수 2: assetPath가 src 디렉토리

```typescript
// ❌ 잘못됨
code: lambda.Code.fromAsset("lambda-src/my-lambda/src")

// ✅ 올바름
code: lambda.Code.fromAsset("lambda-src/my-lambda/dist")
```

**이유**: Lambda는 빌드된 JavaScript를 실행. TypeScript 소스는 실행 불가.

### 실수 3: 잘못된 배포 명령어 사용

```bash
# ❌ 잘못됨 (빌드 누락 + 환경 불일치 위험)
cd cdk && pnpm cdk deploy

# ❌ 잘못됨 (환경 미지정)
cd cdk && pnpm deploy

# ✅ 올바름 (권장 ⭐)
cd cdk && pnpm deploy:dev     # 개발 환경 배포 (자동 빌드)
# 또는
cd cdk && pnpm deploy:prod    # 프로덕션 환경 배포 (자동 빌드)
```

**💡 배포 스크립트가 자동으로 처리하는 작업:**
- ✅ 모든 Lambda 함수 빌드
- ✅ 빌드 결과 검증
- ✅ 환경 변수 자동 전환 (`.env.development` 또는 `.env.production`)
- ✅ AWS 자격 증명 검증

**수동 빌드가 필요한 경우:**
```bash
# 특정 Lambda만 빌드
cd lambda-src/my-lambda && npm run build
cd ../../

# 또는 전체 Lambda 빌드
cd cdk && bash scripts/pre-deploy.sh
```

---

## 📚 참고 문서

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 환경별 배포 가이드 ⭐ **필독!**
- [BUILD_CONFIGURATION_GUIDE.md](./BUILD_CONFIGURATION_GUIDE.md) - 빌드 설정 상세
- [API_ENDPOINT_SYNC_GUIDE.md](./API_ENDPOINT_SYNC_GUIDE.md) - API 엔드포인트 자동 동기화
- [WALLET_API_MIGRATION_AND_HANDLER_STANDARDIZATION.md](./WALLET_API_MIGRATION_AND_HANDLER_STANDARDIZATION.md) - 표준화 전략
- [DEBUGGING_DEPLOYMENT_GUIDE.md](./DEBUGGING_DEPLOYMENT_GUIDE.md) - 배포 디버깅