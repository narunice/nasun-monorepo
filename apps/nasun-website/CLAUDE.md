# CLAUDE.md (apps/nasun-website)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

**Last Updated**: 2026-01-19
**Version**: 2.19.0 (navigation restructure)

## 기본 규칙

- 문서로 저장해달라는 프롬프트를 받으면 별도의 주문이 없는 이상 항상 `doc/` 경로에 저장하세요.

---

## 📋 목차

1. [⚠️ 배포 및 디버깅 필독사항](#배포-및-디버깅-필독사항)
2. [프로젝트 개요](#프로젝트-개요)
3. [기술 스택](#기술-스택)
4. [프로젝트 구조](#프로젝트-구조)
5. [주요 기능](#주요-기능)
6. [인증 시스템](#인증-시스템)
7. [개발 워크플로우](#개발-워크플로우)
8. [배포 프로세스](#배포-프로세스)
9. [트러블슈팅](#트러블슈팅)
10. [문서 참조](#문서-참조)

---

## ⚠️ 배포 및 디버깅 필독사항

### 🎯 최근 업데이트 이력 ⭐ **필독!**

#### 📅 2026-01-24: Legacy Leaderboard V2 분리 ✅

**작업 일시**: 2026-01-24
**작업 유형**: 리팩토링 및 앱 분리
**심각도**: Low

---

**내용**: 기존 `nasun-website`에 포함되어 있던 Legacy Leaderboard V2 코드가 `apps/x-leaderboard-v2-legacy`로 완전히 분리되었습니다.
관련 문서는 해당 앱의 `docs/` 폴더로 이동되었습니다.

---

#### 📅 2026-01-19: 네비게이션 메뉴 구조 개편 및 라우트 변경 (최신) ✅

**작업 일시**: 2026-01-19
**작업 유형**: UX 개선 + 라우팅 구조 변경
**심각도**: Medium (URL 구조 변경)

---

**목적**: 직관적인 네비게이션 구조로 개편하여 Nasun의 구조를 사용자에게 더 명확하게 전달

**메뉴 이름 및 순서 변경**:
| 기존 | 변경 후 | 라우트 |
|------|---------|--------|
| Protocol | Network | `/network` |
| IPs | IP | `/ip` |
| Finance | Ecosystem | `/ecosystem` |

**라우트 구조 재설계**:
| 기존 경로 | 새로운 경로 | 페이지 |
|-----------|-------------|--------|
| `/protocol/*` | `/network/*` | 네트워크 관련 |
| `/finance/*` | `/ecosystem/*` | 에코시스템 (Pado 등) |
| `/ips/*` | `/ip/*` | IP (GenSol 등) |
| `/vision/network` | `/network/nasun` | Nasun Network 페이지 |

**하위 호환성**:
- 기존 경로(`/protocol`, `/finance`, `/ips`, `/vision/*`)로 접근 시 새로운 경로로 자동 리디렉션
- 사용자 경험 유지

**수정된 파일** (4개):
- `src/config/routesConfig.ts` - 메뉴 이름 및 경로 변경
- `src/routes/AppRoutes.tsx` - 라우트 및 리디렉션 설정
- `src/contexts/PageLoadingContext.tsx` - 비디오 히어로 페이지 경로 감지 수정
- `src/components/governance/GovernanceCard.tsx` - 내부 링크 업데이트

**번역 파일 업데이트**:
- `en/*.json` - 메뉴 이름 변경
- `ko/*.json` - 메뉴 이름 변경

---

#### 📅 2025-12-16: CDK 환경별 .env 파일 분리 ✅

**작업 일시**: 2025-12-16
**작업 유형**: 인프라 개선
**심각도**: Medium (배포 프로세스 개선)

---

**목적**: CDK 배포 시 개발/프로덕션 환경별로 다른 .env 파일을 자동 로드

**구현 내용**:

1. **✅ cdk/bin/cdk.ts 수정**:
   - `NODE_ENV` 환경 변수에 따라 .env 파일 분기 로드
   - `development` → `.env.development`
   - `production` (기본값) → `.env.production`

**환경별 파일**:
| 파일 | 용도 | Twitter 앱 |
|------|------|------------|
| `.env.development` | 로컬 개발 | Nasun Dev (localhost 지원) |
| `.env.production` | 프로덕션 배포 | Nasun Website (nasun.io, gensol.io) |

**배포 명령어**:
```bash
# 개발 환경 배포 (localhost:5173 테스트용)
NODE_ENV=development pnpm cdk deploy AuthStack

# 프로덕션 환경 배포
NODE_ENV=production pnpm cdk deploy AuthStack
# 또는 (기본값이 production)
pnpm cdk deploy AuthStack
```

**Twitter OAuth 앱 설정**:
- **개발 앱 (Nasun Dev)**: `localhost:5173/callback`, `localhost:5174/callback` 지원
- **프로덕션 앱 (Nasun Website)**: `nasun.io`, `gensol.io`, `staging.*` 도메인만 지원

**수정된 파일** (1개):
- `cdk/bin/cdk.ts` (dotenv 환경별 로드 로직 추가)

**핵심 교훈**:
> ⚠️ **로컬 테스트 시 반드시 `NODE_ENV=development`로 배포**: 프로덕션 Twitter 앱은 localhost redirect URI를 지원하지 않음

---

#### 📅 2025-12-13: 프로덕션 타겟 계정 설정 및 OAuth 2.0 토큰 발급 ✅

**작업 일시**: 2025-12-13
**작업 유형**: 프로덕션 환경 설정
**심각도**: High (프로덕션 데이터 수집 영향)

---

**목적**: 프로덕션 환경의 타겟 X 계정을 @Nasun_io로 설정하고 OAuth 2.0 토큰 발급

**프로덕션 타겟 계정 정보**:
- **Username**: `Nasun_io`
- **User ID**: `1725466995565752320`

**환경변수 설정** (`cdk/.env.production`):
```bash
TARGET_USERNAME=Nasun_io
TARGET_USER_ID=1725466995565752320
X_TARGET_USERNAME=Nasun_io
X_TARGET_USER_ID=1725466995565752320
```

**OAuth 2.0 토큰 발급 완료**:
- **계정**: @Nasun_io
- **Scope**: `follows.read offline.access list.read like.read users.read tweet.read`
- **유효기간**: Access Token 2시간, Refresh Token 90일 (자동 갱신)

**Secrets Manager 업데이트** (`nasun-twitter-tokens-prod`):
- `oauth2.clientSecret`: `.env.production`과 동기화 완료
- `oauth2.userAccessToken`: @Nasun_io 토큰으로 교체
- `oauth2.refreshToken`: @Nasun_io 토큰으로 교체
- `version`: `2.5-nasun`

**⚠️ 발견된 문제 및 해결**:
- **문제**: Secrets Manager의 `clientSecret`과 `.env.production`의 값이 불일치
- **원인**: 이전에 다른 앱의 credentials가 저장됨
- **해결**: `.env.production`의 올바른 `clientSecret`으로 Secrets Manager 업데이트

**관련 문서**:
- [TARGET_ACCOUNT_ID_MIGRATION_ANALYSIS.md](doc/TARGET_ACCOUNT_ID_MIGRATION_ANALYSIS.md) - 타겟 계정 마이그레이션 분석
- Migration Plan Step 1-2 완료 ✅

**핵심 교훈**:
> ⚠️ **Username 변경 시 토큰 재발급 불필요**: X API는 User ID 기반으로 동작하므로, username이 변경되어도 User ID (`1725466995565752320`)가 동일하면 기존 토큰 그대로 사용 가능

---

#### 📅 2025-11-29: Roadmap 메트릭 자동화 - Community Members API 구현 ✅

**작업 일시**: 2025-11-29
**작업 유형**: 신규 기능 (Lambda + API Gateway)
**심각도**: Low (UI 개선)

---

**목적**: Roadmap 페이지의 "Community Members" 메트릭을 하드코딩 값(200) 대신 실제 UserProfiles 테이블 데이터로 표시

**구현 내용**:

1. **✅ Lambda 함수 생성**: `cdk/lambda-src/get-user-count/`
   - DynamoDB `DescribeTable` API로 UserProfiles ItemCount 조회
   - API Gateway 엔드포인트: `/prod/` (CommonStack)
   - 응답 형식: `{"count": 5, "tableName": "UserProfiles", "updatedAt": "..."}`

2. **✅ Frontend Hook 구현**: `frontend/src/hooks/useUserCount.ts`
   - 5분 localStorage 캐싱
   - 에러 시 null 반환 (폴백 값 제거)

3. **✅ RoadmapIntroSection 수정**:
   - `useUserCount` Hook 통합
   - 폴백 값 200 → 0 변경 (실제 값만 표시)
   - CountingNumber 애니메이션 적용

4. **✅ 환경 변수 업데이트**:
   - `.env.development`, `.env.staging`, `.env.production`
   - `VITE_USER_COUNT_API=https://lw5tmx1pz2.execute-api.ap-northeast-2.amazonaws.com/prod/`

**수정된 파일** (8개):
- `cdk/lambda-src/get-user-count/src/index.ts` (신규)
- `cdk/lambda-src/get-user-count/package.json` (신규)
- `cdk/lib/common-stack.ts` (Lambda + API Gateway 추가)
- `frontend/src/hooks/useUserCount.ts` (신규)
- `frontend/src/components/app/roadmap/RoadmapIntroSection.tsx` (Hook 통합)
- `frontend/.env.development` (API URL 추가)
- `frontend/.env.staging` (API URL 추가)
- `frontend/.env.production` (API URL 추가)

**UserProfiles 테이블 정보**:
- 데이터 제한: 없음 (무제한)
- TTL 설정: 없음
- 현재 사용자: 5명 (Twitter 2, MetaMask 2, Google 1)
- ItemCount 정확도: 6시간마다 업데이트 (근사치)

**참고**: linkedAccounts로 연결된 계정도 별도로 카운트됨 (의도적 설계)

**추가 수정**: `link-account` Lambda의 `@types/uuid` 제거
- uuid 13.x는 자체 TypeScript 타입 제공
- `@types/uuid`는 더 이상 필요 없음 (stub 패키지)
- TypeScript 컴파일 에러 해결

**배포 정보**:
- **배포 일시**: 2025-11-29 15:30 KST
- **배포 시간**: CommonStack 43.25초

**기대 효과**:
- Roadmap 페이지에 실제 가입자 수 표시
- 하드코딩 제거로 유지보수성 향상
- 사용자 증가에 따른 자동 업데이트

---

#### 📅 2025-11-29: 리더보드 하이브리드 순위 시스템 구현 ✅

**작업 일시**: 2025-11-29
**작업 유형**: 기능 개선
**심각도**: Medium (사용자 경험 개선)

---

**문제**: 동점자가 모두 동일한 순위 번호로 표시됨 (예: 179등에 6명 모두 표시)

**기존 동작 (Standard Competition Ranking)**:
- 점수가 같은 사용자들은 모두 같은 순위를 공유
- 예: 179, 179, 179, 179, 179, 179, **185** (6명 동점 후 순위 점프)

**변경 후 (Hybrid Ranking)**:
- **양수 점수 (> 0)**: Ordinal Ranking (모든 사용자에게 고유 순위)
- **0점**: Standard Competition Ranking (동점자 동일 순위 유지)
- 예: 179, 180, 181, 182, 183, 184, **185** (양수 점수 사용자)
- 예: 219, 219, 219, ... (0점 사용자들은 동일 순위)

**수정된 파일** (1개):
- `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts` (Line 549-564)

**코드 변경**:
```typescript
// 하이브리드 순위 처리:
// - 양수 점수 (> 0): Ordinal Ranking (모든 사용자에게 고유 순위)
// - 0점: Standard Competition Ranking (동점자 동일 순위)
if (i > 0) {
  const currentTotal = (user as any).finalScore;
  const prevTotal = (usersWithActiveDays[i-1] as any).finalScore;

  if (currentTotal > 0) {
    // 양수 점수: 항상 고유 순위 (Ordinal Ranking)
    currentRank = i + 1;
  } else if (Math.abs(currentTotal - prevTotal) > 0.001) {
    // 0점: 점수가 다를 때만 순위 증가 (Standard Competition)
    currentRank = i + 1;
  }
  // 0점이고 이전 사용자도 0점이면 동일 순위 유지
}
```

**배포 정보**:
- **배포 일시**: 2025-11-29 11:47 KST
- **배포 시간**: 77.12초
- **Lambda 업데이트**: 25개

**기대 효과**:
- 양수 점수를 가진 사용자들은 tie-breaker(activeDays)에 따라 고유한 순위 부여
- 0점 사용자들은 기존처럼 동일 순위로 표시 (공정성 유지)
- 리더보드 순위의 세밀한 차별화

**롤백 방법**:
```bash
# Git 태그로 롤백 (필요 시)
git revert HEAD
cd cdk/lambda-src/x-leaderboard && npm run build && cd ../../
pnpm cdk deploy CdkStack --require-approval never
```

---

#### 📅 2025-11-27: BackupPrices API 502 에러 수정 ✅

**작업 일시**: 2025-11-27
**작업 유형**: 버그 수정 (Lambda 빌드 설정)
**심각도**: High (가격 정보 표시 불가)

---

**문제**: `/genesis-nft` 페이지에서 암호화폐 가격 정보가 표시되지 않음 (502 Bad Gateway)

**증상**:
- 브라우저 콘솔: `GET /proxy-backup-api/BackupPrices 502 (Bad Gateway)`
- API 응답: `{"message": "Internal server error"}`
- 영향: 가격 정보가 필요한 모든 페이지에서 데이터 로딩 실패

**근본 원인**:
- **Lambda 배포 오류**: TypeScript 소스 파일(`index.ts`)이 컴파일 없이 직접 배포됨
- **CDK 설정 오류**: `common-stack.ts`에서 `src/` 폴더를 직접 참조
- **CloudWatch 에러**: `Runtime.ImportModuleError: Error: Cannot find module 'index'`
- **Lambda 크기**: 640 bytes (비정상적으로 작음 - TypeScript 파일만 포함)

**해결 내용**:

1. **✅ esbuild 빌드 설정 추가** (`build.js` 신규 생성):
   ```javascript
   await esbuild.build({
     entryPoints: ['src/index.ts'],
     bundle: true,
     platform: 'node',
     target: 'node18',
     outfile: 'dist/index.js',
     format: 'cjs',
     external: ['aws-sdk', '@aws-sdk/*', '@aws/*']
   });
   ```

2. **✅ CDK 코드 경로 수정** (`common-stack.ts` Line 64):
   ```typescript
   // Before (TypeScript 직접 배포 - 오류)
   code: lambda.Code.fromAsset("lambda-src/get-backup-prices/src"),

   // After (컴파일된 JavaScript 배포 - 정상)
   code: lambda.Code.fromAsset("lambda-src/get-backup-prices/dist"),
   ```

3. **✅ pre-deploy.sh에 빌드 단계 추가**:
   - `get-backup-prices` Lambda도 자동 빌드 대상에 포함
   - npm install + npm run build 자동화

**수정된 파일** (4개):
- `cdk/lambda-src/get-backup-prices/build.js` (신규 생성)
- `cdk/lambda-src/get-backup-prices/package.json` (build 스크립트, esbuild 의존성 추가)
- `cdk/lib/common-stack.ts` (Line 64: src/ → dist/)
- `cdk/scripts/pre-deploy.sh` (get-backup-prices 빌드 섹션 추가)

**검증 완료**:
- ✅ Lambda 빌드 성공 (`dist/index.js` 생성)
- ✅ CommonStack 배포 완료 (43.25초)
- ✅ API 테스트 성공:
  ```json
  {
    "SUI": {"usd": 1.54, "updatedAt": "2025-11-27T07:27:38.071Z"},
    "ETH": {"usd": 3034.36, "updatedAt": "2025-11-27T07:27:38.071Z"},
    "SOL": {"usd": 144.06, "updatedAt": "2025-11-27T07:27:38.071Z"}
  }
  ```

**재발 방지**:
- `pre-deploy.sh`에 빌드 단계 추가로 향후 배포 시 자동 빌드
- `template-lambda/build.js` 패턴을 따라 일관된 빌드 설정

**핵심 교훈**:
- Lambda 함수는 반드시 **컴파일된 JavaScript**를 배포해야 함
- CDK `Code.fromAsset()` 경로는 `dist/` (빌드 결과물)를 가리켜야 함
- 새로운 Lambda 추가 시 `pre-deploy.sh`에 빌드 단계 필수 추가

**롤백 방법**:
```bash
# 긴급 시: Lambda 재빌드 및 재배포
cd cdk/lambda-src/get-backup-prices
npm run build
cd ../..
pnpm cdk deploy CommonStack --require-approval never
```

---

#### 📅 2025-11-26: 리더보드 점수 최솟값 0 제한 구현 ✅

**작업 일시**: 2025-11-26
**작업 유형**: 버그 수정 + 시스템 개선
**롤백 태그**: `pre-score-floor-fix-20251126`

---

**문제**: 장기간 비활동 사용자의 점수가 음수로 표시되는 문제

**증상**:
- inactivityPenalty가 최대 -5.0점까지 감점
- totalScore가 5점 미만인 사용자의 finalScore가 음수 가능
- 복귀 사용자가 활동을 재개해도 한참 동안 음수 점수 유지 → 의욕 저하

**해결 내용**:

1. **✅ finalScore 최솟값 0 제한** (Line 504):
   ```typescript
   // Before
   finalScore: Math.round(newFinalScore * 10) / 10

   // After
   finalScore: Math.max(0, Math.round(newFinalScore * 10) / 10)
   ```

2. **✅ 버그 수정: finalScore 0이 totalScore로 대체되는 문제** (Line 608):
   ```typescript
   // Before (버그: 0은 falsy라서 totalScore로 대체됨)
   finalScore: (user as any).finalScore || user.totalScore

   // After (nullish coalescing으로 0도 유효한 값으로 처리)
   finalScore: (user as any).finalScore ?? user.totalScore
   ```

   **버그 원인**: JavaScript에서 `||` 연산자는 `0`을 falsy로 취급하여,
   `Math.max(0, -4.6)` = `0`이 계산되어도 DynamoDB에는 `totalScore`가 저장됨.

**수정된 파일** (1개):
- `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts` (Line 504, 608)

**검증 완료**:
- ✅ 파이프라인 실행 성공 (`score-floor-fix-test-20251126-110004`)
- ✅ 테스트 사용자 `imchaeseon82444`:
  - totalScore: 0.4, inactivityPenalty: -5
  - **Before**: finalScore: 0.4 (버그)
  - **After**: finalScore: 0 (정상)

**배포 정보**:
- **배포 일시**: 2025-11-26 11:00 KST
- **배포 시간**: 107.59초
- **Lambda 업데이트**: 25개

**기대 효과**:
- 복귀 사용자가 첫 활동에서 즉시 양수 점수 획득 가능
- 리더보드에 음수 점수 표시 방지
- 복귀 사용자 참여 의욕 향상

**핵심 교훈**:
- JavaScript에서 `||` vs `??` 연산자 차이 주의!
- `||`: falsy 값(0, '', false, null, undefined, NaN) 시 대체
- `??`: null 또는 undefined만 대체 (0은 유효한 값으로 유지)

**롤백 방법**:
```bash
git checkout pre-score-floor-fix-20251126
cd cdk/lambda-src/x-leaderboard && npm run build && cd ../..
pnpm cdk deploy CdkStack --require-approval never
```

---

#### 📅 2025-11-24: CSP (Content Security Policy) 설정 및 Ethereum API 도메인 추가 ✅

**작업 일시**: 2025-11-24
**작업 유형**: 보안 설정 + 버그 수정
**상세 문서**: [doc/CSP_CONFIGURATION_GUIDE.md](doc/CSP_CONFIGURATION_GUIDE.md)

---

**문제**: My Account 페이지에서 Ethereum NFT 조회 시 CSP 에러 발생

**증상**:
```
Refused to connect to 'https://eth-sepolia.g.alchemy.com/...' because it violates
the following Content Security Policy directive: "connect-src 'self' ...".
```

**근본 원인**:
1. ❌ `.env` 파일에 `VITE_CSP_POLICY` 환경 변수 미설정
2. ❌ `index.html`에 CSP 메타 태그 템플릿 누락
3. ❌ Alchemy와 Etherscan API 도메인이 허용 목록에 없음

**해결 내용**:

1. **✅ 환경 변수 추가**:
   - `.env.development`: `VITE_CSP_POLICY` 추가 (Sepolia Testnet용)
     - 추가 도메인: `eth-sepolia.g.alchemy.com`, `api-sepolia.etherscan.io`
   - `.env.production`: `VITE_CSP_POLICY` 추가 (Mainnet용)
     - 추가 도메인: `eth-mainnet.g.alchemy.com`, `api.etherscan.io`

2. **✅ HTML 템플릿 수정**:
   - `index.html` Line 11에 `<%= cspMeta %>` 템플릿 태그 추가
   - vite-plugin-html이 빌드 시 CSP 메타 태그 자동 주입

3. **✅ CSP 정책 구성**:
   ```
   default-src 'self';
   connect-src 'self' [기존 도메인들] + [Alchemy] + [Etherscan];
   img-src 'self' data: https:;
   script-src 'self' 'unsafe-inline' 'unsafe-eval';
   style-src 'self' 'unsafe-inline';
   ```

4. **✅ 상세 문서 작성**:
   - [doc/CSP_CONFIGURATION_GUIDE.md](doc/CSP_CONFIGURATION_GUIDE.md) (4,000+ 단어)
   - CSP 개념 설명, 도메인 추가 방법, 트러블슈팅 가이드
   - 보안 Best Practices (nonce, hash 기반 CSP 권장)

**수정된 파일** (3개):
- `frontend/.env.development` - VITE_CSP_POLICY 추가 (Line 58-76)
- `frontend/.env.production` - VITE_CSP_POLICY 추가 (Line 129-132)
- `frontend/index.html` - CSP 메타 태그 템플릿 추가 (Line 10-11)

**검증 완료**:
- ✅ TypeScript 타입 체크 통과
- ✅ 프로덕션 빌드 성공 (11.38초)
- ✅ `dist/index.html`에 CSP 메타 태그 주입 확인
- ✅ Alchemy/Etherscan 도메인 정상 포함

**기대 효과**:
- My Account 페이지에서 Ethereum NFT 정상 조회 가능
- NFT Event 자격 확인 정상 작동
- CSP를 통한 XSS 공격 방지 강화
- 향후 외부 API 추가 시 명확한 가이드라인 제공

**주요 교훈**:
1. CSP 설정은 환경 변수로 관리 (개발/프로덕션 분리)
2. `vite-plugin-html`의 템플릿 태그 (`<%= %>`) 필수
3. 새로운 외부 API 사용 시 반드시 CSP 업데이트 필요

**관련 문서**:
- [CSP 설정 가이드](doc/CSP_CONFIGURATION_GUIDE.md) - 도메인 추가 방법, 트러블슈팅
- [환경 변수 가이드](frontend/.env.development) - 도메인별 용도 주석

**Git 푸시**: (다음 단계)

---

#### 📅 2025-11-24: 리더보드 동적 구성 기능 구현 완료 ✅

**작업 일시**: 2025-11-24
**작업 유형**: 신규 기능 (API 기반 동적 구성)
**상세 문서**: [doc/LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md](doc/LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md)

---

**목적**: 백엔드 환경 변수만 변경하여 프론트엔드 재배포 없이 리더보드 탭 표시를 동적으로 제어

**구현 내용**:

1. **✅ Backend API 엔드포인트 생성**:
   - `GET /api/leaderboard/config` - 현재 활성화된 리더보드 목록 반환
   - Lambda 핸들러: [get-leaderboard-config.ts](cdk/lambda-src/x-leaderboard/src/handlers/api/get-leaderboard-config.ts)
   - 환경 변수 기반 동적 구성 (`VISIBLE_LEADERBOARDS`)
   - 리더보드별 날짜 정보 포함 (EVENT1, EVENT2)

2. **✅ Frontend 동적 렌더링**:
   - React Query Hook: [useLeaderboardConfig](frontend/src/components/app/Leaderboard/hooks/useLeaderboardConfig.ts)
   - 30분 캐싱 (staleTime: 1800s)
   - [CumulativePeriodSelector](frontend/src/components/app/Leaderboard/components/CumulativePeriodSelector.tsx) 컴포넌트 수정
   - API 응답 기반 탭 동적 생성 (visible 필터링)

3. **✅ 환경 변수 설정**:
   - `cdk/.env`: `VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1,EVENT2`
   - 쉼표로 구분된 리더보드 ID 목록
   - 단일 소스 오브 트루스 (Single Source of Truth)

4. **✅ 버그 수정** (Gemini 미완성 작업 완료):
   - **Bug #1**: `env.ts` - awsRegion 필드 누락 (Lambda 크래시 방지)
   - **Bug #2**: `cdk/.env` - VISIBLE_LEADERBOARDS 환경 변수 누락
   - **Bug #3**: `RankHistorySection.tsx` - 제거된 isEventEnded 함수 사용 (빌드 에러)
   - **Optimization**: 불필요한 DynamoDB 클라이언트 제거

**API 응답 예시**:
```json
{
  "success": true,
  "data": {
    "availableLeaderboards": [
      {
        "id": "CUMULATIVE",
        "name": "All Time",
        "active": true,
        "visible": true
      },
      {
        "id": "EVENT1",
        "name": "Season 1",
        "startDate": "2025-10-19",
        "endDate": "2025-11-18",
        "active": true,
        "visible": true
      },
      {
        "id": "EVENT2",
        "name": "Season 2",
        "startDate": "2025-11-19",
        "endDate": "2025-12-18",
        "active": true,
        "visible": true
      }
    ]
  }
}
```

**수정된 파일** (7개):
- `cdk/lambda-src/x-leaderboard/src/handlers/api/get-leaderboard-config.ts` (신규 생성)
- `cdk/lambda-src/x-leaderboard/src/utils/env.ts` (awsRegion 추가)
- `cdk/.env` (VISIBLE_LEADERBOARDS 추가)
- `frontend/src/types/leaderboard.d.ts` (TypeScript 타입 정의, 신규)
- `frontend/src/services/leaderboardApi.ts` (API 클라이언트, 신규)
- `frontend/src/components/app/Leaderboard/hooks/useLeaderboardConfig.ts` (React Query Hook, 신규)
- `frontend/src/components/app/Leaderboard/components/CumulativePeriodSelector.tsx` (동적 렌더링)
- `frontend/src/components/app/Leaderboard/components/RankHistorySection.tsx` (버그 수정)

**테스트 결과** (자동화 테스트 5/5 통과):
- ✅ Test 1.1: API 응답 구조 검증 (HTTP 200, 3개 리더보드, 필드 정상)
- ✅ Test 1.4: 날짜 형식 검증 (ISO 8601: YYYY-MM-DD)
- ✅ Test 1.5: CORS 헤더 검증 (Access-Control-Allow-Origin: *)
- ✅ Test 1.6: Lambda 환경변수 확인 (VISIBLE_LEADERBOARDS 설정 확인)
- ✅ Test 1.7: 성능 측정 (평균 응답 시간: **85ms** < 목표 200ms)

**배포 정보**:
- Backend: CDK 배포 완료 (25개 Lambda 업데이트, 80초)
- Frontend: 프로덕션 빌드 성공 (12.60초)
- API Endpoint: `https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard/config`

**사용 방법**:
```bash
# 1. 백엔드 환경 변수 수정
vi cdk/.env
# VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1  # EVENT2 숨김

# 2. 백엔드만 재배포
cd cdk
pnpm deploy:dev

# 3. 프론트엔드 재배포 불필요! (30분 후 자동 반영 또는 새로고침)
```

**기대 효과**:
- 백엔드 설정 변경만으로 리더보드 탭 제어 (프론트엔드 재배포 불필요)
- 이벤트 시작/종료 시 신속한 대응 가능
- 단일 소스 오브 트루스 (cdk/.env)
- 성능 최적화 (React Query 30분 캐싱)

**핵심 교훈**:
1. API 기반 동적 구성 > 빌드 타임 환경 변수 동기화
2. React Query staleTime 활용으로 불필요한 API 호출 최소화
3. 철저한 타입 안전성 (TypeScript 타입 정의)
4. 자동화된 테스트 스크립트로 검증 강화

**관련 문서**:
- [구현 보고서](doc/LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md) - 전체 구현 과정 및 버그 수정
- [테스트 스크립트](cdk/scripts/test-dynamic-config.sh) - 자동화된 검증 도구

**Git 커밋**: (다음 단계)

---

#### 📅 2025-11-23: Top Climbers Spotlight 기능 구현 + UI/UX 개선 ✅

**작업 일시**: 2025-11-23
**작업 유형**: 신규 기능 + UI/UX 개선
**상세 문서**: [doc/TOP_CLIMBERS_SPOTLIGHT_FEATURE.md](doc/TOP_CLIMBERS_SPOTLIGHT_FEATURE.md)

---

**구현 내용**:

1. **✅ Top Climbers Spotlight 컴포넌트**:
   - 지정된 기간 동안 순위가 가장 많이 상승한 상위 5명 표시
   - ClimberCard 반응형 그리드 레이아웃 (1열 → 3열 → 5열)
   - "View in Leaderboard" 버튼으로 해당 사용자 페이지로 이동
   - 6초간 노란색 하이라이트 효과 (pulse 애니메이션)

2. **✅ TimeRangeSelector 컴포넌트**:
   - 4가지 시간 범위: Today, 7D, 4W, 3M
   - Compact 모드 지원 (작은 버튼 그룹)
   - 이벤트 리더보드는 4W, 3M 자동 비활성화
   - 디자인: border-nasun-c4, bg-black/60

3. **✅ UI/UX 개선사항**:
   - **폰트 통일화**: 커스텀 폰트(font-rubik, font-founders) 제거 → 글로벌 CSS 사용
   - **TimeRange 레이블 간략화**: "7 Days" → "7D", "4 Weeks" → "4W", "3 Months" → "3M"
   - **Snapshot Viewer 배경**: bg-black → bg-black/60 (TimeRangeSelector와 통일)
   - **테이블 스크롤바 개선**:
     - 스크롤바가 테이블 border 내부에 표시
     - rounded-xl 모서리가 스크롤바에도 적용
     - 수평 스크롤 정상 작동
   - **반응형 spacing**: mb-8 md:mb-10 xl:mb-12

**기술 스택**:
- React Query (데이터 캐싱 5분)
- useTopClimbers Hook (API: GET /top-climbers)
- Framer Motion (애니메이션)
- Tailwind CSS (반응형 그리드)
- i18next (한국어/영어 완벽 지원)

**커밋 히스토리** (7개):
```
f6f4c4c - refactor: Improve spacing and code formatting
f1a3ab4 - fix(Table): Apply rounded corners to scrollbar area
9052fee - fix(Table): Fix horizontal scrollbar position and enable scrolling
e03cf26 - feat(LeaderboardTable): Add horizontal scrollbar for table overflow
2d988a0 - style(DatePicker): Change background to bg-black/60 for snapshot viewer
b9adbf9 - refactor(Leaderboard): Remove custom font-family settings
0f4b80d - refactor(TopClimbers): Simplify TimeRange labels and remove description
22a18e9 - refactor(TopClimbers): Remove average improvement and update TimeRangeSelector
```

**수정된 파일** (8개):
- `TopClimbersSpotlight.tsx` - 메인 컨테이너 (신규)
- `TimeRangeSelector.tsx` - 시간 범위 선택기 (신규)
- `ClimberCard.tsx` - 개별 카드 (신규)
- `DatePicker.tsx` - 배경색 bg-black/60
- `CumulativeLeaderboardTable.tsx` - min-w-[1200px], 스크롤바 개선
- `Table.tsx` - rounded 모서리 스크롤바 적용
- `CommunityLanguageBadge.tsx` - font-rubik 제거
- `leaderboard.ts` - TIME_RANGE_LABELS 간략화

**결과**:
- ✅ 순위 상승자 실시간 추적 및 표시
- ✅ 다크 모드 완벽 지원
- ✅ 반응형 디자인 (모바일 → 데스크톱)
- ✅ 일관된 디자인 시스템 적용
- ✅ 한국어/영어 완벽 번역

**브랜치**: feature/top-climbers-spotlight
**Git 푸시**: 완료 ✅

---

#### 📅 2025-11-17: Network 페이지 비디오 로딩 문제 해결 + 다국어 지원 개선 ✅

**작업 일시**: 2025-11-17
**작업 유형**: 버그 수정 + UX 개선 + 국제화
**상세 문서**: [doc/NETWORK_PAGE_VIDEO_LOADING_FIX.md](doc/NETWORK_PAGE_VIDEO_LOADING_FIX.md)

---

**문제 증상**:
- Network 페이지(구: `/vision/network`, 현: `/network/nasun`)에서 Footer와 섹션들이 Hero 비디오 로딩 스핀보다 **먼저 렌더링**
- 렌더링 순서: 네비게이션바 → Footer → 로딩 스핀 → NSN NETWORK 텍스트 → 배경 비디오
- **레이아웃 시프트**: 비디오 로딩 완료 시 모든 요소가 갑자기 아래로 밀림

**근본 원인**:
1. **PageLoadingContext 타이밍 불일치**:
   - HomePage(`/`)만 특별 취급, 다른 페이지는 1초 후 자동으로 Footer 표시
   - Network 페이지 비디오는 2-10초 걸림 → Footer가 z-40 오버레이 아래 숨겨짐

2. **라우팅 경로 불일치**:
   - PageLoadingContext: `/vision/nasunnetwork` (잘못된 경로)
   - 실제 라우팅: `/vision/network` (routesConfig.ts)
   - 결과: Context가 Network 페이지를 감지하지 못함

**해결 방법**:

1. **NetworkHeroSection 비디오 로딩 패턴 적용** (HomePage 패턴):
   - Props 인터페이스 추가 (`onVideoReady`, `isVideoReady`)
   - 비디오 이벤트 핸들러 (`onCanPlay`, `onPlaying`)
   - Timeout fallback (10초)
   - CSS 기반 위치 제어 (`fixed z-40` → `relative`)

2. **NetworkPage Context 통합**:
   - `usePageLoading` Hook 추가
   - 페이지 마운트 시 `setIsPageReady(false)`
   - 비디오 준비 콜백으로 `setIsPageReady(true)`
   - Body 스크롤 제어 (`overflow: hidden` → `auto`)
   - 섹션 프리로드 (Promise.all)

3. **PageLoadingContext 경로 수정** (최종 해결):
   ```tsx
   const isPageWithVideoHero =
     location.pathname === "/" ||
     location.pathname === "/home" ||
     location.pathname === "/network/nasun";  // ✅ 2026-01-19 라우트 변경
   ```

**추가 작업 - 다국어 지원 개선**:
- ✅ 영어 고정 헤딩 4개: "No bias...", "Four main use cases...", "Move together...", "NSN Token Distribution"
- ✅ TokenDistribution 한국어 지원: `useTranslation` Hook, 모든 레이블 번역
- ✅ 한국어 번역 수정: "나선 코어팀", "초기 테스터, 서포터 및 커뮤니티"

**결과**:
- ✅ Footer가 비디오 준비 완료 **이후**에만 렌더링
- ✅ 레이아웃 시프트 제거
- ✅ HomePage와 동일한 부드러운 로딩 UX
- ✅ 영어/한국어 완벽 지원

**수정된 파일** (8개):
- `PageLoadingContext.tsx` - 라우팅 경로 수정
- `NetworkHeroSection.tsx` - 비디오 로딩 패턴 적용
- `NetworkPage.tsx` - Context 통합
- `NasunNetworkSection.tsx`, `NasunTokenSection.tsx`, `MoveTogetherSection.tsx` - 영어 고정
- `TokenDistribution/index.tsx` - 한국어 지원
- `ko/tokenomics.json` - 번역 업데이트

**Git 커밋**: (다음 단계)

---

#### 📅 2025-11-08: 로딩 UI 완전 통일 - 다중 스핀 문제 해결 및 디자인 통일 완료 ✅

**작업 일시**: 2025-11-08
**작업 유형**: UX 개선 + 재사용 가능한 패턴 확립 + 디자인 통일
**상세 문서**:
- [doc/HOMEPAGE_LOADING_PATTERN_GUIDE.md](doc/HOMEPAGE_LOADING_PATTERN_GUIDE.md) - CSS 기반 위치 제어 패턴
- [doc/LOADING_COMPONENT_UNIFICATION.md](doc/LOADING_COMPONENT_UNIFICATION.md) (v3.0.0) - 통합 보고서

---

**Phase 1: 다중 로딩 스핀 문제 해결**

**문제 발견**:
- 홈페이지 접속 시 로딩 스핀이 **3번** 순차적으로 나타나는 현상
  1. HeroSection 비디오 로딩 (필요) ✅
  2. Suspense fallback (짧음) ⚠️
  3. HeroSection 재렌더링 (불필요) ❌

**근본 원인**:
- 조건부 렌더링(`if (!isVideoReady) return ...`)으로 인한 HeroSection **이중 마운트**
- 두 번째 마운트 시 `isVideoPlaying` 상태 초기화 → 로딩 스핀 재표시

**해결 방법** (CSS 기반 위치 제어 패턴):
1. ✅ 조건부 렌더링 제거 → HeroSection 항상 렌더링
2. ✅ `isVideoReady` prop으로 CSS 클래스 동적 변경
   - `false`: `fixed inset-0 z-40` (전체 화면 오버레이)
   - `true`: `relative` (정상 ScrollSnapSection)
3. ✅ Suspense fallback을 `null`로 설정

**결과**:
- 로딩 스핀이 **1번만** 표시 (HeroSection 비디오 로딩) ✅
- 컴포넌트 재마운트 방지 → 상태 유지 ✅
- 성능 개선 (불필요한 재렌더링 제거) ✅

---

**Phase 2: 로딩 스피너 디자인 완전 통일**

**배경**:
- PageLoading (수직 레이아웃) vs SectionLoading (수평 레이아웃) 디자인 불일치
- 사용자 피드백: 리더보드 페이지의 수평 레이아웃 선호

**변경 사항**:
- PageLoading 디자인을 SectionLoading과 동일하게 수정
  - Layout: `flex flex-col gap-3` → `flex items-center` (수직 → 수평)
  - Text Size: `text-sm` → `text-base` (14px → 16px)
  - Opacity: `70%` → `100%` (더 선명하게)
  - Element: `<p>` → `<span>` (인라인 요소)

**결과**:
- ✅ **완전한 디자인 통일**: PageLoading & SectionLoading 동일한 수평 레이아웃
- ✅ **일관된 UX**: 전체 웹사이트에서 동일한 로딩 스피너
- ✅ **명확한 가독성**: 100% opacity로 더 선명한 텍스트

---

**문서화 완료**:
- **HOMEPAGE_LOADING_PATTERN_GUIDE.md** (7,400+ 단어) - CSS 기반 위치 제어 패턴
- **LOADING_COMPONENT_UNIFICATION.md** (v3.0.0) - 통합 보고서
  - Phase 1: 로딩 컴포넌트 통일화 (2025-10-27)
  - Phase 2: 다중 로딩 스핀 제거 (2025-11-08)
  - Phase 3: 디자인 완전 통일 (2025-11-08)

**핵심 패턴** (재사용 가능):
```tsx
// 부모 (Page): 항상 렌더링 + prop 전달
<MySection isReady={isReady} />

// 자식 (Section): CSS 클래스 동적 변경
const className = !isReady
  ? "fixed inset-0 z-40 bg-nasun-white dark:bg-nasun-black"
  : "relative w-full h-screen";
```

**Git 커밋**:
- `7ba86ff` - fix(HomePage): Prevent footer appearing before hero section content
- `2a1a389` - refactor(HomePage): Eliminate multiple loading spinners
- `beb5f52` - docs: Add loading pattern implementation guides
- `ce2de87` - refactor(PageLoading): Unify spinner design with SectionLoading

---

#### 📅 2025-11-02: OAuth 토큰 복구 및 모니터링 강화 완료 ✅

**작업 일시**: 2025-11-02 12:35-13:00 KST (총 65분)
**작업 유형**: 긴급 복구 + 재발 방지 시스템 구축
**심각도**: Critical
**상세 보고서**: [doc/OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](doc/OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md)

---

**문제 발견**:
- 개발 환경 OAuth Token: ❌ EXPIRED (10시간 전 만료)
- Refresh Token: ❌ INVALID (revoked)
- Lambda 실행: ❌ 5회 연속 실패 (11시간 동안)
- 영향: X API 데이터 수집 중단 (11시간)

**복구 작업** (Phase 1-2, 20분):
1. ✅ 수동 OAuth 재인증 (@Naru010110)
2. ✅ Authorization Code → Token 교환
3. ✅ Secrets Manager 업데이트
4. ✅ Token 유효성 검증 (105분 남음)
5. ✅ Lambda 자동 갱신 테스트 성공

**재발 방지 시스템** (Phase 3, 5분):
1. ✅ **CloudWatch Alarm 생성**:
   - 알람명: `NASUN-OAuth토큰-갱신실패`
   - Metric: Lambda Errors (nasun-refresh-oauth2-token)
   - Threshold: 10분간 2회 연속 실패 시 알림
   - Action: SNS 알림 (`nasun-monitoring-alerts`)
   - 효과: 문제 감지 시간 98.5% 단축 (660분 → 10분)

2. ✅ **CloudWatch Dashboard 위젯 추가**:
   - "OAuth 2.0 Token Refresh - 실행 상태 (90분 주기)"
   - "OAuth 2.0 Token Refresh - 실행 시간"
   - Dashboard URL: https://console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#dashboards:name=NASUN-Operations-Monitoring

3. ✅ **CDK 코드 수정 및 배포**:
   - `cdk/lib/cdk-stack.ts`: refreshOAuth2TokenFunction export
   - `cdk/lib/monitoring-stack.ts`: Alarm + Dashboard 위젯 추가
   - `cdk/bin/cdk.ts`: MonitoringStack props 전달
   - 배포 시간: 180초 (3분)

**배포 결과**:
- CdkStack: 64.28초
- CommonStack: 74.66초 (18개 Lambda 재빌드)
- MonitoringStack: 22.2초 (OAuthTokenRefreshErrorAlarm CREATE_COMPLETE)

**검증 완료**:
- ✅ OAuth Token: VALID (105분 남음)
- ✅ CloudWatch Alarm: INSUFFICIENT_DATA (정상, 에러 없음)
- ✅ Dashboard: 15개 위젯 (신규 2개 추가)
- ✅ 계정 매핑: Dev (@Nasun_io), Prod (@Nasun_io)

**성과**:
- 데이터 수집 정상화 (11시간 중단 → 복구)
- 문제 감지 시간 98.5% 단축 (660분 → 10분)
- 재발 방지 시스템 완성 (Alarm + Dashboard + SNS)

**핵심 교훈**:
1. 수동 토큰 재발급이 자동화보다 빠르고 안정적
2. 모니터링 강화가 재발 방지의 핵심
3. 계정 매핑 검증 필수 (Dev vs Prod)
4. CloudWatch Alarm + SNS = 24/7 무중단 운영

**관련 문서**:
- [OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](doc/OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md) - 상세 복구 보고서
- [SCHEDULED_TASKS_GUIDE.md](doc/SCHEDULED_TASKS_GUIDE.md) - 스케줄링 작업 및 모니터링 가이드 (v1.2.0 업데이트)

---

#### 📅 2025-11-02: NFT Event Wallet Reconnection UX 개선 완료 ✅

**작업 일시**: 2025-11-02 (약 65분)
**작업 내용**: Step 6에서 지갑 연결 해제 시 재연결 안내 UX 구현
**상세 보고서**: [doc/NFT_EVENT_WALLET_RECONNECTION_IMPLEMENTATION_REPORT.md](doc/NFT_EVENT_WALLET_RECONNECTION_IMPLEMENTATION_REPORT.md)

---

**구현 요약**:

1. **✅ WalletDisconnectedCard 컴포넌트 생성**:
   - 지갑 연결 해제 시 표시되는 경고 카드
   - "Reconnect MetaMask" 버튼 (My Account로 리디렉션)
   - "Reset Registration" 버튼 (확인 다이얼로그 + localStorage 초기화)
   - 등록 정보 보존 안내 (Registration Saved, X Account Saved, Wallet Needed)

2. **✅ RegistrationSuccessCard 개선**:
   - `isWalletConnected` props 추가
   - 지갑 연결 해제 시 노란색 경고 배너 표시
   - "Go to My Account to Reconnect" 버튼 제공

3. **✅ NftEventPage 로직 개선**:
   - Step 6에서 지갑 연결 상태 실시간 감지
   - `!isWalletConnected` 시 WalletDisconnectedCard 표시
   - `isWalletConnected` 시 RegistrationSuccessCard 표시
   - handleReconnect, handleReset 핸들러 추가

4. **✅ i18n 번역 추가**:
   - 영어/한국어 각 12개 키 추가
   - `step6.walletDisconnected.*` (7개)
   - `step6.walletDisconnectedWarning`, `step6.goToMyAccount`
   - `step6.info` 추가 키 (4개)

**사용자 시나리오**:
- **Scenario 1**: 등록 완료 → Unlink → NFT Event 재방문 → WalletDisconnectedCard 표시 ✅
- **Scenario 2**: Reconnect 클릭 → My Account 이동 → 재연결 → 자동 복원 ✅
- **Scenario 3**: Reset 클릭 → 확인 → Step 1 복귀 ✅
- **Scenario 4**: 지갑 유지 → RegistrationSuccessCard 정상 표시 ✅

**수정된 파일** (5개):
- `WalletDisconnectedCard.tsx` (신규 생성, 133줄)
- `RegistrationSuccessCard.tsx` (Props + 경고 배너, +26줄)
- `NftEventPage.tsx` (조건부 렌더링, +45줄)
- `en/nft-event.json` (번역 +24줄)
- `ko/nft-event.json` (번역 +24줄)

**Git Commit** (3개):
- `9c57bda`: feat(NFT Event): Add wallet reconnection UX for Step 6
- `f7b5846`: i18n(NFT Event): Add wallet reconnection translations
- (pending): docs(NFT Event): Add wallet reconnection implementation report

**기대 효과**:
- 명확한 지갑 연결 상태 안내로 사용자 혼란 방지
- 재연결 플로우 직관화 (My Account 버튼 클릭 한 번)
- 백엔드 API 활용으로 자동 등록 상태 복원
- Reset 옵션으로 다른 지갑 재등록 가능

---

#### 📅 2025-10-28: Phase 4 - X API 프로덕션 앱 생성 완료 ✅

**작업 일시**: 2025-10-28 22:50-23:00 KST (10분)
**작업 내용**: OAuth Token Replacement Phase 4 - X API 프로덕션 앱 생성 및 토큰 발급
**상세 보고서**: [doc/OAUTH_TOKEN_REPLACEMENT_PHASE4_X_API_COMPLETION_REPORT.md](doc/OAUTH_TOKEN_REPLACEMENT_PHASE4_X_API_COMPLETION_REPORT.md)

---

**구현 요약**:

1. **✅ Phase 4-1: X Developer Portal 프로덕션 앱 생성**:
   - App Name: Nasun Website
   - App ID: 31742486
   - Target Account: @Nasun_io
   - Environment: Production

2. **✅ Phase 4-2: API Keys 발급**:
   - API Key: zeqqFUX8zIF7IFsOtt10YJSJD
   - API Key Secret: (발급 완료)
   - Bearer Token: (발급 완료)

3. **✅ Phase 4-3: OAuth 2.0 설정**:
   - Client ID: Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ
   - Client Secret: (발급 완료)
   - Callback URI: https://nasun.io/callback

4. **✅ Phase 4-4: @Nasun_io User ID 확인**:
   - User ID: 1936784207453507584
   - X API 조회로 확인

5. **✅ Phase 4-5: Secrets Manager 업데이트**:
   - Secret: nasun-twitter-tokens-prod
   - Version ID: 9260b506-261e-4b11-ae97-a7a7997c4b56
   - 모든 API 키 및 토큰 업데이트 완료

6. **✅ Phase 4-6: .env.production 업데이트**:
   - 10개 필드 업데이트 (User ID, API Keys, OAuth Tokens)
   - 남은 TBD: API_GATEWAY_ID (Phase 5에서 업데이트)

**생성된 리소스**:
- X API Production App: 31742486
- API Keys: 3개 (API Key, API Secret, Bearer Token)
- OAuth Credentials: 2개 (Client ID, Client Secret)
- OAuth 1.0a Tokens: 2개 (Access Token, Access Token Secret)
- Secrets Manager Version: 9260b506-261e-4b11-ae97-a7a7997c4b56

**다음 단계 (Phase 5)**:
- CDK 프로덕션 배포 (25개 Lambda, 3개 DynamoDB, API Gateway, Step Functions)
- API Gateway ID 확인 및 환경 변수 업데이트
- 프론트엔드 프로덕션 빌드 및 배포
- 프로덕션 검증

**진행률**: Phase 4 완료 (전체 80% 완료)

---

#### 📅 2025-10-28: Phase 3 - AWS 프로덕션 계정 설정 완료 ✅

**작업 일시**: 2025-10-28 22:35-22:45 KST (10분)
**작업 내용**: OAuth Token Replacement Phase 3 - AWS 프로덕션 계정 초기 설정
**상세 보고서**: [doc/OAUTH_TOKEN_REPLACEMENT_PHASE3_AWS_SETUP_COMPLETION_REPORT.md](doc/OAUTH_TOKEN_REPLACEMENT_PHASE3_AWS_SETUP_COMPLETION_REPORT.md)

---

**구현 요약**:

1. **✅ Phase 3-1: AWS CLI 프로필 설정**:
   - `~/.aws/credentials`에 `nasun-prod` 프로필 추가
   - AWS 계정: 466841130170
   - IAM 사용자: nasun-cli
   - 리전: ap-northeast-2

2. **✅ Phase 3-2: CDK Bootstrap**:
   - 프로덕션 계정에 CDK 초기 인프라 생성
   - 12개 리소스 생성 (S3, ECR, IAM Roles, CloudFormation)
   - 소요 시간: 50초

3. **✅ Phase 3-3: Secrets Manager 시크릿 생성**:
   - 시크릿명: `nasun-twitter-tokens-prod`
   - ARN: `arn:aws:secretsmanager:ap-northeast-2:466841130170:secret:nasun-twitter-tokens-prod-2ekpAS`
   - 상태: Placeholder 값 (Phase 4에서 실제 토큰으로 업데이트 예정)

4. **✅ Phase 3-4: IAM 권한 검증**:
   - nasun-cli 사용자: AdministratorAccess 정책 확인
   - CDK 배포에 필요한 모든 권한 보유

**생성된 AWS 리소스 (프로덕션 계정)**:
- CloudFormation Stack: CDKToolkit
- S3 Bucket: StagingBucket
- ECR Repository: ContainerAssetsRepository
- IAM Roles: 5개 (FilePublishing, ImagePublishing, CloudFormationExecution, Lookup, DeploymentAction)
- Secrets Manager Secret: nasun-twitter-tokens-prod

**다음 단계 (Phase 4)**:
- X Developer Portal에서 프로덕션 앱 생성 (@Nasun_io)
- API Keys 및 OAuth 2.0 토큰 발급
- Secrets Manager 시크릿 업데이트
- `cdk/.env.production` 업데이트

**진행률**: Phase 3 완료 (전체 60% 완료)

---

#### 📅 2025-10-28: X API Likes/Retweets Pagination 구현 완료 ✅

**작업 일시**: 2025-10-28 11:45-12:00 KST (15분)
**구현 내용**: Likes와 Retweets API에 페이지네이션 추가로 데이터 수집 범위 5배 확장
**상세 보고서**: [doc/LIKES_RETWEETS_PAGINATION_COMPLETION_REPORT.md](doc/LIKES_RETWEETS_PAGINATION_COMPLETION_REPORT.md)

---

**구현 요약**:

1. **✅ 페이지네이션 구현**:
   - **getTweetLikingUsers()**: OAuth 2.0 + OAuth 1.0a + Bearer Token (3가지 인증 방법)
   - **getTweetRepostedByUsers()**: OAuth 1.0a + Bearer Token (2가지 인증 방법)
   - **Do-While 루프**: pagination_token을 사용하여 최대 5페이지까지 수집

2. **✅ 환경 변수 제어**:
   ```bash
   MAX_LIKES_PER_TWEET=500    # 100 → 500 (5배 증가)
   MAX_REPOSTS_PER_TWEET=500  # 100 → 500 (5배 증가)
   ```

3. **✅ Rate Limit 보호**:
   - 페이지 간 200ms 대기
   - Rate Limit: 5 requests/15분 (100% 사용)
   - 안전성: 5페이지에서 자동 멈춤 (무한 호출 방지)

4. **✅ 상세 로깅**:
   ```
   📄 [Page 1] 100명 조회 중
   ✅ [Page 1] 100명 조회 (누적: 100/500)
   ⏰ 페이지 간 대기 (200ms) - Rate Limit 보호
   🎯 [getTweetLikingUsers] OAuth 2.0: 총 500명 조회 완료 (5 페이지)
   ```

**배포 정보**:
- **Lambda 빌드**: 5초 (TypeScript → JavaScript)
- **CDK 배포**: 70.08초 (24개 Lambda 업데이트)
- **수정 파일**: 7개 (twitter-api.ts, collect-likes.ts, collect-retweets.ts, env.ts, cdk-stack.ts, .env)

**기대 효과**:
- **데이터 수집**: 100명 → 500명 (+400%)
- **인기 트윗 정확도**: 33% 누락 → 100% 수집
- **바이럴 트윗 정확도**: 80% 누락 → 100% 수집
- **리더보드 순위**: 더 정확한 순위 반영

**수정된 파일**:
- [twitter-api.ts](cdk/lambda-src/x-leaderboard/src/services/twitter-api.ts): 5개 함수 페이지네이션 구현
- [collect-likes.ts](cdk/lambda-src/x-leaderboard/src/handlers/batch/collect-likes.ts): config.maxLikesPerTweet 사용
- [collect-retweets.ts](cdk/lambda-src/x-leaderboard/src/handlers/batch/collect-retweets.ts): config.maxRepostsPerTweet 사용
- [env.ts](cdk/lambda-src/x-leaderboard/src/utils/env.ts): Interface 및 Function 업데이트
- [cdk-stack.ts](cdk/lib/cdk-stack.ts): Lambda 환경 변수 추가
- [.env](cdk/.env): MAX_LIKES_PER_TWEET, MAX_REPOSTS_PER_TWEET 추가

**검증 완료**:
- ✅ Lambda 환경 변수: MAX_LIKES_PER_TWEET=500, MAX_REPOSTS_PER_TWEET=500
- ✅ Lambda LastModified: 2025-10-28T02:56:12.000+0000 (방금 전)
- ✅ TypeScript 빌드: 에러 없음
- ⏳ CloudWatch Logs: 다음 파이프라인 실행 시 확인 필요

**롤백 방법**:
```bash
# Git 백업 태그로 복원
git checkout pre-likes-retweets-pagination-20251028
cd cdk/lambda-src/x-leaderboard && npm run build && cd ../../
pnpm cdk deploy CdkStack --require-approval never
```

---

#### 📅 2025-10-28: Quote Reply Passive Engagement 수집 버그 수정 완료 ✅

**작업 일시**: 2025-10-28 11:30-13:00 KST (1시간 30분)
**수정된 버그**: Quote Reply가 Passive Engagement 수집에서 제외되는 버그
**상세 보고서**: [doc/QUOTE_TWEET_PASSIVE_COLLECTION_IMPLEMENTATION_PLAN.md](doc/QUOTE_TWEET_PASSIVE_COLLECTION_IMPLEMENTATION_PLAN.md)

**핵심 발견**:

1. **🐛 버그 확인 (Gemini 재조사 기반)**:
   - **문제**: Quote Reply (conversation 내에서 타인의 답글을 인용하는 포스트)가 Passive Engagement 수집에서 **제외됨**
   - **근본 원인**: `twitter-api.ts`의 `isReply` 판단 로직이 `conversation_id`만 확인하고 `referenced_tweets.type` 미확인
   - **영향**: Quote Reply의 Likes/Retweets가 점수에 반영되지 않음

2. **✅ 수정 내용**:
   ```typescript
   // ❌ 기존 로직 (conversation_id만 확인)
   const isReply = !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);

   // ✅ 수정 로직 (referenced_tweets.type 확인)
   const isQuoteTweet = tweet.referenced_tweets?.some(
     (ref: any) => ref.type === 'quoted'
   ) || false;

   const isReply = !isQuoteTweet &&
                   !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);
   ```

3. **📊 트윗 분류 결과**:
   | 트윗 타입 | `isReply` | 수집 여부 | 상태 |
   |----------|-----------|----------|------|
   | **Pure Quote Tweet** | false | ✅ 수집 | 정상 (변경 없음) |
   | **Quote Reply** | false | ✅ 수집 | **수정됨** (제외 → 수집) |
   | **Pure Reply** | true | ❌ 제외 | 정상 (변경 없음) |

4. **🧪 Unit Test 추가**:
   - 파일: `test/services/tweet-classification.test.ts`
   - 8개 테스트 케이스 작성:
     - Pure Quote Tweet, Quote Reply, Pure Reply
     - Original Post, Self Thread
     - Quote with multiple references
     - Edge cases (empty/undefined referenced_tweets)

5. **📝 DEBUG 로그 개선**:
   - `get-target-tweets.ts`에 `referenced_tweets` 정보 추가
   - CloudWatch 로그로 Quote Reply 수집 확인 가능

**Git 커밋** (3개):
1. `d144440`: 코드 수정 (twitter-api.ts, get-target-tweets.ts)
2. `49742a0`: Unit Test 추가
3. `02bbfce`: 구현 계획서 추가

**Feature 브랜치**: `feature/quote-reply-passive-collection`
**백업 태그**: `pre-quote-reply-fix-20251028`

**기대 효과**:
- Quote Reply에서 수집되는 Likes/Retweets가 리더보드 점수에 정상 반영
- 타겟 계정의 모든 Quote Tweet (Pure + Reply) 완전 수집
- 데이터 무결성 및 공정성 향상

**관련 문서**:
- **분석 보고서**: [doc/QUOTE_TWEET_COLLECTION_ANALYSIS_REPORT.md](doc/QUOTE_TWEET_COLLECTION_ANALYSIS_REPORT.md)
- **구현 계획서**: [doc/QUOTE_TWEET_PASSIVE_COLLECTION_IMPLEMENTATION_PLAN.md](doc/QUOTE_TWEET_PASSIVE_COLLECTION_IMPLEMENTATION_PLAN.md)

---

#### 📅 2025-10-28: X API Pagination 구현 완료 ✅

**작업 일시**: 2025-10-28 11:00-11:20 KST (20분)
**구현 내용**: 멘션 수집 페이지네이션 구현 (100개 → 1000개)
**상세 보고서**: [doc/PAGINATION_IMPLEMENTATION_COMPLETION_REPORT.md](doc/PAGINATION_IMPLEMENTATION_COMPLETION_REPORT.md)

**핵심 성과**:

1. **✅ 데이터 손실 방지**:
   - Before: 최대 100개 멘션 수집 (100개 초과 시 손실)
   - After: 최대 1000개 멘션 수집 (10배 증가)
   - 예상 손실 방지: 25-100 포인트/일

2. **✅ Pagination 구현**:
   ```typescript
   // X API next_token으로 다중 페이지 지원
   do {
     pageCount++;
     const pageSize = Math.min(remainingCount, 100);
     const search = await this.client.v2.search(query, {
       max_results: pageSize,
       next_token: nextToken  // 페이지네이션
     });

     allTweets.push(...search.data.data || []);
     nextToken = search.data.meta?.next_token;

     if (nextToken && allTweets.length < maxResults) {
       await this.sleep(200);  // Rate Limit 보호
     }
   } while (nextToken && allTweets.length < maxResults);
   ```

3. **✅ 환경 변수 제어**:
   - `MAX_MENTIONS_PER_DAY=1000` (기본값)
   - 배포 없이 수집량 조정 가능
   - Rate Limit 영향: 16% (매우 안전)

4. **📊 성능 분석**:
   | 항목 | 값 | 상태 |
   |------|-----|------|
   | Rate Limit 사용률 | 16% (10/60 calls) | ✅ 안전 |
   | 예상 실행 시간 | 10-17초 | ✅ 여유 (283초) |
   | 메모리 사용량 | 25MB/512MB | ✅ 5% |

**수정된 파일** (4개):
- `cdk/lambda-src/x-leaderboard/src/services/twitter-api.ts` (searchRecentTweets 페이지네이션)
- `cdk/lambda-src/x-leaderboard/src/handlers/batch/collect-mentions-search.ts` (환경 변수 사용)
- `cdk/lambda-src/x-leaderboard/src/utils/env.ts` (maxMentionsPerDay 추가)
- `cdk/lib/cdk-stack.ts` (Lambda 환경 변수 추가)

**배포 정보**:
- **배포 일시**: 2025-10-28 11:16:35 KST
- **배포 시간**: 75초
- **Lambda 업데이트**: 26개
- **환경 변수 검증**: `MAX_MENTIONS_PER_DAY="1000"` ✅

**Git 정보**:
- **커밋**: `2530b8a`
- **백업 태그**: `pre-pagination-implementation-20251028`

**테스트 필요** ⚠️:
1. 수동 파이프라인 실행 (CloudWatch Logs 확인)
2. 멘션 수 100개 초과 시 데이터 검증
3. Pagination 로그 확인 (페이지 수, 누적 개수)

**다음 단계**:
- Phase 2: Likes/Retweets API 페이지네이션 (5 requests/15min, 우선순위 높음)
- Phase 3: Quote Tweets API 페이지네이션 (우선순위 낮음)

---

#### 📅 2025-10-28: Quote Tweet Collection 로직 조사 완료 ✅

**작업 일시**: 2025-10-28 18:00-19:00 KST (1시간)
**조사 내용**: Gemini AI 주장 검증 - "타인의 답글을 인용한 포스트는 수집되지 않는다"
**상세 보고서**: [doc/QUOTE_TWEET_COLLECTION_ANALYSIS_REPORT.md](doc/QUOTE_TWEET_COLLECTION_ANALYSIS_REPORT.md)

**핵심 발견**:

1. **✅ Gemini 주장 검증 결과**:
   - Gemini: "해당 포스트(1981909736779059623)는 대상이 되지 않습니다" → **틀렸음**
   - CloudWatch 로그: 해당 트윗은 **수집됨** (isReply: false, Passive 수집 대상 1개)
   - 트윗 타입: **Pure Quote Tweet** (새 conversation을 시작하는 quote)

2. **⚠️ 시스템 버그 발견**:
   - **Quote Reply** (conversation 내에서 답글을 인용하는 포스트)가 **잘못 제외됨**
   - 근본 원인: `isReply` 로직이 `conversation_id`만 확인, `referenced_tweets.type` 미확인
   - 영향: Quote reply의 likes/retweets가 점수에 반영되지 않음 (passive engagement 미수집)

3. **🔍 트윗 분류 로직 분석**:
   ```typescript
   // ❌ 현재 로직 (conversation_id만 확인)
   const isReply = !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);

   // ✅ 개선 방안 (referenced_tweets 활용)
   const isQuoteTweet = tweet.referenced_tweets?.some(ref => ref.type === 'quoted');
   const isReply = !isQuoteTweet &&
                   !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);
   ```

4. **📊 트윗 분류 현황**:
   | 트윗 타입 | `isReply` | 수집 여부 | 상태 |
   |----------|-----------|----------|------|
   | Pure Quote Tweet | false | ✅ 수집됨 | 정상 |
   | Quote Reply | true | ❌ 제외됨 | **버그** |
   | Pure Reply | true | ✅ 제외됨 | 정상 |

**정책 확인 필요**:
- Quote reply도 passive engagement 수집 대상인가?
  - YES → 버그 수정 필요 (referenced_tweets.type 활용)
  - NO → 현재 로직이 의도된 동작 (문서화 필요)

**관련 파일**:
- `cdk/lambda-src/x-leaderboard/src/services/twitter-api.ts:596` (isReply 로직)
- `cdk/lambda-src/x-leaderboard/src/handlers/batch/get-target-tweets.ts:152` (필터링 로직)

---

#### 📅 2025-10-28: 치명적 버그 3건 수정 완료 ✅

**작업 일시**: 2025-10-28 00:00-04:00 KST (4시간)
**수정된 버그**: 3건 (Critical 1건, High 1건, Medium 1건)
**상세 보고서**: [doc/OCTOBER_28_BUG_FIXES_AND_IMPROVEMENTS.md](doc/OCTOBER_28_BUG_FIXES_AND_IMPROVEMENTS.md)

---

**🐛 Bug #1: 리더보드 순위 정렬 버그 (CRITICAL)** ⚠️

**문제**: 점수가 **높은 사용자가 낮은 순위**에 배치되는 치명적 버그
```
실제 케이스:
  5위: @ohiopppp - 53.04점 ❌
  6위: @mashpotatop - 57.92점 ❌ (더 높은데 낮은 순위!)
```

**근본 원인**: `leaderboard-generator.ts:514-515`에서 순위 결정 시 불완전한 점수 계산
```typescript
// ❌ 버그 코드 (activityBonus/inactivityPenalty 누락)
const currentTotal = user.totalScore + activeDaysScore;

// ✅ 수정 코드 (finalScore 사용)
const currentTotal = (user as any).finalScore;
```

**역사적 버그**: 2025-10-26부터 존재 (activeDaysScore 추가 시점)

**해결 방법**: 정렬과 순위 결정 모두 finalScore 사용

**배포 정보**:
- Lambda 빌드: 5초
- CDK 배포: 76.67초 (25개 Lambda 업데이트)
- 파이프라인: SUCCEEDED (15분)
- 수정 파일: `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts:514-515`

---

**🐛 Bug #2: 검색창 커서 사라짐 문제 (HIGH)**

**문제**: 사용자 검색 시 커서가 사라지는 문제
- 천천히 입력: 2자에서 커서 사라짐 ❌
- 빠르게 입력: 5자까지 가능 ✅

**근본 원인**: React Query API 응답 타이밍 문제
- `setQuery(value)` 즉시 실행 → 300-500ms 후 API 응답 → 재렌더링 → 커서 유실

**해결 방법**: 500ms Debounce 추가 + 자동완성 제거
```typescript
// ✅ 수정 코드
const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleInputChange = (e) => {
  setInputValue(value); // 즉시 표시

  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }

  debounceTimerRef.current = setTimeout(() => {
    setQuery(value); // 500ms 후 검색
  }, 500);
};
```

**추가 개선**:
- 자동완성 드롭다운 완전 제거 (UI 충돌 해결)
- API 호출 17% 감소
- Google 스타일 즉시 검색 구현

**수정 파일**: `frontend/src/components/app/Leaderboard/components/UserSearchBox.tsx`

---

**🐛 Bug #3: My Account 페이지 리로드 문제 (MEDIUM)**

**문제**: My Account 아이콘 재클릭 시 페이지는 리로드되지만 최상단으로 스크롤 안 됨

**해결 방법**: `window.scrollTo(0, 0)` 추가
```typescript
// ✅ 수정 코드
if (location.pathname === "/my-account") {
  window.scrollTo(0, 0);      // 먼저 스크롤
  window.location.reload();   // 그 다음 리로드
}
```

**수정 파일**: `frontend/src/components/navbar/Navbar.tsx:107`

---

**📦 배포 요약**:
- **백엔드**: Lambda 1개 수정, 파이프라인 성공
- **프론트엔드**: 파일 2개 수정, 빌드 성공 (11.12초)
- **영향 범위**: 전체 사용자 (~200명)

**🎯 핵심 교훈**:
1. 점수 계산은 항상 단일 소스(finalScore) 사용
2. React Query + 즉시 setState = 재렌더링 주의
3. 사용자 행동 패턴이 버그 힌트 제공 ("빠른 입력은 되는데...")

---

#### 📅 2025-10-27: React Query 캐싱 최적화 구현 완료 (Stage 5) ✅

**구현 목적**: 불필요한 API 재요청을 방지하고, 사용자 경험을 개선하기 위해 React Query 캐싱 전략을 최적화했습니다.

**구현 내용**:
- ✅ **useMyRank staleTime 증가**: 3분 → 30분 (10배 증가)
- ✅ **useCumulativeLeaderboard CACHE_DURATION 증가**: 5분 → 30분 (6배 증가)
- ✅ **useUserSearch React Query 전환**: useState → useQuery (10분 캐싱 추가)
- ✅ **useAutocomplete React Query 전환**: Debounce + useQuery (5분 캐싱 추가)
- ✅ **계층적 staleTime 전략**: 30분 (리더보드) / 10분 (검색) / 5분 (자동완성)

**핵심 메트릭** (계층적 staleTime 전략):

**Tier 1: Long staleTime (30분)**
- **적용 대상**: useMyRank, useCumulativeLeaderboard
- **이유**: 리더보드는 매일 09:10 AM에 1회 업데이트
- **staleTime**: 30분 (1800초)
- **gcTime**: 1시간 (3600초)

**Tier 2: Medium staleTime (10분)**
- **적용 대상**: useUserSearch
- **이유**: 신규 사용자 추가 가능성
- **staleTime**: 10분 (600초)
- **gcTime**: 30분 (1800초)

**Tier 3: Short staleTime (5분)**
- **적용 대상**: useAutocomplete
- **이유**: 실시간성 중요, 빠른 변경 반영 필요
- **staleTime**: 5분 (300초)
- **gcTime**: 15분 (900초)

**수정된 파일** (4개):
- `frontend/src/components/app/Leaderboard/hooks/useMyRank.ts`: staleTime 30분, 주석 추가 (Line 99-116)
- `frontend/src/components/app/Leaderboard/hooks/useCumulativeLeaderboard.ts`: CACHE_DURATION 30분, 주석 추가 (Line 10-18)
- `frontend/src/components/app/Leaderboard/hooks/useUserSearch.ts`: React Query 전환, 10분 캐싱 (전체 파일 리팩토링)
- `frontend/src/components/app/Leaderboard/hooks/useAutocomplete.ts`: React Query 전환, Debounce + 5분 캐싱 (전체 파일 리팩토링)

**성능 개선** (예상):
- ✅ API 요청 횟수: **60-80% 감소** (브라우저 캐시 활용)
- ✅ 탭 전환 시: **즉시 데이터 표시** (로딩 스피너 없음)
- ✅ API Gateway 캐시 히트율: **+10-20% 향상** (Stage 4와 시너지)
- ✅ 사용자 경험: 빠르고 부드러운 UX (탭 전환, 검색 반복 시)

**기술적 개선**:
- **React Query 전환**: useState → useQuery (useUserSearch, useAutocomplete)
- **Debounce 로직 분리**: useEffect로 깔끔하게 분리 (useAutocomplete)
- **AbortController 제거**: React Query가 자동으로 요청 취소 처리
- **타입 안전성 개선**: `results: SearchResultData | null | undefined` (initial state 명시)

**검증 완료**:
- ✅ TypeScript 컴파일 에러 없음 (`npx tsc --noEmit`)
- ✅ 프로덕션 빌드 성공 (`npm run build`, 10.67초)
- ✅ 빌드 크기: 정상 (index-D9l1zdZ7.js: 2.1MB gzipped: 733.77KB)

**배포 정보**:
- **배포 일시**: 2025-10-27 22:15 KST (예정)
- **배포 대상**: 프론트엔드 전용 (백엔드 변경 없음)
- **롤백 전략**: Git Revert (구현 계획서 Section 6 참조)

**상세 문서**:
- **구현 계획서**: [doc/REACT_QUERY_CACHING_IMPLEMENTATION_PLAN.md](doc/REACT_QUERY_CACHING_IMPLEMENTATION_PLAN.md) (v1.0.0)

**Git 정보**:
- **커밋**: (진행 중)
- **브랜치**: feature/activity-bonus-penalty-system

**배포 시간**: 약 20분 (코드 작성 + 빌드 테스트)

---

#### 📅 2025-10-27: DynamoDB 모니터링 강화 구현 완료 ✅

**구현 내용**:
- ✅ **SystemErrors Alarm**: AWS 내부 오류 즉시 감지 (Threshold: 1회, Period: 5분)
- ✅ **ConditionalCheckFailedRequests Alarm**: 조건부 업데이트 실패 과다 감지 (Threshold: 100회/5분, EvaluationPeriods: 2)
- ✅ **CloudWatch Dashboard**: DynamoDB 에러율 위젯 추가 (SystemErrors, ConditionalCheckFailed, Throttles)

**알람 세부사항**:

1. **NASUN-DynamoDB-시스템에러**
   - Metric: `SystemErrors` (AWS 내부 오류, HTTP 500)
   - Threshold: 1회 이상
   - 심각도: **Critical** (AWS 인프라 문제)
   - 대응: AWS Service Health Dashboard 확인 → AWS Support 티켓 생성

2. **NASUN-DynamoDB-조건부체크실패**
   - Metric: `ConditionalCheckFailedRequests` (낙관적 잠금 충돌)
   - Threshold: 100회/5분
   - EvaluationPeriods: 2회 연속 (오탐 방지)
   - 심각도: **Medium** (정상 동시성 제어 vs 비정상 패턴)
   - 대응: CloudWatch Logs 패턴 분석 → 동시성 전략 재검토

**수정된 파일**:
- `cdk/lib/monitoring-stack.ts`: 2개 알람 추가 (Line 200-227), Dashboard 위젯 추가 (Line 112-142)

**배포 정보**:
- **배포 일시**: 2025-10-27 21:49 KST
- **배포 시간**: 18초
- **리소스 변경**:
  - `V2DynamoDbSystemErrorsAlarm` - CREATE_COMPLETE
  - `V2DynamoDbConditionalCheckFailedAlarm` - CREATE_COMPLETE
  - `MonitoringDashboard` - UPDATE_COMPLETE

**검증 완료**:
- ✅ 4개 DynamoDB 알람 생성 확인 (시스템에러, 조건부체크실패, 읽기스로틀링, 쓰기스로틀링)
- ✅ SNS Topic 연동 정상 (`nasun-monitoring-alerts`)
- ✅ Dashboard 위젯 정상 표시

**기대 효과**:
- AWS 내부 오류 즉시 감지 및 알림
- 데이터 무결성 리스크 조기 경고
- 낙관적 잠금 충돌 패턴 모니터링
- 서비스 가용성 모니터링 강화

**관련 문서**:
- **구현 계획서**: [doc/DYNAMODB_MONITORING_IMPLEMENTATION_PLAN.md](doc/DYNAMODB_MONITORING_IMPLEMENTATION_PLAN.md)

---

#### 📅 2025-10-27: Step Functions 모니터링 강화 구현 완료 ✅

**구현 내용**:
- ✅ **ExecutionsFailed Alarm**: 파이프라인 실행 실패 즉시 감지 (Threshold: 1회, Period: 5분)
- ✅ **ExecutionTimedOut Alarm**: 파이프라인 타임아웃 감지 (Threshold: 1시간, Period: 5분)
- ✅ **CloudWatch Dashboard**: Step Functions 위젯 2개 추가 (실행 상태, 실행 시간)

**알람 세부사항**:

1. **NASUN-파이프라인-실행실패**
   - Metric: `ExecutionsFailed` (파이프라인 실행 실패)
   - Threshold: 1회 이상
   - 심각도: **High** (데이터 수집 중단)
   - 대응: CloudWatch Logs에서 실패 원인 확인 → 해당 Lambda 함수 점검

2. **NASUN-파이프라인-타임아웃**
   - Metric: `ExecutionTime` (파이프라인 실행 시간)
   - Threshold: 3,600,000ms (1시간)
   - 심각도: **Medium** (성능 저하)
   - 대응: Lambda 실행 시간 분석 → API 호출 최적화 검토

**Dashboard 위젯**:
- **파이프라인 실행 상태 (24시간)**: 시작됨/성공/실패/타임아웃 메트릭 시각화
- **파이프라인 실행 시간**: 평균/최대 실행 시간 트렌드

**수정된 파일**:
- `cdk/lib/monitoring-stack.ts`: 2개 알람 추가 (Line 262-288), Dashboard 위젯 추가 (Line 145-174)
- `cdk/bin/cdk.ts`: leaderboardDataPipeline prop 전달 (Line 39)

**배포 정보**:
- **배포 일시**: 2025-10-27 22:03 KST
- **배포 시간**: 16.86초
- **리소스 변경**:
  - `StepFunctionsFailedAlarm` - CREATE_COMPLETE
  - `StepFunctionsTimeoutAlarm` - CREATE_COMPLETE
  - `MonitoringDashboard` - UPDATE_COMPLETE

**검증 완료**:
- ✅ 2개 Step Functions 알람 생성 확인 (실행실패, 타임아웃)
- ✅ SNS Topic 연동 정상 (`nasun-monitoring-alerts`)
- ✅ Dashboard 위젯 정상 표시 (실행 상태, 실행 시간)

**기대 효과**:
- 파이프라인 실패 즉시 감지 및 알림
- 성능 저하 조기 경고 (1시간 초과 시)
- 실행 상태 및 시간 트렌드 시각화
- 리더보드 데이터 수집 안정성 향상

**관련 문서**:
- **구현 계획서**: [doc/STEP_FUNCTIONS_MONITORING_IMPLEMENTATION_PLAN.md](doc/STEP_FUNCTIONS_MONITORING_IMPLEMENTATION_PLAN.md)

---

#### 📅 2025-10-27: Lambda Timeout 모니터링 구현 완료 ✅

**구현 내용**:
- ✅ **11개 Lambda 함수 타임아웃 알람**: 80% 임계값 기준 조기 경고
- ✅ **CloudWatch Dashboard**: Lambda Duration 위젯 3개 추가 (API/처리/수집)
- ✅ **우선순위별 임계값 설정**: API 24s, 처리 480s/720s, 수집 240s/480s

**알람 세부사항** (총 11개):

**1. API Lambda (High Priority, 3개)** - 사용자 경험 직접 영향
- **Get Leaderboard**: 30s timeout → 24s 경고 (80%)
- **Get Bookmark Stats**: 30s timeout → 24s 경고
- **Get User Rank**: 30s timeout → 24s 경고

**2. 처리 Lambda (Medium Priority, 3개)** - 핵심 데이터 처리
- **Score Calculator**: 600s timeout → 480s 경고 (8분)
- **Aggregate Results**: 900s timeout → 720s 경고 (12분)
- **Leaderboard Generator**: 900s timeout → 720s 경고 (12분)

**3. 수집 Lambda (Low Priority, 5개)** - 데이터 수집
- **Collect Likes**: 300s timeout → 240s 경고 (4분)
- **Collect Retweets**: 300s timeout → 240s 경고
- **Collect Quotes**: 300s timeout → 240s 경고
- **Collect Mentions Search**: 300s timeout → 240s 경고
- **Collect Mention Details**: 600s timeout → 480s 경고 (8분)

**Dashboard 위젯**:
- **Lambda Duration - API**: API 함수 3개 실행 시간 모니터링
- **Lambda Duration - 처리**: 처리 함수 3개 실행 시간 트렌드
- **Lambda Duration - 수집**: 수집 함수 5개 실행 시간 트렌드

**수정된 파일**:
- `cdk/lib/monitoring-stack.ts`: Props 확장 (Line 19-31), 11개 알람 추가 (Line 334-493), 3개 위젯 추가 (Line 189-268)
- `cdk/bin/cdk.ts`: Lambda props 전달 (Line 41-48)

**배포 정보**:
- **배포 일시**: 2025-10-27 22:16 KST
- **배포 시간**: 22.74초
- **리소스 변경**: 11개 알람 CREATE_COMPLETE, Dashboard UPDATE_COMPLETE

**검증 완료**:
- ✅ 11개 Lambda 타임아웃 알람 생성 확인
- ✅ 임계값 정확성 확인 (24s/240s/480s/720s)
- ✅ SNS Topic 연동 정상 (`nasun-monitoring-alerts`)
- ✅ Dashboard 위젯 3개 정상 표시

**기대 효과**:
- Lambda 타임아웃 발생 전 조기 경고 (80% 임계값)
- 성능 저하 트렌드 조기 감지
- 함수별 실행 시간 시각화 및 비교
- 타임아웃으로 인한 데이터 손실 방지
- 프로덕션 안정성 향상

**설정 원칙**:
- **Metric**: Duration (Maximum statistic)
- **Period**: 5분
- **EvaluationPeriods**: 2회 연속 (오탐 방지)
- **Threshold**: Timeout의 80%
- **SNS 알림**: nasun-monitoring-alerts

**관련 문서**:
- **구현 계획서**: [doc/LAMBDA_TIMEOUT_MONITORING_IMPLEMENTATION_PLAN.md](doc/LAMBDA_TIMEOUT_MONITORING_IMPLEMENTATION_PLAN.md)

---

#### 📅 2025-10-27: API Gateway 캐싱 활성화 구현 완료 ✅

**구현 내용**:
- ✅ **1.6 GB 캐시 클러스터 활성화**: 프로덕션 환경 최적화
- ✅ **30분 기본 TTL**: 리더보드 데이터 캐싱
- ✅ **암호화 활성화**: 캐시 데이터 보안 강화
- ✅ **스로틀링 설정**: 1000 req/s, burst 2000

**캐싱 설정**:
- **CacheClusterSize**: 1.6 GB
- **CacheTtl**: 1800초 (30분)
- **CacheDataEncrypted**: true
- **ThrottlingRateLimit**: 1000 req/s
- **ThrottlingBurstLimit**: 2000

**적용 범위**:
- 모든 GET 메서드에 대해 캐싱 활성화
- Path parameters, Query string parameters 자동 캐시 키 생성
- POST/PUT/DELETE 요청은 캐싱 제외 (기본 동작)

**수정된 파일**:
- `cdk/lib/cdk-stack.ts`: deployOptions 추가 (Line 593-604)

**배포 정보**:
- **배포 일시**: 2025-10-27 22:24 KST
- **배포 시간**: 59.36초
- **리소스 변경**: API Gateway Stage UPDATE_COMPLETE
- **캐시 클러스터 상태**: CREATE_IN_PROGRESS (백그라운드 생성 중)

**검증 완료**:
- ✅ cacheClusterEnabled: true
- ✅ cacheClusterSize: 1.6 GB
- ✅ cachingEnabled: true (모든 메서드)
- ✅ cacheTtlInSeconds: 1800
- ✅ cacheDataEncrypted: true
- ⏳ cacheClusterStatus: CREATE_IN_PROGRESS

**기대 효과**:
- Lambda 호출 횟수 **70-90% 감소**
- 평균 응답 시간 **50-80ms로 단축** (300-600ms → 50-80ms)
- DynamoDB 읽기 용량 사용량 **70% 감소**
- 월 운영 비용 절감 (Lambda + DynamoDB 호출 감소)
- 사용자 경험 개선 (빠른 페이지 로딩)

**비용**:
- **월 $54.36** (1.6 GB 캐시 클러스터)
- Lambda/DynamoDB 호출 감소로 상쇄 가능

**캐시 클러스터 완료 확인** (몇 분 후):
```bash
aws apigateway get-stage --rest-api-id bb4zdy0rwe --stage-name prod --region ap-northeast-2 --query 'cacheClusterStatus'
# 예상 결과: "AVAILABLE"
```

**관련 문서**:
- **구현 계획서**: [doc/API_GATEWAY_CACHING_IMPLEMENTATION_PLAN.md](doc/API_GATEWAY_CACHING_IMPLEMENTATION_PLAN.md)

---

#### 📅 2025-10-27: Activity Bonus/Penalty System 구현 완료 (Threshold=3) ✅

**구현 목적**: 사용자의 **일관된 활동을 보상**하고 **비활동을 불이익**으로 처리하여, 리더보드 순위의 공정성과 참여 동기를 강화합니다.

**핵심 메트릭** (Threshold=3 설계):

**Activity Bonus (7-Day)**:
- **Threshold**: 3일 (보너스 시작 임계값)
- **Weight**: 0.28/일 (일당 가중치)
- **Formula**: `(activeDays - 3 + 1) × 0.28`
- **Range**: +0.0 ~ +1.4점
- **Coverage**: 70% of users (45% → 70%, +25% 증가)

**보너스 테이블**:
| 활동 일수 | 보너스 점수 | 비율 |
|----------|-----------|------|
| 0-2일 | 0.0 | 0% |
| 3일 | +0.3 | 30% |
| 4일 | +0.6 | 25% |
| 5일 | +0.8 | 15% |
| 6일 | +1.1 | 10% |
| 7일 | +1.4 | 20% |

**Inactivity Penalty (3+ Days)**:
- **Threshold**: 3일 (감점 시작 임계값)
- **Penalty**: 0.3/일 (일당 감점)
- **Max Penalty**: 5.0 (최대 감점 캡)
- **Formula**: `-min((daysSince - 2) × 0.3, 5.0)`
- **Range**: 0.0 ~ -5.0점

**감점 테이블**:
| 비활동 일수 | 감점 | 최종 감점 |
|-----------|------|---------|
| 0-2일 | 0.0 | 0.0 |
| 3일 | -0.3 | -0.3 |
| 7일 | -1.5 | -1.5 |
| 20일+ | -5.4+ | **-5.0** (capped) |

**Threshold=3 선택 이유** (사용자 피드백 반영):
- ✅ **대칭성 확보**: 보너스와 감점 모두 3일에서 시작
- ✅ **커버리지 증가**: 보너스 수혜자 45% → 70% (+25%)
- ✅ **가중치 조정**: 0.2 → 0.28 (최대 보너스 1.4 유지)

**구현 내용**:

**Phase 1: Backend 구현** (5개 작업 완료):
- ✅ `getActiveDaysInLast7Days()` - 최근 7일 중 활동 일수 계산 (0-7)
- ✅ `getDaysSinceLastActivity()` - 마지막 활동 이후 경과일 (0-30+)
- ✅ `calculateActivityBonus()` - 보너스 점수 계산 (Linear scaling)
- ✅ `calculateInactivityPenalty()` - 감점 계산 (Linear with cap)
- ✅ LeaderboardGenerator 통합 (Active Days tie-breaker 이후 적용)

**Phase 2: 환경 변수** (8개 추가):
```bash
ACTIVITY_BONUS_ENABLED=true
ACTIVITY_BONUS_WEIGHT_PER_DAY=0.28
ACTIVITY_BONUS_THRESHOLD_DAYS=3
ACTIVITY_BONUS_PERIOD_DAYS=7
INACTIVITY_PENALTY_ENABLED=true
INACTIVITY_PENALTY_THRESHOLD=3
INACTIVITY_PENALTY_PER_DAY=0.3
INACTIVITY_PENALTY_MAX=5.0
```

**Phase 3: 배포** (2025-10-27 14:42 KST):
- ✅ TypeScript 컴파일 (5개 핸들러)
- ✅ CDK 배포 (82초, 26개 리소스 업데이트)
- ✅ Lambda 환경 변수 검증 (8개 정상)
- ✅ 파이프라인 실행 시작 (`activity-bonus-test-20251027`)

**Phase 4: 버그 발견 및 수정** (2025-10-27 15:40, 16:00 KST):

**🐛 Bug #1: 필드명 불일치** (`enableActivityBonus`)
- **문제**: env.ts가 `activityBonusEnabled` 사용, 코드는 `enableActivityBonus` 참조
- **증상**: `this.config.enableActivityBonus === undefined` → 조건문 실행 안 됨
- **수정**: env.ts를 `enableActivityBonus`, `enableInactivityPenalty`로 변경 (일관성)
- **커밋**: `8f2d37b` (2025-10-27 15:40 KST)

**🐛 Bug #2: Threshold 필드명 불일치** (`activityBonusThresholdDays`)
- **문제**: env.ts는 `activityBonusThresholdDays`, 코드는 `activityBonusThreshold` 참조
- **증상**: `threshold: undefined` → `eligibleDays: NaN` → `bonus: NaN`
- **수정**: leaderboard-generator.ts Line 416을 `this.config.activityBonusThresholdDays` 사용
- **커밋**: `576efcc` (2025-10-27 16:00 KST)

**Phase 5: 최종 검증 완료** ✅ (2025-10-27 16:01-16:17 KST):
- ✅ **파이프라인 실행**: `activity-bonus-threshold-fix-20251027-160116` (SUCCEEDED)
- ✅ **실행 시간**: 16:01:17 - 16:16:59 KST (15분 42초)
- ✅ **CloudWatch 로그 검증**:
  - 📈 `[Activity Bonus]` threshold=3, 보너스 0.3/0.8/1.1/1.4점 정상 계산
  - 📉 `[Inactivity Penalty]` 감점 -0.3/-0.6/-1.5점 정상 적용
  - 🎯 `[Final Score]` = totalScore + activeDaysScore + activityBonus + inactivityPenalty
- ✅ **DynamoDB 검증**:
  - CUMULATIVE 리더보드 144 entries 저장
  - EVENT2 리더보드 40 entries 저장
  - 모든 필드 (activityBonus, activeDaysLast7, inactivityPenalty, daysSinceLastActivity) 정상

**실제 적용 사례** (CloudWatch Logs):
```javascript
// 사용자 1503536552164556804 (5일 활동)
{
  totalScore: 77.23,
  activeDaysScore: 0.5,
  activityBonus: 0.8,        // 5일 활동 → (5-3+1) × 0.28 = 0.8점
  inactivityPenalty: 0,
  finalScore: 78.5           // 77.23 + 0.5 + 0.8 = 78.53 → 78.5
}

// 사용자 1919009809623613440 (3일 활동)
{
  totalScore: 25.74,
  activeDaysScore: 0.4,
  activityBonus: 0.3,        // 3일 활동 → (3-3+1) × 0.28 = 0.3점
  inactivityPenalty: -0.3,   // 3일 비활동 → -0.3점
  finalScore: 26.1           // 25.74 + 0.4 + 0.3 - 0.3 = 26.14 → 26.1
}
```

**수정된 파일** (5개):
- `cdk/lambda-src/x-leaderboard/src/utils/active-days-calculator.ts` (232줄 추가)
- `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts` (85줄 추가)
- `cdk/lambda-src/x-leaderboard/src/utils/env.ts` (16줄 추가, 버그 수정 2회)
- `cdk/.env` (19줄 추가)
- `cdk/lib/cdk-stack.ts` (10줄 추가)

**성능 최적화**:
- **Promise.all 병렬 처리**: 100명 기준 50초 → 0.5초 (100배 향상)
- **에러 핸들링**: Fallback 값 (0) 적용으로 안정성 확보
- **소수점 처리**: 첫째자리 반올림으로 정밀도 유지

**롤백 전략**:
1. **Git 태그**: `pre-activity-bonus-20251027` (권장, 5분)
2. **Lambda 백업**: `/tmp/lambda-backup-20251027/` (긴급, 2분)
3. **Feature Flag**: `ENABLED=false` 설정 (최소 영향, 3분)

**상세 문서**:
- **구현 계획서**: [doc/ACTIVITY_BONUS_PENALTY_IMPLEMENTATION_PLAN.md](doc/ACTIVITY_BONUS_PENALTY_IMPLEMENTATION_PLAN.md) (v1.1.0)
- **검증 보고서**: [doc/ACTIVITY_BONUS_PENALTY_VERIFICATION_REPORT.md](doc/ACTIVITY_BONUS_PENALTY_VERIFICATION_REPORT.md)
- **종합 보고서 (Gemini 검증용)**: [doc/ACTIVITY_BONUS_PENALTY_COMPREHENSIVE_REPORT.md](doc/ACTIVITY_BONUS_PENALTY_COMPREHENSIVE_REPORT.md) ⭐ **NEW!**
  - **목적**: Gemini AI가 Claude의 보고서에 의존하지 않고 독립적으로 시스템 작동 상태를 재검증
  - **특징**: AWS CLI 명령어, CloudWatch Logs 쿼리, DynamoDB 검증 방법 상세 포함 (1,448줄)
  - **포함 내용**: 7단계 검증 절차, 40+ 체크리스트, 샘플 검증 스크립트, 트러블슈팅 가이드

**Git 정보**:
- **Feature 브랜치**: `feature/activity-bonus-penalty-system`
- **백업 태그**: `pre-activity-bonus-20251027`
- **Base Commit**: `ecde3d2` (Rank History UI/UX 개선)
- **버그 수정 커밋**: `8f2d37b`, `576efcc`

**배포 시간**: 약 42분 (14:00-14:42 KST)

---

#### 📅 2025-10-27: 로딩 UI 통일화 - 웹사이트 전체 일관성 개선 ✅

**문제**: Leaderboard 메뉴 클릭 시 2개의 서로 다른 로딩 아이콘이 연속으로 표시되는 이중 로딩 UI 문제 발생. 웹사이트 전체적으로 7가지 이상의 서로 다른 로딩 패턴 사용.

**해결 내용**:
- ✅ **3개의 표준 로딩 컴포넌트 생성**:
  - `SectionLoading` - Suspense 폴백 및 섹션 로딩용 (58줄)
  - `InlineLoading` - 버튼 및 인라인 영역용 (68줄)
  - `PageLoading` - 전체 화면 로딩용 (48줄)
- ✅ **15+ 페이지/컴포넌트 적용**: HomePage, MyAccountPage, LeaderboardPage, TeamPage, RoadmapPage, ProposalPage, NewsPage, Callback, UserInfo, RankHistorySection 등
- ✅ **이중 로딩 문제 해결**: LeaderboardPage Suspense fallback을 `null`로 설정하여 CumulativeLeaderboard의 LoadingState만 표시

**기술적 특징**:
- `showLayout` prop으로 SectionLayout 중복 방지
- 3가지 크기 옵션 (sm, md, lg) 지원
- 다크 모드 완벽 지원
- i18n 통합 (한국어/영어)
- 중앙 관리로 향후 유지보수 용이

**수정된 파일**:
- **생성**: `frontend/src/components/common/SectionLoading.tsx`, `InlineLoading.tsx`, `PageLoading.tsx`, `index.ts`
- **수정**: 12개 페이지/컴포넌트 파일

**커밋 히스토리**:
```bash
dd1c6ea - fix: Fix JavaScript syntax error in TextBox and CtaBox
ae18c91 - refactor(Loading): Create standardized loading components (Phase 1-2)
cdf72f8 - refactor(Loading): Apply standardized loading components to main pages (Phase 3)
c545b99 - refactor(Loading): Apply standardized loading components to special pages (Phase 4)
cb78f51 - refactor(Loading): Improve component internal loading states (Phase 5)
```

**사용 가이드**:
```tsx
// 1. SectionLoading - Suspense 폴백, 섹션 로딩
import { SectionLoading } from "../components/common";

<Suspense fallback={<SectionLoading />}>
  <MyComponent />
</Suspense>

// 자식 컴포넌트에 이미 SectionLayout이 있는 경우
<Suspense fallback={<SectionLoading showLayout={false} />}>
  <ComponentWithLayout />
</Suspense>

// 2. InlineLoading - 버튼, 작은 영역
import { InlineLoading } from "../components/common";

<button disabled>
  <InlineLoading size="sm" message="Saving..." />
</button>

// 3. PageLoading - 전체 화면
import { PageLoading } from "../components/common";

if (isLoading) return <PageLoading />;
```

**검증 완료**:
- ✅ TypeScript 컴파일 에러 없음
- ✅ ESLint 체크 통과
- ✅ 프로덕션 빌드 성공 (10.28s)
- ✅ 다크 모드 전환 정상 작동

**영향 범위**: 프론트엔드 전체 (15+ 페이지)

---

#### 📅 2025-10-26: 리더보드 스코어링 메트릭 최적화 - Option 2 적용 ✅

**변경 내용**:
- ✅ **인게이지먼트 점수 1/5 축소 (총점 관리)**:
  - Likes: 0.5 → **0.2** (비율: 1)
  - Replies: 1.0 → **0.4** (비율: 2)
  - Reposts: 1.0 → **0.4** (비율: 2)
  - Quotes: 1.6 → **0.6** (비율: 3)
  - Mentions: 2.0 → **0.5** (비율: 2.5)
  - **비율 완벽 유지**: 1 : 2 : 2 : 3 : 2.5

- ✅ **한국어 언어 가중치 대폭 감소**:
  - languageMultiplier: 1.2 → **1.02** (-15%)
  - logBase(8 vs 30)로 이미 차별화, 언어 가중치는 미세 조정 수준

**점수 범위 개선**:
- 기존: 100-800점 (너무 큼) ❌
- 변경 후: **10-200점** (직관적이고 관리 용이) ✅
  - 소규모 사용자: 1-10점
  - 중규모 사용자: 10-50점
  - 대규모 사용자: 50-200점

**커뮤니티 균형**:
- 한국어 우위: 1.57배 → **1.34배** (34% 더 높음)
- 차이의 대부분은 logBase에서 발생, 언어 가중치는 보조 수단
- 더 공정한 경쟁 환경 조성

**수정된 파일**:
- `cdk/lib/cdk-stack.ts`: Lambda 환경변수 (Line 173, 191-195, 230-234)
- `cdk/lambda-src/x-leaderboard/src/utils/env.ts`: 기본값 동기화 (Line 147-151)
- `cdk/lambda-src/x-leaderboard/src/types/community.ts`: DEFAULT_WEIGHT_CONFIG (Line 272)

**상세 문서**: [doc/SCORING_METRICS_ANALYSIS.md](doc/SCORING_METRICS_ANALYSIS.md) (v2.0.0)

**배경**:
1. Perplexity AI 분석 기반 메트릭 제안 ([temp/scoring.md](temp/scoring.md))
2. 총점이 너무 커지는 문제 해결 (Option 2 선택)
3. 언어 가중치는 미세하게, logBase가 주 차별화 요소

---

#### 📅 2025-10-26: 언어 감지 및 Quote Tweet 중복 방지 로직 구현 ✅

**해결된 버그**:
1. **Bug #1**: 언어 감지 실패 - `dominantLanguage: "qme"` 문제
   - **증상**: overclocksalmon (영어 사용자)이 "qme"로 분류됨
   - **원인**: `inferDominantLanguageFromUsername()`이 X API의 `engaging_tweet_lang` 필드를 무시
   - **해결**: `inferLanguageFromEngagements()` 메서드 추가로 tweet_lang 우선 사용

2. **Bug #2**: Quote Tweet 중복 카운팅
   - **증상**: 타겟 계정 트윗의 Quote가 mention + quote로 이중 수집됨
   - **원인**: Active Collection(1일)과 Passive Collection(3일)이 동일 트윗 수집
   - **해결**: Active Collection에서 타겟 트윗의 Quote는 건너뛰기 (Passive에서만 수집)

**수정된 Lambda**:
- ✅ `nasun-score-calculator`: 언어 감지 로직 개선
- ✅ `nasun-get-target-tweets`: targetTweetIds 추출 및 반환
- ✅ `nasun-collect-mention-details`: Quote 중복 방지 로직 추가
- ✅ `nasun-leaderboard-pipeline` (Step Functions): targetTweetIds 전달

**배포 정보**:
- **Git Commit**: b4d345d
- **배포 일시**: 2025-10-26 10:03 KST
- **배포 방법**: `pnpm cdk deploy CdkStack --require-approval never`
- **백업 태그**: `pre-quote-fix-20251026-095009`

**검증 완료**:
- ✅ 모든 Lambda 코드 배포 확인
- ✅ targetTweetIds 추출 로직 작동 확인
- ✅ 파이프라인 실행 시작
- ⏳ 파이프라인 완료 후 데이터 검증 필요 (overclocksalmon dominantLanguage 확인)

**롤백 방법** (문제 발생 시):
```bash
# Git Revert (권장)
git revert b4d345d
cd cdk/lambda-src/x-leaderboard && npm run build && cd ../../
pnpm cdk deploy CdkStack --require-approval never

# 또는 Lambda 직접 복구 (긴급)
aws lambda update-function-code --function-name nasun-score-calculator \
  --zip-file fileb:///tmp/lambda-backup-20251026/score-calculator.zip \
  --region ap-northeast-2
```

**관련 문서**:
- **구현 완료 보고서**: [doc/QUOTE_MENTION_FIX_COMPLETION_REPORT.md](doc/QUOTE_MENTION_FIX_COMPLETION_REPORT.md)
- **구현 계획서**: [doc/QUOTE_MENTION_IMPLEMENTATION_PLAN.md](doc/QUOTE_MENTION_IMPLEMENTATION_PLAN.md)
- **디버깅 계획서**: [doc/QUOTE_MENTION_DEBUG_PLAN.md](doc/QUOTE_MENTION_DEBUG_PLAN.md)

---

#### 📅 2025-10-25: NFT Event X API Username → User ID 버그 수정 ✅

**문제**: NFT Event "Verify Tasks" 기능에서 Follow/Like/Retweet 검증 시 **403 Forbidden** 에러 발생

**근본 원인**: Lambda가 X API 호출 시 **username** (문자열 `"Naru010110"`)을 사용했으나, X API v2는 **numeric User ID** (`"1863020068785004544"`)를 요구

**해결 내용**:
- ✅ `cdk/.env`에 `X_TARGET_USER_ID=1863020068785004544` 추가
- ✅ `verify-eligibility/src/index.ts` 수정: `targetUserId: env.X_TARGET_USER_ID` 사용
- ✅ `NftEventStack` CDK에 환경 변수 추가
- ✅ Lambda 빌드 및 배포 완료 (2025-10-25 16:46 KST)

**핵심 교훈**:
> ⚠️ **X API는 username이 아닌 numeric User ID를 요구합니다**
> - `"Naru010110"` (username) → ❌ 403 에러
> - `"1863020068785004544"` (User ID) → ✅ 정상 작동

**User ID 확인 방법**:
```bash
# X API 사용 (권장)
curl -X GET "https://api.x.com/2/users/by/username/Naru010110" \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN"

# 온라인 도구
# https://tweeterid.com/
# https://www.codeofaninja.com/tools/find-twitter-id/
```

**관련 문서**:
- **버그 수정 보고서**: [doc/NFT_EVENT_X_API_USER_ID_BUG_FIX_REPORT.md](doc/NFT_EVENT_X_API_USER_ID_BUG_FIX_REPORT.md)
- **환경 변수 가이드**: [doc/NFT_EVENT_ENVIRONMENT_VARIABLES.md](doc/NFT_EVENT_ENVIRONMENT_VARIABLES.md) (X_TARGET_USER_ID 섹션 추가됨)

**배포 상태**: ✅ 완료 (Lambda 환경 변수 검증 완료, E2E 테스트 대기 중)

---

#### 📅 2025-10-24: API 엔드포인트 자동 동기화 시스템 구축 ✅

**구현 내용**:
- ✅ **자동 동기화 스크립트**: `cdk/scripts/sync-api-endpoints.js`
  - CloudFormation Outputs 자동 수집
  - 프론트엔드 `.env` 파일 자동 업데이트
  - Dry-run 모드 지원
- ✅ **통합 배포 스크립트**: `cdk/scripts/deploy-all-with-sync.sh`
  - 모든 CDK 스택 배포 + API 엔드포인트 동기화를 한 번에 실행
- ✅ **npm 스크립트 추가**:
  - `pnpm sync:endpoints` - 즉시 동기화
  - `pnpm sync:endpoints:dry` - 변경사항 미리보기
  - `pnpm deploy:all` - 통합 배포 스크립트 실행

**사용법**:
```bash
# 배포 + 자동 동기화 (권장)
cd cdk
bash scripts/deploy-all-with-sync.sh

# 동기화만 실행
pnpm sync:endpoints

# Dry-run (미리보기)
pnpm sync:endpoints:dry
```

**상세 가이드**: [doc/API_ENDPOINT_SYNC_GUIDE.md](doc/API_ENDPOINT_SYNC_GUIDE.md)

**배경**: 백엔드 재배포 시 API 엔드포인트가 변경되면, 프론트엔드 `.env` 파일을 수동으로 업데이트해야 하는 문제 해결. 이를 잊으면 staging 배포 시 기능이 작동하지 않는 치명적인 문제 발생.

---

#### 📅 2025-10-23: 타겟 트윗 계정 환경 변수 설정 ✅

**구현 내용**:
- ✅ **환경 변수 추가**: `VITE_TARGET_TWEET_ACCOUNT`
  - `.env.development`: `Nasun_io`
  - `.env.production`: `Nasun_io`
- ✅ **MyRankCard 수정**: "Find Target Tweets" 버튼 URL 동적 설정
  - 기존: `https://x.com/nasun_official` (하드코딩)
  - 변경: `https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT}`
  - Fallback: 환경 변수 미설정 시 `nasun_official` 사용

**위치**: [MyRankCard.tsx:89](frontend/src/components/app/Leaderboard/components/MyRankCard.tsx#L89)

**커밋**: `190ea32`

---

#### 📅 2025-10-23: Phase 1-2 사용자 랭킹 검색 완료 ✅
**상세 보고서**: [doc/PHASE1_2_USER_RANK_SEARCH_COMPLETION_REPORT.md](doc/PHASE1_2_USER_RANK_SEARCH_COMPLETION_REPORT.md)

**구현 완료 기능** (58/95 항목, 61% 진행률):

**Phase 1: 기본 기능** (30/30 완료) ✅
- ✅ **MyRankCard** - 나의 랭킹 카드 (4가지 시나리오 완벽 대응)
  - Twitter 미연동, 랭크 없음, 정상 랭크, 스냅샷 모드
- ✅ **UserSearchBox** - 하이브리드 검색 (정확 일치 우선 + 부분 일치)
  - 검색 결과 표시, 프로필 이미지, "해당 순위로 이동" 버튼
- ✅ **Backend API** - 사용자 랭킹 조회, 검색
  - `GET /leaderboard/{period}/user/{username}`
  - `GET /leaderboard/{period}/search?q={query}`
  - DynamoDB GSI: `username-period-index`
- ✅ **Custom Hooks** - useMyRank, useUserSearch (React Query 캐싱)
- ✅ **i18n** - 한국어/영어 번역 완료

**Phase 2: 고급 기능** (20/20 완료) ✅
- ✅ **URL 공유** - `?user={username}&highlight=true`
  - useUrlParams Hook (읽기/업데이트/제거)
  - 자동 하이라이트 활성화
- ✅ **하이라이트** - 6초 자동 강조 (Yellow 배경, pulse 애니메이션)
  - useHighlight Hook (타이머 관리)
  - 다크 모드 지원
- ✅ **페이지 점프** - 부드러운 스크롤 (scrollIntoView)
  - handleViewUserRank: 페이지 이동 + 하이라이트 + URL 업데이트
- ✅ **검색 개선** - @ 제거, 대소문자 무관, 에러 처리

**Phase 3: Autocomplete** (8/8 완료) ✅
- ✅ **실시간 자동완성** - Debounce 300ms, AbortController
- ✅ **전용 API** - `/leaderboard/{period}/autocomplete` (150-300ms)
- ✅ **드롭다운 UI** - 최대 5개 제안, 키보드 지원
- ✅ **성능 최적화** - API 호출 75% 절감

**상세 보고서**: [PHASE3_AUTOCOMPLETE_REPORT.md](doc/PHASE3_AUTOCOMPLETE_REPORT.md)

**아키텍처**:
```
[MyRankCard] → useMyRank → API: getUserRank()
[UserSearchBox] → useUserSearch → API: searchUsers()
                → useAutocomplete → API: autocompleteUsersApi()
[CumulativeLeaderboard] → handleViewUserRank
                        → useUrlParams, useHighlight
[CumulativeLeaderboardRow] → isHighlighted prop
```

**평균 API 응답 시간**:
- getUserRank: 300-600ms
- searchUsers: 300-700ms
- autocomplete: 150-300ms

**남은 작업** (37개 항목):
- ⏳ **Phase 3 랭킹 변동** (8개) - 어제 대비 순위 변화 (↑↓=)
- ⏳ **Phase 3 소셜 공유** (9개) - X 공유, 링크 복사, 이미지 생성

---

#### 📅 2025-10-23: Phase 1-2 버그 수정 및 배포 ✅
**상세 내역**: [doc/PHASE1_2_IMPLEMENTATION_REPORT.md](doc/PHASE1_2_IMPLEMENTATION_REPORT.md)

**추가 버그 수정**:
- ✅ 이벤트 종료 시 스냅샷 자동 폴백 (SunyoungP29745 검색 가능)
- ✅ 하이라이트 지속 버그 수정 (URL 파라미터 자동 제거)
- ✅ **BUG-P1-008**: 스냅샷 Lambda CORS 헤더 수정

**교훈**:
1. GSI 쿼리는 항상 여러 항목(스냅샷 포함)을 반환할 수 있음 → `pk` 필터링 필수
2. CORS 헤더에 `x-api-key` 포함을 표준으로 설정
3. Username 대소문자는 DynamoDB 원본 형식 유지

**배포 횟수**: 2회
**최종 검증**: ✅ 모든 기능 정상 작동 (Fall2026, SunyoungP29745 테스트)

---

#### 📅 2025-10-23: OAuth 2.0 Scope 최대 READ 권한 업데이트
**상세 내역**: [doc/OAUTH2_SCOPE_UPDATE_REPORT.md](doc/OAUTH2_SCOPE_UPDATE_REPORT.md)

**주요 변경사항**:
- ✅ OAuth 2.0 scope를 최대 READ 권한으로 확장 (5개 → 6개)
- ✅ 환경 변수 로딩 개선 (dotenv 적용)
- ✅ Secrets Manager 스키마 수정 (`redirectUri` 추가)
- ✅ 리더보드 반영 메커니즘 문서화

**새로운 Scope**:
```
tweet.read users.read follows.read offline.access like.read list.read
```

**배경**: 디버깅 중 scope 부족으로 5-6회 토큰 재발급 → 향후 재발급 불필요하도록 최대 READ 권한 부여

---

#### 📅 2025-10-22: Phase 1 버그 수정 완료
**상세 내역**: [doc/PHASE1_BUG_FIX_REPORT.md](doc/PHASE1_BUG_FIX_REPORT.md)

#### ✅ 수정 완료된 버그

1. **BUG-001: Active Days Field Name Mismatch (Critical)**
   - **문제**: FilterExpression에서 `addedAt` 필드를 참조했으나 DynamoDB에는 `added_at` (snake_case)로 저장됨
   - **영향**: 모든 사용자의 활동일수가 0으로 계산되어 동점자 순위 결정 실패
   - **수정**: `cdk/lambda-src/x-leaderboard/src/utils/active-days-calculator.ts` (line 133-135)
   - **수정 날짜**: 2025-10-22 14:14 KST
   - **검증 완료**: ✅ 활동일수 정상 계산 확인

2. **BUG-002: Score Weight Environment Variable Inconsistency (Critical)**
   - **문제**: Score Calculator와 Leaderboard Generator가 서로 다른 점수 가중치 사용
   - **영향**: 데이터 무결성 문제, 점수 계산 불일치
   - **수정**: `cdk/lib/cdk-stack.ts` (line 172-176, 195)
   - **수정 날짜**: 2025-10-22 14:14 KST
   - **검증 완료**: ✅ 환경 변수 통일 확인

**통일된 점수 가중치**:
```
SCORE_WEIGHT_LIKES: 0.5
SCORE_WEIGHT_REPLIES: 1.0
SCORE_WEIGHT_REPOSTS: 1.0
SCORE_WEIGHT_QUOTES: 1.6
SCORE_WEIGHT_MENTIONS: 2
```

#### 🔄 진행 중인 조사

3. **BUG-003: Profile Recovery System Failure (High Priority)**
   - **문제**: 34명의 사용자 프로필 복구 실패
   - **상태**: Phase 2에서 조사 예정

4. **BUG-004: Event Leaderboard PK Design Issue (Medium Priority)**
   - **문제**: 이벤트 리더보드 PK 구조로 인한 날짜별 분리
   - **상태**: 요구사항 명확화 필요

---

### 📋 일일 상태 점검 (Daily Health Check) ⭐ **매일 실행 권장!**

리더보드 시스템의 개발/프로덕션 환경 상태를 종합적으로 점검하는 스크립트입니다.

```bash
# 일일 상태 점검 실행
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website
./daily_health_check.sh
```

**점검 항목**:
1. **파이프라인 실행 상태**: 오늘 성공한 파이프라인 확인
2. **데이터 수집 분석**: Mentions, Replies, Likes, Reposts, Quotes 수집량
3. **리더보드 변경 사항**: 어제 vs 오늘 엔트리 수, 신규 진입자
4. **OAuth 토큰 갱신 상태**: CloudWatch 로그 오류 확인, 알람 상태

**실행 전 요구사항**:
- AWS CLI 설치 및 인증 설정
- `nasun-prod` AWS 프로필 설정 (프로덕션 환경용)
- `jq` 설치 권장 (JSON 파싱)

**상세 문서**: [doc/LEADERBOARD_MECHANISM_GUIDE.md](doc/LEADERBOARD_MECHANISM_GUIDE.md#일일-상태-점검-daily-health-check)

---

### 🔴 트위터 로그인 502 에러 재발 방지 (2025-10-13 추가) ⭐ **최우선 주의!**

**문제**: 트위터 로그인이 자꾸 먹통이 되는 반복적인 문제 발생
**근본 원인**: `auth-twitter` Lambda가 TypeScript 컴파일 없이 배포됨

#### 절대 규칙: 스택별로 안전하게 배포하세요!

이제 시스템이 여러 스택(`AuthStack`, `CommonStack`, `CdkStack` 등)으로 분리되었습니다. 변경 사항과 관련된 스택만 개별적으로 배포하는 것이 안전합니다.

```bash
# ✅ 권장: 변경한 스택만 지정하여 배포
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk

# 예: 리더보드 로직만 변경한 경우
pnpm cdk deploy CdkStack --require-approval never

# 예: 트위터 로그인만 변경한 경우
pnpm cdk deploy AuthStack --require-approval never

# ❌ 전체 배포는 예기치 않은 문제를 유발할 수 있으므로 주의
# pnpm cdk deploy --all --require-approval never
```

#### 왜 이런 문제가 발생하나?

**auth-twitter Lambda의 특수성:**
- TypeScript로 작성됨 (반드시 컴파일 필요)
- npm을 사용해야 함 (pnpm symlink 문제)
- 빌드 없이 배포 시 `Runtime.ImportModuleError` 발생 → 502 Bad Gateway

**재발 방지 시스템:**
1. ✅ `pnpm run deploy:safe` - 자동 빌드 + 검증 + 배포
2. ✅ `bash scripts/pre-deploy.sh` - 모든 Lambda 자동 빌드
3. ✅ `bash scripts/verify-build.sh` - 배포 전 빌드 검증
4. ✅ 상세한 문서화: `cdk/README.md`, `cdk/DEPLOYMENT_CHECKLIST.md`

#### 긴급 복구 방법

```bash
# 트위터 로그인이 안 될 때 긴급 복구
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk/lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../..
pnpm cdk deploy AuthStack --require-approval never

# 또는 안전한 배포 스크립트 사용
pnpm run deploy:safe
```

#### 관련 문서
- **상세 가이드**: [cdk/README.md](cdk/README.md)
- **체크리스트**: [cdk/DEPLOYMENT_CHECKLIST.md](cdk/DEPLOYMENT_CHECKLIST.md)
- **auth-twitter 빌드**: [cdk/lambda-src/auth-twitter/README.md](cdk/lambda-src/auth-twitter/README.md)

---

### 🚨 TypeScript vs JavaScript 수정 규칙

**절대 규칙: TypeScript 소스 파일(.ts)만 수정하세요!**

```bash
# ✅ 올바른 수정 방법
vi lambda-src/x-leaderboard/src/services/secure-token-manager.ts  # TypeScript 소스 수정
./cleanup-build-files.sh                                          # 빌드 파일 정리
./deploy-optimized.sh                                              # 재빌드 및 배포

# ❌ 절대 하지 말 것
vi lambda-src/x-leaderboard/src/services/secure-token-manager.js  # JavaScript 직접 수정 금지!
vi lambda-src/x-leaderboard/dist/batch/handler.js                 # 빌드된 파일 수정 금지!
```

**이유**:
- JavaScript(.js, .d.ts) 파일은 빌드 시 자동 생성됩니다
- 클린 빌드 시 JavaScript 파일은 삭제되어 수정 내용이 사라집니다
- Lambda는 컴파일된 JavaScript를 실행하므로, TypeScript와 불일치 시 디버깅이 매우 어렵습니다

### 📚 필수 문서

배포 및 디버깅 전 반드시 읽어야 할 문서:
- **[doc/PHASE1_BUG_FIX_REPORT.md](doc/PHASE1_BUG_FIX_REPORT.md)** - Phase 1 버그 수정 보고서 (2025-10-22)
- **[doc/BUILD_CONFIGURATION_GUIDE.md](doc/BUILD_CONFIGURATION_GUIDE.md)** - 빌드 설정 가이드
- **[doc/LAMBDA_CREATION_GUIDE.md](doc/LAMBDA_CREATION_GUIDE.md)** - Lambda 함수 생성 가이드

### 🛠️ 배포 스크립트 사용 (필수!)

**⚠️ 황금률 (2025-10-29 업데이트): 환경을 명시적으로 지정하세요!**

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk

# ✅ 개발 환경 배포 (타겟: @Nasun_io, AWS 계정: 135808943968)
pnpm deploy:dev

# ✅ 프로덕션 환경 배포 (타겟: @Nasun_io, AWS 계정: 466841130170)
pnpm deploy:prod

# ❌ 환경 미지정 (에러 발생)
pnpm deploy  # → 환경 선택 에러 메시지 출력
```

**배포 스크립트가 자동으로 수행하는 작업:**
1. ✅ 모든 Lambda 함수 빌드 (auth-twitter, x-leaderboard, wallet-api, PriceAPI, sync-community-members)
2. ✅ 빌드 결과 검증
3. ✅ `.env.development` 또는 `.env.production` → `.env` 자동 전환
4. ✅ AWS 자격 증명 vs 환경 설정 불일치 검증
5. ✅ CDK synth/diff
6. ✅ 프로덕션 배포 시 `--profile nasun-prod` 자동 지정
7. ✅ 배포 후 .env 복원 옵션

**절대 직접 실행하지 마세요:**
- ❌ `pnpm run build` 직접 실행
- ❌ `pnpm cdk deploy` 직접 실행 (**특히 중요!** auth-twitter 빌드 누락 시 502 에러)
- ❌ `aws lambda update-function-code` 직접 실행
- ❌ `.env` 파일 수동 복사 (스크립트가 자동 처리)

### 🧪 배포 후 검증 절차 (2025-10-20 업데이트)

**배포만으로는 부족합니다. 반드시 검증하세요!**

CDK 배포 후 일부 Lambda 함수가 업데이트되지 않거나, 로직에 문제가 있을 수 있습니다. 배포 완료 후 다음 절차를 따르세요:

```bash
# 1. Lambda 함수 업데이트 확인
aws lambda get-function --function-name nasun-leaderboard-generator --query 'Configuration.LastModified'
# → 최근 시간인지 확인

# 2. Lambda 환경 변수 확인 (중요!)
aws lambda get-function-configuration --function-name nasun-leaderboard-generator --query "Environment.Variables"
# → .env 파일과 설정값이 일치하는지 확인

# 3. 파이프라인 수동 실행
aws stepfunctions start-execution --state-machine-arn <STATE_MACHINE_ARN> --input '{}'

# 4. 파이프라인 실행 상태 및 결과 확인
aws stepfunctions describe-execution --execution-arn <EXECUTION_ARN>

# 5. 이벤트 리더보드 데이터 직접 검증 (NEW!)
# 가장 최근 생성된 이벤트 리더보드 데이터를 직접 조회하여, 프로필 정보와 가중치가 올바르게 적용되었는지 확인합니다.
aws dynamodb query \
  --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk AND begins_with(sk, :sk_prefix)" \
  --expression-attribute-values '{ ":pk": {"S": "LEADERBOARD#EVENT1#2025-10-20"}, ":sk_prefix": {"S": "RANK#"} }' \
  --limit 5 | jq '.Items[] | {user: .username.S, name: .displayName.S, followers: .followersCount.N, score: .totalScore.N}'

# 예상 결과:
# - name이 user와 다른 실제 활동명으로 표시되어야 함
# - followers가 0이 아니어야 함
# - score가 2.0과 같은 기본 점수가 아닌, 가중치가 적용된 소수점 점수여야 함
```

---

## 📋 프로젝트 개요

### 나선 프로젝트 전체 구성

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Nasun Project                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  nasun-website             nasun-devnet           nasun-explorer    │
│  ─────────────────        ─────────────────      ─────────────────  │
│  공식 웹사이트              블록체인 노드           블록 탐색기        │
│  • 리더보드                 • SUI 포크             • TX/Block 조회    │
│  • NFT 이벤트               • 2노드 Validator      • 주소/객체 조회   │
│  • OAuth 인증               • Faucet 서비스        • 네트워크 상태    │
│  • MetaMask 연동            • 스마트 컨트랙트      • 검색 기능        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**NASUN Website (nasun.io)**는 Web3 프로젝트 "NASUN"의 공식 플랫폼으로, NFT 판매, DAO 거버넌스, 창작 콘텐츠 관리를 위한 종합적인 Web3 애플리케이션입니다. 모노레포 구조로 React 프론트엔드와 정교한 서버리스 AWS 백엔드를 통합한 풀스택 Web3 애플리케이션입니다.

### 현재 상태 (2025-10-22 기준)

- **Production**: nasun.io (운영 중)
- **Staging**: staging.nasun.io
- **인프라**: AWS 완전 서버리스 스택 (Lambda, DynamoDB, API Gateway, EventBridge, Step Functions)
- **아키텍처**: **V3 통합 파이프라인 기반** - 데이터 수집, 집계, 점수 계산 자동화
- **🚀 최신 업데이트**:
  - **✅ MetaMask Web3 인증 구현 완료 (2025-10-22)**
  - **✅ 이벤트 리더보드 로직 전면 수정 (2025-10-20)**: 데이터 불일치, 프로필/가중치 누락 문제 근본 해결
  - **✅ Verified Community Member 시스템 구현 (2025-10-18)**
  - **✅ Lambda Handler Path 표준화 완료 (2025-10-07)**
  - **✅ 리더보드 파이프라인 완전 자동화 완성 (2025-10-02)**

### 핵심 목표
- 커뮤니티 참여도 큐레이션 및 시즌 리더보드 제공 (V3)
- 다중 인증 방식 지원 (Google, Twitter, MetaMask)
- 계정 간 연결 기능으로 통합된 사용자 경험 제공
- DAO 거버넌스 (Proposal, Voting)

### 저장소
- **위치**: `/home/naru/my_apps/nasun-monorepo/apps/nasun-website`
- **브랜치**: `main`
- **리모트**: GitHub (private repository)

---

## 기술 스택

### 프론트엔드
- **Framework**: React 18.3.1 + Vite 6.0.7
- **Language**: TypeScript 5.x
- **UI 라이브러리**:
  - Radix UI (Themes, Primitives)
  - Tailwind CSS 3.4.x
- **상태 관리**: Zustand
- **국제화**: i18next
- **Web3**: ethers.js 6.15.0
- **빌드 도구**: Vite (ESM, Fast HMR)

### 백엔드 (AWS CDK)
- **IaC**: AWS CDK (TypeScript)
- **Runtime**: Node.js 18.x
- **Lambda Functions**:
  - TypeScript로 작성
  - esbuild로 번들링
  - 최소 권한 원칙 (Least Privilege IAM)

### 인프라 (AWS)
- **Compute**: AWS Lambda
- **Database**: DynamoDB
- **Auth**: AWS Cognito
- **API**: API Gateway (REST)
- **Orchestration**: Step Functions
- **Monitoring**: CloudWatch

### 개발 도구
- **Package Manager**: pnpm (프론트엔드), npm (Lambda)
- **Version Control**: Git
- **Linting**: ESLint
- **Testing**: Jest, React Testing Library

---

## 프로젝트 구조

```
nasun-website/
├── frontend/                      # React 프론트엔드
│   ├── src/
│   │   ├── components/           # React 컴포넌트
│   │   │   ├── auth/            # 인증 관련 컴포넌트
│   │   │   │   └── MetaMaskLoginButton.tsx
│   │   │   ├── navbar/          # 네비게이션 바
│   │   │   │   └── LoginButton.tsx
│   │   │   └── account/         # 계정 관리
│   │   │       └── AccountLinking.tsx
│   │   ├── services/            # API 클라이언트
│   │   │   ├── metamaskApi.ts
│   │   │   └── authService.ts
│   │   ├── utils/               # 유틸리티 함수
│   │   │   └── metamaskUtils.ts
│   │   ├── types/               # TypeScript 타입 정의
│   │   │   └── metamask.d.ts
│   │   ├── providers/           # Context Providers
│   │   │   └── auth/
│   │   │       └── AuthContext.tsx
│   │   ├── stores/              # Zustand 스토어
│   │   └── i18n/                # 국제화 설정
│   ├── public/                   # 정적 자산
│   ├── .env.development          # 개발 환경 변수
│   ├── .env.production           # 프로덕션 환경 변수
│   ├── package.json
│   └── vite.config.ts
│
├── cdk/                          # AWS CDK 인프라
│   ├── lib/                      # CDK 스택 정의
│   │   ├── auth-stack.ts        # 인증 관련 인프라
│   │   ├── common-stack.ts      # 공통 리소스
│   │   └── leaderboard-stack.ts # 리더보드 인프라
│   ├── lambda-src/               # Lambda 함수 소스
│   │   ├── auth-metamask/       # MetaMask 인증
│   │   │   ├── src/
│   │   │   │   ├── handlers/
│   │   │   │   │   ├── challenge.ts
│   │   │   │   │   └── verify.ts
│   │   │   │   └── utils/
│   │   │   │       ├── ethereum.ts
│   │   │   │       ├── cognito.ts
│   │   │   │       ├── dynamodb.ts
│   │   │   │       └── userProfile.ts
│   │   │   ├── dist/            # 컴파일된 JavaScript
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   ├── auth-twitter/        # Twitter OAuth
│   │   ├── link-account/        # 계정 연결 Lambda
│   │   └── x-leaderboard-v2/    # 리더보드 Lambda
│   ├── .env                      # CDK 환경 변수
│   ├── package.json
│   └── cdk.json
│
└── doc/                          # 프로젝트 문서
    ├── METAMASK_IMPLEMENTATION_PLAN.md
    ├── METAMASK_TESTING_REPORT.md
    ├── METAMASK_USER_GUIDE.md
    ├── VERSION_V2_UNIFICATION_PLAN.md
    ├── BUILD_CONFIGURATION_GUIDE.md
    └── LAMBDA_CREATION_GUIDE.md
```

---

## 주요 기능

### 1. Community Leaderboard (V3)
- 관리자 큐레이션 기반 커뮤니티 참여 순위 시스템
- 시즌 기반 독립 리더보드 (Phase 1-6 완료)
- Top Climbers Spotlight, Rank Change Indicators, Featured Feed
- 라우트: `/wave1/leaderboard` (공개), `/admin/leaderboard-v3` (관리자)
- 프론트엔드: `src/features/leaderboard-v3/`
- 백엔드: `cdk/lambda-src/leaderboard-v3/`
- Legacy V2 (X API 기반): `/leaderboard-v2` (임시, deprecated)

### 2. 다중 인증 시스템
- **Google OAuth 2.0**
- **Twitter OAuth 2.0** (옵션)
- **MetaMask Web3 인증** (옵션)

### 3. 계정 연결 (Account Linking)
- 여러 인증 방식을 하나의 계정으로 통합
- 양방향 연결 (Primary ↔ Secondary)
- 연결 해제 기능

### 4. 사용자 프로필 관리
- 프로필 이미지, 사용자명 관리
- 연결된 계정 표시
- X(Twitter) 계정 연동

### 5. 사용자 랭킹 조회 (🆕 2025-10-23)
- **나의 랭킹 카드**: 로그인 사용자 순위 자동 표시
- **사용자 검색**: 하이브리드 검색 (정확 일치 + 부분 일치)
- **URL 공유**: 특정 사용자 랭킹 공유 가능 (`?user={username}&highlight=true`)
- **하이라이트**: 6초 자동 강조 표시 (노란색, 다크 모드 지원)
- **부드러운 UX**: 스크롤 애니메이션, 탭 전환 시 초기화
- **스냅샷 지원**: 이벤트 종료 시 최신 스냅샷 자동 폴백

---

## 인증 시스템

### 인증 아키텍처 개요

```
[클라이언트]
    ↓
[인증 방식 선택]
    ├── Google OAuth → [Cognito Federated Identity]
    ├── Twitter OAuth → [Lambda] → [Cognito Developer Identity]
    └── MetaMask → [Lambda] → [Cognito Developer Identity]
    ↓
[Cognito Identity Pool]
    ↓
[AWS Credentials + Identity ID]
    ↓
[UserProfiles DynamoDB Table]
```

### 1. Google OAuth (Federated Identity)

**플로우**:
1. 사용자가 "Login with Google" 클릭
2. Google OAuth 팝업 (Redirect to Google)
3. Google에서 ID Token 발급
4. Cognito Federated Identity로 직접 교환
5. Identity ID 및 AWS Credentials 발급

**설정**:
- `frontend/src/providers/auth/AuthContext.tsx`에서 관리
- Cognito Identity Pool의 Google Provider 사용
- 환경 변수: `VITE_COGNITO_IDENTITY_POOL_ID`

---

### 2. Twitter OAuth (Developer Identity)

**플로우**:
1. 사용자가 "Login with X (Twitter)" 클릭
2. Twitter OAuth 2.0 팝업 (PKCE 방식)
3. Lambda 함수 (`auth-twitter`)가 Twitter API로 사용자 정보 조회
4. Cognito Developer Identity Provider로 Identity ID 발급
5. UserProfiles 테이블에 사용자 정보 저장

**Lambda 함수**:
- `cdk/lambda-src/auth-twitter/`
- API Gateway: `/prod/auth/twitter/callback`

**환경 변수**:
- `VITE_TWITTER_AUTH_API` (옵션, 설정 시 활성화)

---

### 3. MetaMask Web3 인증 (Developer Identity)

**플로우**:
1. 사용자가 "Login with MetaMask" 클릭
2. MetaMask 확장 프로그램 연결 요청
3. 백엔드에서 Challenge (nonce) 생성
4. 사용자가 MetaMask로 메시지 서명
5. 백엔드에서 서명 검증 (ethers.js)
6. Cognito Developer Identity Provider로 Identity ID 발급
7. UserProfiles 테이블에 지갑 정보 저장

**Challenge-Response 인증**:
```typescript
// 1. Challenge 요청
POST /auth/metamask/challenge
Body: { "walletAddress": "0x..." }
Response: { "nonce": "abc123...", "message": "Sign this message..." }

// 2. Verify 요청
POST /auth/metamask/verify
Body: { "walletAddress": "0x...", "signature": "0x...", "nonce": "abc123..." }
Response: { "identityId": "...", "token": "..." }
```

**보안 메커니즘**:
- Nonce는 5분 TTL로 DynamoDB에 저장
- 서명 검증 후 nonce 즉시 삭제 (재사용 방지)
- Ethereum 주소는 소문자로 정규화
- 네트워크별 Chain ID 검증 (Sepolia/Mainnet)

**Lambda 함수**:
- `cdk/lambda-src/auth-metamask/src/handlers/challenge.ts`
- `cdk/lambda-src/auth-metamask/src/handlers/verify.ts`

**DynamoDB 테이블**:
- **MetaMaskAuthNonces**: Nonce 저장 (TTL 5분)
  - PK: `walletAddress` (소문자)
  - Attributes: `nonce`, `expiresAt`

**프론트엔드 구현**:
- `frontend/src/components/auth/MetaMaskLoginButton.tsx`
- `frontend/src/utils/metamaskUtils.ts` (ethers.js BrowserProvider)
- `frontend/src/services/metamaskApi.ts` (API 클라이언트)

**환경 변수**:
```bash
# Frontend
VITE_ENABLE_METAMASK_LOGIN=true
VITE_ETHEREUM_CHAIN_ID=11155111        # Sepolia (dev)
VITE_ETHEREUM_NETWORK_NAME=Sepolia
VITE_METAMASK_AUTH_API=https://...
VITE_TARGET_TWEET_ACCOUNT=Nasun_io     # 타겟 트윗 계정 (MyRankCard "Find Target Tweets" 버튼)

# Backend (Lambda)
NONCE_TABLE_NAME=MetaMaskAuthNonces
USER_PROFILES_TABLE=UserProfiles
COGNITO_IDENTITY_POOL_ID=ap-northeast-2:...
COGNITO_PROVIDER_NAME=nasun-dev-auth
AWS_REGION=ap-northeast-2
```

**관련 문서**:
- **구현 계획**: [doc/METAMASK_IMPLEMENTATION_PLAN.md](doc/METAMASK_IMPLEMENTATION_PLAN.md)
- **테스트 보고서**: [doc/METAMASK_TESTING_REPORT.md](doc/METAMASK_TESTING_REPORT.md)
- **사용자 가이드**: [doc/METAMASK_USER_GUIDE.md](doc/METAMASK_USER_GUIDE.md)

---

### 4. 계정 연결 (Account Linking)

여러 인증 방식을 하나의 계정으로 통합하는 기능입니다.

**연결 구조**:
```json
// Primary Account (Google)
{
  "identityId": "primary-123",
  "provider": "Google",
  "linkedAccounts": {
    "Twitter": {
      "identityId": "secondary-456",
      "username": "@johndoe",
      "profileImageUrl": "https://..."
    },
    "MetaMask": {
      "identityId": "secondary-789",
      "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb7"
    }
  }
}

// Secondary Account (MetaMask)
{
  "identityId": "secondary-789",
  "provider": "MetaMask",
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
  "linkedAccounts": {
    "Google": {
      "identityId": "primary-123",
      "username": "john@example.com",
      "profileImageUrl": "https://..."
    }
  }
}
```

**연결 프로세스**:
1. Primary 계정으로 로그인
2. "My Account" 페이지에서 "Link Wallet" 클릭
3. MetaMask 인증 진행 (Challenge-Response)
4. `link-account` Lambda 호출
5. 양방향 연결 정보 저장 (Primary ↔ Secondary)

**Lambda 함수**:
- `cdk/lambda-src/link-account/index.ts`
- API: `/prod/link-account`

**연결 해제**:
- "Unlink Wallet" 버튼 클릭
- 양쪽 계정에서 연결 정보 제거
- 최소 1개의 인증 방법은 유지 필요 (검증 로직)

---

### UserProfiles DynamoDB 테이블 스키마

```typescript
interface UserProfile {
  identityId: string;              // Partition Key
  username: string;                // 사용자명
  provider: string;                // 'Google' | 'Twitter' | 'MetaMask'
  walletAddress?: string;          // MetaMask 전용 (소문자)
  profileImageUrl?: string;        // 프로필 이미지 URL
  linkedAccounts?: {               // 연결된 계정들
    [provider: string]: {
      identityId: string;
      username?: string;
      profileImageUrl?: string;
      walletAddress?: string;      // MetaMask 계정인 경우
    }
  };
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
}
```

---

## 개발 워크플로우

### 1. 로컬 개발 환경 설정

```bash
# 1. 저장소 클론 (이미 완료)
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website

# 2. 프론트엔드 의존성 설치
cd frontend
pnpm install

# 3. CDK 의존성 설치
cd ../cdk
npm install

# 4. Lambda 의존성 설치 (각 Lambda 디렉토리)
cd lambda-src/auth-metamask
npm install

cd ../auth-twitter
npm install

cd ../link-account
npm install

# 5. 환경 변수 설정
# frontend/.env.development 확인
# cdk/.env 확인
```

### 2. 개발 서버 실행

```bash
# 프론트엔드 개발 서버 (Vite)
cd frontend
pnpm dev
# http://localhost:5174
```

### 3. Lambda 함수 빌드

```bash
# auth-metamask Lambda
cd cdk/lambda-src/auth-metamask
npm run build        # TypeScript → JavaScript (dist/)

# auth-twitter Lambda (중요!)
cd ../auth-twitter
npm install          # npm 사용 필수
npm run build

# link-account Lambda
cd ../link-account
npm run build
```

### 4. CDK 배포 (개발 환경)

```bash
cd cdk

# CDK 스택 합성 (검증)
pnpm cdk synth

# 특정 스택 배포
pnpm cdk deploy AuthStack          # 인증 인프라
pnpm cdk deploy CommonStack        # 공통 리소스
pnpm cdk deploy CdkStack           # 리더보드

# 또는 안전한 배포 스크립트 사용 (권장!)
pnpm run deploy:safe
```

### 5. 테스트

```bash
# 프론트엔드 TypeScript 타입 체크
cd frontend
npx tsc --noEmit

# 프론트엔드 빌드 테스트
npm run build

# Lambda 함수 로컬 테스트
cd cdk/lambda-src/auth-metamask
npm test

# 백엔드 API 테스트 (curl)
curl -X POST https://API_URL/prod/auth/metamask/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x..."}'
```

### 6. Git 워크플로우

```bash
# Feature 브랜치 생성 (권장)
git checkout -b feature/new-feature

# 변경사항 커밋
git add .
git commit -m "feat: Add new feature"

# Main 브랜치로 머지
git checkout main
git merge feature/new-feature

# 리모트 푸시
git push origin main
```

**커밋 메시지 컨벤션**:
- `feat:` - 새로운 기능 추가
- `fix:` - 버그 수정
- `refactor:` - 코드 리팩토링
- `docs:` - 문서 업데이트
- `test:` - 테스트 추가/수정
- `chore:` - 빌드 설정 등

---

## 배포 프로세스

### 프로덕션 배포 체크리스트

#### 1. 프론트엔드 배포 준비
```bash
cd frontend

# 1. 환경 변수 확인
cat .env.production
# VITE_ETHEREUM_CHAIN_ID=1 (Mainnet)
# VITE_ETHEREUM_NETWORK_NAME=Ethereum

# 2. 프로덕션 빌드
npm run build

# 3. 빌드 결과 확인
ls -lh dist/

# 4. 프리뷰 (옵션)
npm run preview
```

#### 2. 백엔드 배포

**⚠️ 중요: 환경을 명시적으로 지정하세요!**

```bash
cd cdk

# ⭐ 개발 환경 배포 (권장)
pnpm deploy:dev
# → 모든 Lambda 빌드 + 검증 + .env.development 자동 로드 + 배포

# ⭐ 프로덕션 환경 배포 (권장)
pnpm deploy:prod
# → 모든 Lambda 빌드 + 검증 + .env.production 자동 로드 + AWS Profile 자동 지정 + 배포

# ❌ 구식 방법 (더 이상 사용하지 마세요!)
# pnpm run deploy:safe  # 환경 구분 없음 - 사용 금지!
# pnpm cdk deploy      # 빌드 누락 위험 - 사용 금지!
```

**배포 스크립트가 자동으로 처리하는 작업:**
- ✅ auth-twitter (npm), x-leaderboard (pnpm), wallet-api (pnpm), PriceAPI (pnpm), sync-community-members (npm) 빌드
- ✅ 빌드 검증 (auth-twitter pnpm symlink 체크 포함)
- ✅ 환경별 .env 파일 자동 전환 및 백업
- ✅ AWS 자격 증명 불일치 검증
- ✅ CDK synth/diff
- ✅ 프로덕션 배포 시 `--profile nasun-prod` 자동 지정

**API Gateway URL 확인:**
```bash
# 개발 환경
aws apigateway get-rest-apis --region ap-northeast-2 --query 'items[?name==`NasunApiGateway`].id' --output text

# 프로덕션 환경
aws apigateway get-rest-apis --profile nasun-prod --region ap-northeast-2 --query 'items[?name==`NasunApiGateway`].id' --output text
```

#### 3. 배포 후 검증

```bash
# API 엔드포인트 테스트
curl -X POST https://PROD_API_URL/prod/auth/metamask/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0xTEST_ADDRESS"}'

# DynamoDB 테이블 확인
aws dynamodb describe-table --table-name MetaMaskAuthNonces --region ap-northeast-2

# Lambda 로그 확인
aws logs tail /aws/lambda/nasun-auth-metamask --region ap-northeast-2 --follow

# Lambda 최신 업데이트 확인
aws lambda get-function --function-name nasun-auth-metamask --query 'Configuration.LastModified'
```

#### 4. 롤백 계획

**Feature Flag 비활성화 (긴급 롤백)**:
```bash
# .env.production 수정
VITE_ENABLE_METAMASK_LOGIN=false

# 재빌드 및 배포
npm run build
# (프론트엔드 호스팅에 배포)
```

**Lambda 버전 롤백**:
```bash
# 이전 버전으로 되돌리기
aws lambda update-function-code \
  --function-name nasun-auth-metamask \
  --s3-bucket YOUR_BUCKET \
  --s3-key lambda/auth-metamask-v1.0.0.zip \
  --region ap-northeast-2
```

---

## 트러블슈팅

### 1. Lambda "Cannot find module" 에러

**증상**: Lambda 함수에서 ethers 또는 다른 모듈을 찾을 수 없음

**해결**:
```typescript
// CDK 스택에서 Lambda 정의 시
code: lambda.Code.fromAsset('lambda-src/auth-metamask'),
handler: 'dist/index.handler',
```

node_modules를 포함한 전체 디렉토리를 배포해야 함.

---

### 2. Twitter 로그인 502 Bad Gateway

**증상**: Twitter 로그인 시 502 에러

**해결**:
```bash
# auth-twitter Lambda 재빌드 및 배포
cd cdk/lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../../
pnpm cdk deploy AuthStack --require-approval never
```

**예방**: 항상 `pnpm run deploy:safe` 사용

---

### 3. CORS 에러

**증상**: 프론트엔드에서 API 호출 시 CORS 에러

**해결**:
- API Gateway에서 CORS 설정 확인
- OPTIONS 메서드 추가
- Access-Control-Allow-Origin 헤더 확인

---

### 4. MetaMask 팝업이 나타나지 않음

**증상**: 로그인 버튼 클릭 시 아무 반응 없음

**해결**:
- 브라우저 팝업 차단 확인
- MetaMask 확장 프로그램 활성화 확인
- 브라우저 콘솔에서 에러 메시지 확인

---

### 5. Nonce expired 에러

**증상**: 서명 시 "Nonce not found" 또는 "Nonce expired" 에러

**해결**:
- Nonce는 5분 후 자동 만료
- 로그인 프로세스를 처음부터 다시 시작
- DynamoDB TTL 설정 확인

---

## Claude Code 작업 가이드

Claude Code가 이 프로젝트에서 작업할 때 참고할 사항:

### 1. 파일 수정 시

**프론트엔드 수정**:
1. TypeScript 타입 먼저 확인/정의
2. 기존 컴포넌트 패턴 따르기 (Hooks, Context)
3. 수정 후 반드시 `npx tsc --noEmit` 실행
4. 빌드 테스트 (`npm run build`)

**백엔드 수정**:
1. Lambda 함수 수정 후 `npm run build` 실행
2. CDK 스택 수정 시 `pnpm cdk synth`로 검증
3. 배포 전 `pnpm cdk diff`로 변경사항 확인
4. **auth-twitter 수정 시**: 반드시 npm 사용, 빌드 필수

### 2. 새로운 기능 추가 시

**체크리스트**:
- [ ] TypeScript 타입 정의
- [ ] 환경 변수 필요 시 `.env` 파일 업데이트
- [ ] 문서 업데이트 (CLAUDE.md 및 doc/ 디렉토리)
- [ ] 테스트 코드 작성
- [ ] Git 커밋 메시지 컨벤션 준수
- [ ] 배포 계획 수립

### 3. 디버깅

**프론트엔드**:
- 브라우저 콘솔 (`F12`)
- React DevTools
- Network 탭에서 API 요청 확인

**백엔드**:
- CloudWatch Logs: `/aws/lambda/FUNCTION_NAME`
- `console.log()`는 자동으로 CloudWatch에 저장
- API Gateway 로그 활성화 확인

### 4. 권장 작업 순서

**새로운 인증 방식 추가 시**:
1. 백엔드 Lambda 함수 구현
2. DynamoDB 테이블 스키마 정의 (필요 시)
3. CDK 스택에 인프라 추가
4. 프론트엔드 API 클라이언트 작성
5. UI 컴포넌트 구현
6. 통합 테스트
7. 문서 업데이트

---

## 문서 참조

### 프로젝트 문서

#### 최근 업데이트 (2025-10-23)
- **[doc/PHASE1_2_USER_RANK_SEARCH_COMPLETION_REPORT.md](doc/PHASE1_2_USER_RANK_SEARCH_COMPLETION_REPORT.md)** - ⭐ Phase 1-2 사용자 랭킹 검색 완료 보고서 (11,000+ words)
- **[doc/PHASE3_AUTOCOMPLETE_REPORT.md](doc/PHASE3_AUTOCOMPLETE_REPORT.md)** - Phase 3 자동완성 구현 보고서 (7,400+ words)
- **[doc/USER_RANK_SEARCH_IMPLEMENTATION_PLAN.md](doc/USER_RANK_SEARCH_IMPLEMENTATION_PLAN.md)** - 사용자 랭킹 검색 구현 계획서 (체크리스트 업데이트됨)
- **[doc/PHASE1_2_IMPLEMENTATION_REPORT.md](doc/PHASE1_2_IMPLEMENTATION_REPORT.md)** - Phase 1-2 버그 수정 및 배포 보고서
- **[doc/OAUTH2_SCOPE_UPDATE_REPORT.md](doc/OAUTH2_SCOPE_UPDATE_REPORT.md)** - OAuth 2.0 Scope 최대 READ 권한 업데이트 보고서
- **[doc/LEADERBOARD_MECHANISM_GUIDE.md](doc/LEADERBOARD_MECHANISM_GUIDE.md)** - 리더보드 반영 메커니즘 상세 가이드
- **[doc/PHASE1_BUG_FIX_REPORT.md](doc/PHASE1_BUG_FIX_REPORT.md)** - Phase 1 버그 수정 보고서 (2025-10-22)

#### 인증 관련
- **[doc/METAMASK_IMPLEMENTATION_PLAN.md](doc/METAMASK_IMPLEMENTATION_PLAN.md)** - MetaMask 구현 계획 및 아키텍처
- **[doc/METAMASK_TESTING_REPORT.md](doc/METAMASK_TESTING_REPORT.md)** - MetaMask 테스트 보고서
- **[doc/METAMASK_USER_GUIDE.md](doc/METAMASK_USER_GUIDE.md)** - MetaMask 사용자 가이드

#### 개발 가이드
- **[doc/BUILD_CONFIGURATION_GUIDE.md](doc/BUILD_CONFIGURATION_GUIDE.md)** - 빌드 설정 가이드
- **[doc/LAMBDA_CREATION_GUIDE.md](doc/LAMBDA_CREATION_GUIDE.md)** - Lambda 함수 생성 가이드
- **[doc/VERSION_V2_UNIFICATION_PLAN.md](doc/VERSION_V2_UNIFICATION_PLAN.md)** - V2 통합 계획

#### 배포 관련
- **[cdk/README.md](cdk/README.md)** - CDK 상세 가이드
- **[cdk/DEPLOYMENT_CHECKLIST.md](cdk/DEPLOYMENT_CHECKLIST.md)** - 배포 체크리스트

### 외부 문서
- [MetaMask Docs](https://docs.metamask.io/)
- [ethers.js v6 Docs](https://docs.ethers.org/v6/)
- [AWS Cognito Developer Guide](https://docs.aws.amazon.com/cognito/)
- [AWS CDK TypeScript Docs](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Vite Guide](https://vitejs.dev/guide/)
- [React Docs](https://react.dev/)

---

## 주요 고려사항

### 1. MetaMask 인증 관련

**네트워크 환경**:
- Development/Staging: Sepolia Testnet (Chain ID: 11155111)
- Production: Ethereum Mainnet (Chain ID: 1)

**보안**:
- Nonce는 5분 TTL (DynamoDB TTL 자동 삭제)
- 서명 검증 후 즉시 nonce 삭제 (재사용 방지)
- Ethereum 주소는 항상 소문자로 정규화

**UX**:
- MetaMask 미설치 감지 및 안내
- 네트워크 자동 전환 요청
- 로딩 상태 명확히 표시
- 에러 메시지 사용자 친화적으로 표시

### 2. 계정 연결 관련

**제약사항**:
- 최소 1개의 인증 방법은 유지해야 함
- Primary 계정 삭제 시 연결된 모든 계정도 영향받음
- 연결 해제는 되돌릴 수 없음

**데이터 일관성**:
- 양방향 연결 정보 동기화 중요
- 연결/해제 시 트랜잭션 롤백 처리

### 3. 개발 시 주의사항

**Lambda 배포**:
- auth-metamask: `Code.fromAsset('lambda-src/auth-metamask')`, `handler: 'dist/index.handler'`
- auth-twitter: 반드시 npm 사용, pnpm 사용 금지
- node_modules가 포함되도록 주의

**환경 변수**:
- `.env` 파일은 Git에 커밋하지 않음 (.gitignore)
- Vite 환경 변수는 반드시 `VITE_` 프리픽스 사용
- 민감한 정보는 AWS Secrets Manager 사용 고려

**타입 안전성**:
- MetaMask 관련 타입은 `frontend/src/types/metamask.d.ts`에 정의
- `window.ethereum` 타입 확장 필수

---

## 관련 프로젝트

| 프로젝트 | 경로 | 설명 |
|---------|------|------|
| nasun-devnet | `../../nasun-devnet` | Nasun Devnet 블록체인 노드 (SUI 포크) |
| nasun-explorer | `../../nasun-explorer` | Nasun 블록 탐색기 |
| nasun-sui-contracts | `../../nasun-contracts/nasun-sui-contracts` | Nasun 스마트 컨트랙트 |

### 주요 문서 참조

- [NASUN_DEVNET_SETUP_PLAN.md](../../nasun-devnet/doc/NASUN_DEVNET_SETUP_PLAN.md) - Devnet 구축 계획서
- [NASUN_DEVNET_NEXT_STEPS.md](../../nasun-devnet/doc/NASUN_DEVNET_NEXT_STEPS.md) - 다음 단계 계획서 (Phase 7-9)

---

## 연락처

**프로젝트 관리자**: development@nasun.io
**기술 지원**: support@nasun.io

---

**문서 버전**: 2.16.0
**마지막 업데이트**: 2025-12-14
**작성자**: Claude Code
