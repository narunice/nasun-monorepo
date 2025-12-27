# Lambda Function Template

이 디렉토리는 새로운 Lambda 함수를 생성할 때 사용하는 표준 템플릿입니다.

## 특징

- **Single Entry Point 패턴**: 모든 로직이 `src/index.ts`의 `handler` 함수로 시작
- **esbuild 빌드**: 빠른 빌드와 최적화된 번들링
- **TypeScript 지원**: 타입 안전성과 IntelliSense
- **표준 구조**: 모든 Lambda가 동일한 패턴 사용

## 사용 방법

### 1. 템플릿 복사

```bash
# cdk/lambda-src/ 디렉토리에서
cp -r template-lambda my-new-lambda
cd my-new-lambda
```

### 2. package.json 수정

```json
{
  "name": "my-new-lambda",
  "description": "설명을 여기에 입력"
}
```

### 3. 비즈니스 로직 구현

`src/index.ts` 파일을 열어 `handler` 함수 내부의 TODO 주석을 찾아 로직을 구현하세요.

### 4. 빌드 및 테스트

```bash
# 의존성 설치
npm install

# 타입 체크
npm run typecheck

# 빌드
npm run build

# 프로덕션 빌드 (최적화)
npm run build:prod
```

### 5. CDK에 Lambda 추가

`cdk/lib/cdk-stack.ts`에 Lambda 정의를 추가하세요:

```typescript
const myNewFunction = new lambda.Function(this, "MyNewFunction", {
  functionName: "my-new-lambda",
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: "index.handler",  // ⚠️ 항상 "index.handler"
  code: lambda.Code.fromAsset("lambda-src/my-new-lambda/dist"),
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
  environment: {
    // 환경 변수
  }
});
```

## 주의사항

### ✅ 올바른 핸들러 경로

```typescript
handler: "index.handler",  // ✅ 올바름
code: lambda.Code.fromAsset("lambda-src/my-new-lambda/dist")
```

### ❌ 흔한 실수

```typescript
// ❌ 잘못됨: handler에 dist/ 포함
handler: "dist/index.handler"

// ❌ 잘못됨: assetPath가 src
code: lambda.Code.fromAsset("lambda-src/my-new-lambda/src")
```

## 파일 구조

```
my-new-lambda/
├── src/
│   └── index.ts        # 핸들러 함수 (진입점)
├── dist/               # 빌드 결과물 (git ignore)
│   ├── index.js
│   └── index.js.map
├── build.js            # esbuild 설정
├── package.json        # 패키지 정의 및 스크립트
├── tsconfig.json       # TypeScript 설정
└── README.md           # 이 파일
```

## 더 복잡한 구조가 필요한 경우

여러 핸들러가 필요한 경우 (예: x-leaderboard처럼 28개 핸들러):

1. `src/handlers/` 디렉토리 생성
2. `build.js`에서 `entryPoints` 배열로 변경
3. 각 핸들러마다 별도의 출력 파일 생성

하지만 **대부분의 경우 single entry point로 충분합니다**.
