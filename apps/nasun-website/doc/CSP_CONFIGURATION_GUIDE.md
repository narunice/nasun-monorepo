# Content Security Policy (CSP) Configuration Guide

**Document Version**: 1.0.0
**Last Updated**: 2025-11-24
**Author**: Development Team
**Status**: ✅ Active

---

## 📋 Table of Contents

1. [Introduction](#1-introduction)
2. [CSP Architecture in NASUN Website](#2-csp-architecture-in-nasun-website)
3. [Environment-Specific CSP Policies](#3-environment-specific-csp-policies)
4. [Adding New Domains](#4-adding-new-domains)
5. [Troubleshooting](#5-troubleshooting)
6. [Security Best Practices](#6-security-best-practices)
7. [References](#7-references)

---

## 1. Introduction

### 1.1 What is Content Security Policy (CSP)?

**Content Security Policy (CSP)**는 웹 애플리케이션의 보안을 강화하기 위한 HTTP 응답 헤더 또는 HTML 메타 태그 기반의 보안 메커니즘입니다. CSP는 다음과 같은 공격을 방지합니다:

- **Cross-Site Scripting (XSS)**: 악의적인 스크립트 주입 방지
- **Click-jacking**: 투명한 iframe을 통한 사용자 행동 조작 방지
- **Data Injection Attacks**: 외부 소스로부터의 악의적인 데이터 주입 차단
- **Code Injection**: 승인되지 않은 코드 실행 방지

### 1.2 CSP의 작동 원리

CSP는 **화이트리스트 방식**으로 작동합니다:

1. **정책 선언**: 허용된 리소스 출처를 명시적으로 선언
2. **브라우저 검증**: 브라우저가 로드하려는 모든 리소스를 CSP 정책과 비교
3. **차단 또는 허용**: 정책에 맞지 않는 리소스는 차단하고 콘솔에 에러 기록

**예시**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' https://cdn.example.com;" />
```

위 정책의 의미:
- `default-src 'self'`: 모든 리소스는 기본적으로 같은 도메인에서만 로드 가능
- `script-src 'self' https://cdn.example.com`: JavaScript는 자체 도메인과 `cdn.example.com`에서만 로드 가능

### 1.3 CSP 지시어 (Directives)

주요 CSP 지시어:

| 지시어 | 설명 | 예시 |
|--------|------|------|
| `default-src` | 기본 폴리시 (다른 지시어의 폴백) | `default-src 'self'` |
| `connect-src` | fetch, XHR, WebSocket 등 네트워크 연결 | `connect-src 'self' https://api.example.com` |
| `img-src` | 이미지 소스 | `img-src 'self' data: https:` |
| `script-src` | JavaScript 소스 | `script-src 'self' 'unsafe-inline'` |
| `style-src` | CSS 소스 | `style-src 'self' 'unsafe-inline'` |
| `font-src` | 폰트 소스 | `font-src 'self' https://fonts.gstatic.com` |
| `frame-src` | iframe 소스 | `frame-src 'none'` |

### 1.4 특수 키워드

- `'self'`: 현재 도메인 (프로토콜, 호스트, 포트 동일)
- `'none'`: 모든 소스 차단
- `'unsafe-inline'`: 인라인 스크립트/스타일 허용 (보안 위험)
- `'unsafe-eval'`: `eval()` 함수 사용 허용 (보안 위험)
- `data:`: data URI 허용
- `https:`: 모든 HTTPS URL 허용

---

## 2. CSP Architecture in NASUN Website

### 2.1 CSP 설정 방법

NASUN 웹사이트는 **환경 변수 기반 CSP 설정**을 사용합니다:

```
[.env 파일] → [vite.config.ts] → [index.html 템플릿] → [빌드된 HTML]
```

**단계별 흐름**:

1. **환경 변수 정의** (`.env.development` 또는 `.env.production`):
   ```bash
   VITE_CSP_POLICY=default-src 'self'; connect-src 'self' https://api.example.com;
   ```

2. **Vite 설정 로딩** (`vite.config.ts`):
   ```typescript
   const env = loadEnv(mode, process.cwd(), "");
   const cspPolicy = env.VITE_CSP_POLICY ? env.VITE_CSP_POLICY.replace(/\s+/g, " ").trim() : "";
   ```

3. **HTML 플러그인 주입** (`vite-plugin-html`):
   ```typescript
   createHtmlPlugin({
     minify: true,
     inject: {
       data: {
         cspMeta:
           mode !== "development" && cspPolicy
             ? `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}" />`
             : "",
       },
     },
   })
   ```

4. **index.html 템플릿** (EJS 구문):
   ```html
   <!-- CSP (Content Security Policy) - vite.config.ts에서 주입 -->
   <%= cspMeta %>
   ```

5. **최종 빌드 결과** (`dist/index.html`):
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'; ..." />
   ```

### 2.2 개발 환경 vs 프로덕션 환경

| 항목 | 개발 환경 | 프로덕션 환경 |
|------|----------|--------------|
| **CSP 적용** | ❌ 비활성화 | ✅ 활성화 |
| **환경 파일** | `.env.development` | `.env.production` |
| **빌드 명령** | `npm run dev` | `npm run build` |
| **Ethereum 네트워크** | Sepolia Testnet | Ethereum Mainnet |
| **Alchemy API** | `eth-sepolia.g.alchemy.com` | `eth-mainnet.g.alchemy.com` |
| **Etherscan API** | `api-sepolia.etherscan.io` | `api.etherscan.io` |

**개발 환경에서 CSP를 비활성화하는 이유**:
- Hot Module Replacement (HMR) 호환성
- 빠른 개발 및 디버깅
- 외부 도구 (React DevTools, Redux DevTools) 사용 편의성

---

## 3. Environment-Specific CSP Policies

### 3.1 개발 환경 CSP 정책 (`.env.development`)

**위치**: `/home/naru/my_apps/nasun-apps/nasun-website/frontend/.env.development`

**전체 정책**:
```bash
VITE_CSP_POLICY=default-src 'self'; connect-src 'self' https://cdn.jsdelivr.net https://*.nasun.io https://*.nasun.xyz https://*.moonoak.io https://staging.moonoak.io https://cms.moonoak.io https://*.gensol.io https://*.genspectra.io https://fullnode.testnet.sui.io https://api.testnet.iota.cafe wss://api.testnet.iota.cafe https://indexer.testnet.iota.cafe https://graphql.testnet.iota.cafe https://faucet.testnet.iota.cafe https://*.amazoncognito.com https://*.amazonaws.com https://cognito-idp.ap-northeast-2.amazonaws.com https://signin.auth.ap-northeast-2.amazoncognito.com https://accounts.google.com https://oauth2.googleapis.com https://api.twitter.com https://twitter.com https://x.com https://eth-sepolia.g.alchemy.com https://api-sepolia.etherscan.io; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';
```

**도메인별 용도**:

#### 🌐 NASUN 관련 도메인
- `*.nasun.io`, `*.nasun.xyz`: NASUN 웹사이트 및 API
- 예: `https://staging.nasun.io`, `https://api.nasun.io`

#### 🤝 파트너 프로젝트
- `*.moonoak.io`: MoonOak 프로젝트 CMS 및 API
- `*.gensol.io`: GenSol 파트너 연동
- `*.genspectra.io`: GenSpectra 연동

#### ☁️ AWS 인프라
- `*.amazoncognito.com`, `*.amazonaws.com`: AWS Cognito 인증 및 API Gateway
- `cognito-idp.ap-northeast-2.amazonaws.com`: Cognito Identity Provider
- `signin.auth.ap-northeast-2.amazoncognito.com`: Cognito 호스팅 UI

#### 🔐 OAuth 인증
- `accounts.google.com`, `oauth2.googleapis.com`: Google OAuth 로그인
- `api.twitter.com`, `twitter.com`, `x.com`: X (Twitter) OAuth 로그인

#### 🪙 Ethereum (Sepolia Testnet)
- `eth-sepolia.g.alchemy.com`: Alchemy API (NFT 조회)
- `api-sepolia.etherscan.io`: Etherscan API (트랜잭션 조회)

#### 🔗 블록체인 테스트넷
- `fullnode.testnet.sui.io`: Sui 테스트넷
- `api.testnet.iota.cafe`, `wss://api.testnet.iota.cafe`: IOTA 테스트넷
- `indexer.testnet.iota.cafe`, `graphql.testnet.iota.cafe`, `faucet.testnet.iota.cafe`: IOTA 인프라

#### 📦 CDN 및 라이브러리
- `cdn.jsdelivr.net`: JavaScript 라이브러리 CDN

### 3.2 프로덕션 환경 CSP 정책 (`.env.production`)

**위치**: `/home/naru/my_apps/nasun-apps/nasun-website/frontend/.env.production`

**전체 정책**:
```bash
VITE_CSP_POLICY=default-src 'self'; connect-src 'self' https://cdn.jsdelivr.net https://*.nasun.io https://*.nasun.xyz https://*.moonoak.io https://staging.moonoak.io https://cms.moonoak.io https://*.gensol.io https://*.genspectra.io https://fullnode.testnet.sui.io https://api.testnet.iota.cafe wss://api.testnet.iota.cafe https://indexer.testnet.iota.cafe https://graphql.testnet.iota.cafe https://faucet.testnet.iota.cafe https://*.amazoncognito.com https://*.amazonaws.com https://cognito-idp.ap-northeast-2.amazonaws.com https://signin.auth.ap-northeast-2.amazoncognito.com https://accounts.google.com https://oauth2.googleapis.com https://api.twitter.com https://twitter.com https://x.com https://eth-mainnet.g.alchemy.com https://api.etherscan.io; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';
```

**개발 환경과의 차이점**:
- ✅ `eth-mainnet.g.alchemy.com` (Mainnet)
- ✅ `api.etherscan.io` (Mainnet)
- ❌ `eth-sepolia.g.alchemy.com` (Testnet 제거)
- ❌ `api-sepolia.etherscan.io` (Testnet 제거)

### 3.3 지시어별 상세 정책

#### `default-src 'self'`
- **목적**: 기본 폴리시 설정
- **의미**: 명시되지 않은 모든 리소스는 같은 도메인에서만 로드

#### `connect-src` (가장 중요!)
- **목적**: API 호출, fetch, XHR, WebSocket 연결 허용
- **포함된 도메인**: 위 섹션 3.1, 3.2 참조
- **주의사항**: 새로운 외부 API 사용 시 반드시 추가 필요

#### `img-src 'self' data: https:`
- **목적**: 이미지 로딩 허용
- `'self'`: 같은 도메인의 이미지
- `data:`: Base64 인코딩 이미지 (data URI)
- `https:`: 모든 HTTPS 이미지 (NFT 이미지, IPFS 등)

#### `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
- **목적**: JavaScript 실행 허용
- `'self'`: 자체 도메인의 JavaScript
- `'unsafe-inline'`: 인라인 `<script>` 태그 허용 (⚠️ 보안 위험)
- `'unsafe-eval'`: `eval()` 함수 허용 (⚠️ 보안 위험)
- **개선 필요**: nonce 또는 hash 기반 CSP로 전환 권장

#### `style-src 'self' 'unsafe-inline'`
- **목적**: CSS 로딩 허용
- `'self'`: 자체 도메인의 CSS
- `'unsafe-inline'`: 인라인 `<style>` 태그 및 style 속성 허용
- **이유**: Tailwind CSS, Radix UI 등이 인라인 스타일 사용

---

## 4. Adding New Domains

### 4.1 언제 도메인을 추가해야 하나?

다음과 같은 경우 CSP에 도메인을 추가해야 합니다:

1. **새로운 외부 API 호출**: 예) `https://api.newservice.com`
2. **제3자 라이브러리 CDN**: 예) `https://cdn.newcdn.com`
3. **OAuth 인증 서비스**: 예) `https://auth.newprovider.com`
4. **블록체인 노드 연결**: 예) `https://rpc.newchain.io`
5. **이미지/폰트 CDN**: 예) `https://images.newcdn.com`

### 4.2 Step-by-Step 도메인 추가 가이드

#### Step 1: 브라우저 콘솔에서 CSP 에러 확인

CSP 위반 에러 예시:
```
Refused to connect to 'https://api.newservice.com/data' because it violates the following Content Security Policy directive: "connect-src 'self' ...".
```

**에러 분석**:
- **차단된 URL**: `https://api.newservice.com/data`
- **위반된 지시어**: `connect-src`
- **추가할 도메인**: `https://api.newservice.com`

#### Step 2: 환경 결정 (개발/프로덕션)

- **개발 전용**: `.env.development`만 수정
- **프로덕션 전용**: `.env.production`만 수정
- **공통**: 두 파일 모두 수정

#### Step 3: `.env` 파일 수정

**개발 환경 (`.env.development`)**:

1. 파일 열기:
   ```bash
   vi frontend/.env.development
   ```

2. `VITE_CSP_POLICY` 라인 찾기 (Line 76):
   ```bash
   VITE_CSP_POLICY=default-src 'self'; connect-src 'self' ... [기존 도메인들]; ...
   ```

3. 도메인 추가:
   ```bash
   # Before
   ... https://x.com; img-src ...

   # After
   ... https://x.com https://api.newservice.com; img-src ...
   ```

4. 주석 업데이트 (Line 64-75):
   ```bash
   # 도메인별 용도:
   # ...
   # - api.newservice.com: 신규 서비스 API (데이터 조회)
   ```

**프로덕션 환경 (`.env.production`)**:

동일한 방식으로 `.env.production` 수정 (Line 129-132)

#### Step 4: 빌드 테스트

1. TypeScript 타입 체크:
   ```bash
   cd frontend
   npx tsc --noEmit
   ```

2. 프로덕션 빌드:
   ```bash
   npm run build
   ```

3. HTML CSP 메타 태그 확인:
   ```bash
   grep "Content-Security-Policy" dist/index.html
   ```

   **예상 결과**:
   ```html
   <meta http-equiv="Content-Security-Policy" content="... https://api.newservice.com ..." />
   ```

#### Step 5: 로컬 테스트

1. 개발 서버 실행 (개발 환경 테스트):
   ```bash
   npm run dev
   ```

2. 브라우저 콘솔 확인:
   - ✅ CSP 에러 사라졌는지 확인
   - ✅ API 호출 성공 여부 확인

3. 프로덕션 빌드 프리뷰:
   ```bash
   npm run preview
   ```

#### Step 6: 배포 및 검증

1. **스테이징 배포**:
   ```bash
   # 빌드 파일을 스테이징 서버에 업로드
   scp -r dist/* user@staging.nasun.io:/var/www/html/
   ```

2. **스테이징 검증**:
   - 브라우저에서 `https://staging.nasun.io` 접속
   - 개발자 도구 → Console 탭
   - CSP 에러 없는지 확인
   - 네트워크 탭에서 API 호출 성공 확인

3. **프로덕션 배포** (스테이징 검증 후):
   ```bash
   # 빌드 파일을 프로덕션 서버에 업로드
   scp -r dist/* user@nasun.io:/var/www/html/
   ```

### 4.3 지시어별 도메인 추가 예시

#### `connect-src` (API 호출)
```bash
# GraphQL API 추가
connect-src 'self' ... https://graphql.newservice.com;

# WebSocket 추가
connect-src 'self' ... wss://ws.newservice.com;
```

#### `img-src` (이미지)
```bash
# IPFS 게이트웨이 추가
img-src 'self' data: https: https://ipfs.io https://cloudflare-ipfs.com;
```

#### `font-src` (폰트)
```bash
# Google Fonts 추가
font-src 'self' https://fonts.gstatic.com;
```

#### `frame-src` (iframe)
```bash
# YouTube 임베드 추가
frame-src 'self' https://www.youtube.com;
```

---

## 5. Troubleshooting

### 5.1 일반적인 CSP 에러 유형

#### ❌ **Error 1: `connect-src` 위반 (가장 흔함)**

**증상**:
```
Refused to connect to 'https://api.example.com/data' because it violates the following Content Security Policy directive: "connect-src 'self' ...".
```

**원인**:
- 새로운 API 호출을 시도했지만 해당 도메인이 CSP에 없음

**해결**:
1. `connect-src`에 `https://api.example.com` 추가
2. `.env` 파일 수정 후 재빌드

---

#### ❌ **Error 2: `img-src` 위반**

**증상**:
```
Refused to load the image 'https://example.com/image.png' because it violates the following Content Security Policy directive: "img-src 'self' data: https:".
```

**원인**:
- 외부 이미지 URL이 CSP 정책에 맞지 않음

**해결**:
- 일반적으로 `img-src 'self' data: https:`로 설정되어 있어 모든 HTTPS 이미지 허용
- HTTP 이미지는 차단됨 → HTTPS로 변경 필요

---

#### ❌ **Error 3: Inline script/style 차단**

**증상**:
```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self'".
```

**원인**:
- `'unsafe-inline'` 없이 인라인 `<script>` 또는 `<style>` 사용

**해결**:
- **임시 방법**: `script-src 'self' 'unsafe-inline'` 추가 (⚠️ 보안 위험)
- **권장 방법**: nonce 또는 hash 기반 CSP 사용 (고급 설정 필요)

---

### 5.2 CSP 메타 태그가 HTML에 주입되지 않는 경우

#### 체크리스트

1. **환경 변수 확인**:
   ```bash
   grep "VITE_CSP_POLICY" .env.production
   ```
   → 변수가 존재하고 값이 비어있지 않은지 확인

2. **index.html 템플릿 태그 확인**:
   ```bash
   grep "cspMeta" index.html
   ```
   → `<%= cspMeta %>` 태그가 있는지 확인

3. **빌드 모드 확인**:
   ```bash
   npm run build  # production 모드
   ```
   → 개발 서버 (`npm run dev`)는 CSP를 주입하지 않음

4. **HTML 출력 확인**:
   ```bash
   grep "Content-Security-Policy" dist/index.html
   ```
   → 빌드된 HTML에 CSP 메타 태그가 있는지 확인

5. **vite.config.ts 조건 확인**:
   ```typescript
   mode !== "development" && cspPolicy
   ```
   → `mode`가 "production"이고 `cspPolicy`가 비어있지 않은지 확인

---

### 5.3 HTML 엔티티 인코딩 문제

**증상**:
```html
&lt;meta http-equiv=&#34;Content-Security-Policy&#34; content=&#34;...&#34; /&gt;
```

**원인**:
- `vite-plugin-html`의 `minify: true` 옵션이 HTML 엔티티 인코딩을 유발

**해결**:
- **현재 상태**: 브라우저는 HTML 엔티티를 자동으로 디코딩하므로 문제없음
- **개선 방법** (선택):
  ```typescript
  // vite.config.ts
  createHtmlPlugin({
    minify: false,  // 엔티티 인코딩 방지
    inject: { ... }
  })
  ```

---

### 5.4 개발 환경에서 CSP 테스트하기

개발 환경에서는 기본적으로 CSP가 비활성화되어 있습니다. 테스트가 필요한 경우:

**방법 1: vite.config.ts 수정 (임시)**
```typescript
// vite.config.ts Line 36
cspMeta:
  // mode !== "development" && cspPolicy  // Before
  cspPolicy  // After (개발 환경에서도 CSP 활성화)
    ? `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}" />`
    : "",
```

**방법 2: 프로덕션 빌드 프리뷰**
```bash
npm run build
npm run preview
```

---

## 6. Security Best Practices

### 6.1 'unsafe-inline' 및 'unsafe-eval' 최소화

**현재 정책**:
```bash
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
```

**문제점**:
- `'unsafe-inline'`: XSS 공격에 취약 (인라인 스크립트 허용)
- `'unsafe-eval'`: 문자열을 코드로 실행 가능 (`eval()`, `new Function()`)

**개선 방안**:

#### Nonce 기반 CSP
```html
<!-- 서버에서 랜덤 nonce 생성 -->
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' 'nonce-ABC123XYZ';" />

<!-- 인라인 스크립트에 nonce 추가 -->
<script nonce="ABC123XYZ">
  console.log("Allowed!");
</script>
```

#### Hash 기반 CSP
```bash
# 스크립트 내용의 SHA-256 해시 계산
echo -n "console.log('Hello');" | openssl dgst -sha256 -binary | openssl base64
# 결과: abc123...

# CSP 정책에 해시 추가
script-src 'self' 'sha256-abc123...';
```

**구현 우선순위**: 🔴 High (보안 개선 필수)

---

### 6.2 화이트리스트 도메인 최소화

**원칙**:
- 필요한 도메인만 추가 (최소 권한 원칙)
- 와일드카드 (`*`) 사용 최소화

**나쁜 예**:
```bash
connect-src *;  # 모든 도메인 허용 (위험!)
```

**좋은 예**:
```bash
connect-src 'self' https://api.example.com https://cdn.example.com;
```

**와일드카드 사용 시 주의**:
```bash
# ✅ 허용 (subdomain만 허용)
connect-src https://*.nasun.io;

# ❌ 금지 (모든 도메인 허용)
connect-src https://*;
```

---

### 6.3 HTTPS 강제 사용

**현재 정책**:
```bash
img-src 'self' data: https:;  # 모든 HTTPS 이미지 허용
```

**개선**:
```bash
# HTTP 이미지 차단 (HTTPS만 허용)
img-src 'self' data: https:;
```

**추가 보안**:
```bash
# Upgrade Insecure Requests (HTTP → HTTPS 자동 변환)
upgrade-insecure-requests;
```

---

### 6.4 CSP 보고서 수집

**Report-Only 모드** (테스트용):
```html
<meta http-equiv="Content-Security-Policy-Report-Only"
      content="default-src 'self'; report-uri /csp-report" />
```

**장점**:
- 정책 위반 시 차단하지 않고 보고만 함
- 프로덕션에 배포 전 테스트 가능
- `/csp-report` 엔드포인트로 위반 리포트 전송

**구현 예시**:
```typescript
// 백엔드 API
app.post('/csp-report', (req, res) => {
  console.log('CSP Violation:', req.body);
  // DynamoDB 또는 CloudWatch Logs에 저장
  res.status(204).send();
});
```

---

### 6.5 정기적인 CSP 정책 리뷰

**권장 주기**: 분기별 (3개월)

**리뷰 항목**:
1. ✅ 사용하지 않는 도메인 제거
2. ✅ `'unsafe-inline'`, `'unsafe-eval'` 제거 여부 검토
3. ✅ 새로운 보안 위협 대응 (CVE 확인)
4. ✅ 브라우저 호환성 업데이트 (MDN 문서 참조)

---

## 7. References

### 7.1 공식 문서

- **MDN Web Docs - CSP**:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

- **CSP Evaluator (Google)**:
  https://csp-evaluator.withgoogle.com/

- **Content Security Policy Reference**:
  https://content-security-policy.com/

- **W3C CSP Specification**:
  https://www.w3.org/TR/CSP3/

### 7.2 도구

- **CSP Generator**:
  https://report-uri.com/home/generate

- **CSP Scanner**:
  https://securityheaders.com/

- **Browser DevTools**:
  - Chrome: DevTools → Console 탭 (CSP 에러 표시)
  - Firefox: Web Console → Security 탭

### 7.3 NASUN 프로젝트 관련 문서

- **환경 변수 가이드**: `frontend/.env.development`, `frontend/.env.production`
- **빌드 설정**: `frontend/vite.config.ts`
- **배포 체크리스트**: `CLAUDE.md` (배포 및 디버깅 필독사항)
- **트러블슈팅 가이드**: `doc/BUILD_CONFIGURATION_GUIDE.md`

### 7.4 보안 Best Practices

- **OWASP - Content Security Policy Cheat Sheet**:
  https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html

- **Google Web Fundamentals - CSP**:
  https://developers.google.com/web/fundamentals/security/csp

---

## Appendix A: Quick Reference

### A.1 CSP 지시어 치트시트

| 지시어 | 제어 대상 | 예시 |
|--------|----------|------|
| `default-src` | 모든 리소스 (폴백) | `'self'` |
| `script-src` | JavaScript | `'self' https://cdn.js.com` |
| `style-src` | CSS | `'self' 'unsafe-inline'` |
| `img-src` | 이미지 | `'self' data: https:` |
| `font-src` | 폰트 | `'self' https://fonts.gstatic.com` |
| `connect-src` | Fetch, XHR, WebSocket | `'self' https://api.example.com` |
| `frame-src` | iframe | `'self' https://www.youtube.com` |
| `object-src` | Flash, PDF 등 | `'none'` (권장) |
| `media-src` | Audio, Video | `'self' https://media.example.com` |
| `worker-src` | Web Workers | `'self'` |
| `form-action` | Form 제출 대상 | `'self'` |
| `frame-ancestors` | 임베드 허용 도메인 | `'none'` (클릭재킹 방지) |
| `base-uri` | `<base>` 태그 | `'self'` |
| `upgrade-insecure-requests` | HTTP → HTTPS 자동 변환 | (값 없음) |

### A.2 자주 사용하는 CSP 패턴

#### 최소 권한 (매우 엄격)
```bash
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self';
font-src 'self';
connect-src 'self';
```

#### React 애플리케이션 (인라인 스타일 허용)
```bash
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://api.example.com;
```

#### NFT 마켓플레이스 (IPFS 지원)
```bash
default-src 'self';
img-src 'self' data: https: ipfs:;
connect-src 'self' https://api.opensea.io https://ipfs.io https://cloudflare-ipfs.com;
```

---

**문서 끝**

**Last Updated**: 2025-11-24
**Version**: 1.0.0
**Maintained by**: NASUN Development Team

For questions or updates, please contact: development@nasun.io
