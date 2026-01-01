# Nasun Monorepo 보안 취약점 개선 구현 계획서

> 작성일: 2026-01-01
> 버전: 1.0
> 상태: 계획 수립 완료

---

## 목차

1. [개요](#1-개요)
2. [취약점 요약](#2-취약점-요약)
3. [Phase 1: 의존성 보안](#3-phase-1-의존성-보안-즉시)
4. [Phase 2: 웹 보안](#4-phase-2-웹-보안-1주)
5. [Phase 3: 스마트컨트랙트 보안](#5-phase-3-스마트컨트랙트-보안-2주)
6. [Phase 4: DeFi 보안](#6-phase-4-defi-보안-1개월)
7. [완료 후 문서화](#7-완료-후-문서화)
8. [별도 진행: 지갑 보안](#8-별도-진행-지갑-보안-다른-세션)

---

## 1. 개요

### 1.1 목적

Nasun Monorepo의 모든 앱(nasun-website, gensol-website, pado, network-explorer)에서 발견된 보안 취약점을 체계적으로 수정하고, 각 단계별로 롤백 가능한 상태를 유지하며 진행한다.

### 1.2 원칙

| 원칙 | 설명 |
|------|------|
| 롤백 우선 | 각 Phase 시작 전 git 태그 생성 |
| 테스트 필수 | 수정 후 빌드/테스트 통과 확인 |
| 점진적 배포 | staging → production 순서 |
| 문서화 | 각 변경사항 즉시 문서 업데이트 |

### 1.3 전체 일정

```
Phase 1: 의존성 보안     [Day 1]      ████░░░░░░░░░░░░░░░░░░░░░░░░
Phase 2: 웹 보안         [Day 2-3]    ░░░░████████░░░░░░░░░░░░░░░░
Phase 3: 스마트컨트랙트  [Day 4-7]    ░░░░░░░░░░░░████████████░░░░
Phase 4: DeFi 보안       [Week 2-3]   ░░░░░░░░░░░░░░░░░░░░░░░░████████████

※ 지갑 보안: 별도 세션에서 진행 (섹션 8 참조)
```

---

## 2. 취약점 요약

### 2.1 위험도별 분류

| 위험도 | 건수 | 주요 항목 |
|--------|------|----------|
| Critical | 1 | happy-dom RCE |
| High | 10 | sessionStorage, CORS, CSRF, Rate Limiting 등 |
| Medium | 14 | 입력 검증, 메모리 보안 등 |
| Low | 4 | PBKDF2 iteration, UI 개선 등 |

### 2.2 영향 범위

| 앱 | Critical | High | Medium |
|----|----------|------|--------|
| packages/wallet | 1 | 2 | 4 |
| packages/wallet-ui | 0 | 0 | 3 |
| apps/nasun-website | 0 | 4 | 4 |
| apps/pado | 0 | 4 | 5 |
| apps/gensol-website | 0 | 0 | 1 |
| apps/network-explorer | 0 | 0 | 1 |

---

## 3. Phase 1: 의존성 보안 (즉시)

### 3.1 목표

npm 의존성 취약점 해결

### 3.2 롤백 포인트

```bash
git tag -a security-phase1-pre -m "Before Phase 1: Dependency security"
```

### 3.3 작업 항목

#### 3.3.1 happy-dom 업데이트 (Critical)

**취약점**: VM 컨텍스트 탈출 → RCE 가능
**CVE**: CVE-2025-61927
**영향**: packages/wallet, packages/wallet-ui, vitest

```bash
# 수정 명령
pnpm update happy-dom@^20.0.0 -r
```

**검증**:
```bash
pnpm audit | grep happy-dom
# 취약점 없음 확인
```

#### 3.3.2 valibot 업데이트 (High)

**취약점**: ReDoS (정규식 서비스 거부)
**CVE**: CVE-2025-66020
**영향**: @mysten/sui 의존성

```bash
# @mysten/sui 최신 버전 확인
pnpm update @mysten/sui -r
```

**검증**:
```bash
pnpm audit | grep valibot
```

#### 3.3.3 esbuild 업데이트 (Moderate)

**취약점**: 개발 서버 CORS 취약점
**영향**: 개발 환경만 해당

```bash
pnpm update esbuild@^0.25.0 -r
```

### 3.4 테스트

```bash
# 전체 빌드 테스트
pnpm build

# wallet 패키지 테스트
pnpm --filter @nasun/wallet test
pnpm --filter @nasun/wallet-ui test

# 개발 서버 시작 확인
timeout 10 pnpm dev:pado
```

### 3.5 완료 조건

- [ ] `pnpm audit`에서 critical/high 취약점 0건
- [ ] 모든 앱 빌드 성공
- [ ] wallet 테스트 통과

### 3.6 롤백 절차

```bash
git reset --hard security-phase1-pre
pnpm install
```

### 3.7 커밋

```bash
git add pnpm-lock.yaml package.json **/package.json
git commit -m "security(deps): update vulnerable packages

- happy-dom: 15.x → 20.x (CVE-2025-61927 RCE)
- valibot: 0.36 → 1.2+ (CVE-2025-66020 ReDoS)
- esbuild: 0.21 → 0.25+ (CORS vulnerability)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

git tag -a security-phase1-done -m "Phase 1 Complete: Dependency security"
```

---

## 4. Phase 2: 웹 보안 (1주)

### 4.1 목표

nasun-website 웹 보안 강화

### 4.2 롤백 포인트

```bash
git tag -a security-phase2-pre -m "Before Phase 2: Web security"
```

### 4.3 작업 항목

#### 4.3.1 CORS 도메인 제한 (High)

**파일**: `apps/nasun-website/cdk/lib/common-stack.ts`

**현재**:
```typescript
"Access-Control-Allow-Origin": "*"
```

**수정**:
```typescript
const ALLOWED_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
];

// Lambda 응답에서 동적으로 설정
const origin = event.headers?.origin || event.headers?.Origin;
const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

return {
  headers: {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Credentials": "true",
  }
};
```

**검증**:
```bash
# 허용되지 않은 도메인에서 요청 시 CORS 에러 확인
curl -H "Origin: https://evil.com" https://api.nasun.io/endpoint
```

#### 4.3.2 CSRF 토큰 구현 (High)

**파일**:
- 백엔드: `apps/nasun-website/cdk/lambda-src/` (새 Lambda 추가)
- 프론트엔드: `apps/nasun-website/frontend/src/providers/auth/AuthContext.tsx`

**구현 계획**:
1. `/csrf-token` 엔드포인트 추가
2. 토큰을 httpOnly 쿠키로 저장
3. 모든 POST 요청에 X-CSRF-Token 헤더 추가

#### 4.3.3 API Rate Limiting (High)

**파일**: `apps/nasun-website/cdk/lib/api-gateway-stack.ts` (또는 해당 스택)

**수정**:
```typescript
const api = new apigateway.RestApi(this, 'NasunApi', {
  deployOptions: {
    throttlingRateLimit: 1000,    // 1000 requests/second
    throttlingBurstLimit: 2000,   // 2000 burst
  },
});
```

#### 4.3.4 localStorage 암호화 (High)

**파일**: `apps/nasun-website/frontend/src/hooks/wallet/useUserWallet.ts`

**수정 방향**:
- 민감한 데이터는 sessionStorage + 암호화
- 또는 IndexedDB + Web Crypto API

#### 4.3.5 XSS 방어 강화 (Medium)

**파일**:
- `apps/nasun-website/frontend/src/pages/PostDetailPage.tsx`
- `apps/gensol-website/frontend/src/pages/PostDetailPage.tsx`

**현재**: dangerouslySetInnerHTML + sanitizedContent 사용

**검증**:
- DOMPurify 설정 확인
- 허용된 태그/속성 목록 검토

### 4.4 테스트

```bash
# 빌드
pnpm build:nasun-website

# 로컬 테스트
pnpm dev:nasun-website

# CDK diff (변경사항 미리보기)
cd apps/nasun-website/cdk
npx cdk diff
```

### 4.5 완료 조건

- [ ] CORS 허용 도메인 제한
- [ ] CSRF 토큰 구현
- [ ] Rate Limiting 활성화
- [ ] localStorage 암호화 (선택)
- [ ] XSS 방어 검토 완료

### 4.6 커밋

```bash
git add apps/nasun-website
git commit -m "security(nasun-website): web security hardening

- Restrict CORS to allowed origins only
- Implement CSRF token for POST requests
- Enable API Gateway throttling (1000/s)
- Review XSS protection with DOMPurify

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

git tag -a security-phase2-done -m "Phase 2 Complete: Web security"
```

---

## 5. Phase 3: 스마트컨트랙트 보안 (2주)

### 5.1 목표

Pado 스마트컨트랙트 보안 강화

### 5.2 롤백 포인트

```bash
git tag -a security-phase3-pre -m "Before Phase 3: Smart contract security"
```

### 5.3 작업 항목

#### 5.3.1 TreasuryCap 민팅 상한선 (High)

**파일**:
- `apps/pado/contracts/sources/nbtc.move`
- `apps/pado/contracts/sources/nusdc.move`

**수정**:
```move
const MAX_SUPPLY: u64 = 21_000_000_00000000; // 21M NBTC (8 decimals)

public entry fun mint_with_cap(
    treasury_cap: &mut TreasuryCap<NBTC>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let current_supply = coin::total_supply(treasury_cap);
    assert!(current_supply + amount <= MAX_SUPPLY, EMaxSupplyReached);

    let coin = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(coin, recipient);
}
```

#### 5.3.2 Faucet 레이트 제한 (High)

**파일**: `apps/pado/contracts/sources/faucet.move`

**수정**:
```move
struct ClaimRecord has key {
    id: UID,
    last_claim: Table<address, u64>,  // address -> timestamp
}

const COOLDOWN_MS: u64 = 86400000; // 24 hours

public entry fun request_tokens(
    faucet: &mut TokenFaucet,
    record: &mut ClaimRecord,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let sender = tx_context::sender(ctx);
    let now = clock::timestamp_ms(clock);

    if (table::contains(&record.last_claim, sender)) {
        let last = *table::borrow(&record.last_claim, sender);
        assert!(now - last >= COOLDOWN_MS, ECooldownNotMet);
        *table::borrow_mut(&mut record.last_claim, sender) = now;
    } else {
        table::add(&mut record.last_claim, sender, now);
    };

    // ... 민팅 로직 ...
}
```

#### 5.3.3 Resolver 주소 환경 변수화 (High)

**파일**: `apps/pado/frontend/src/features/prediction/hooks/usePredictionAdmin.ts`

**현재**:
```typescript
const RESOLVER_ADDRESS = '0x05eef6d...';  // 하드코딩
```

**수정**:
```typescript
const RESOLVER_ADDRESS = import.meta.env.VITE_PREDICTION_RESOLVER_ADDRESS;

if (!RESOLVER_ADDRESS) {
  console.warn('VITE_PREDICTION_RESOLVER_ADDRESS not configured');
}
```

**환경 변수 추가**:
- `.env.staging`: `VITE_PREDICTION_RESOLVER_ADDRESS=0x...`
- `.env.production`: `VITE_PREDICTION_RESOLVER_ADDRESS=0x...`

#### 5.3.4 PTB Pool ID 검증 (Medium)

**파일**: `apps/pado/frontend/src/features/trading/transactions.ts`

**수정**:
```typescript
function validatePoolId(poolId: string | undefined, name: string): string {
  if (!poolId) {
    throw new Error(`Missing pool configuration: ${name}`);
  }
  if (!/^0x[0-9a-f]{64}$/i.test(poolId)) {
    throw new Error(`Invalid pool ID format: ${name}`);
  }
  return poolId;
}

const VALIDATED_POOL = {
  id: validatePoolId(POOLS.NBTC_NUSDC.id, 'NBTC_NUSDC'),
  // ...
};
```

#### 5.3.5 주문 검증 강화 (Medium)

**파일**: `apps/pado/frontend/src/features/trading/transactions.ts`

**수정**:
```typescript
function validateOrderParams(params: PlaceLimitOrderParams, pool: PoolConfig): void {
  if (params.price <= 0n) {
    throw new Error('Price must be positive');
  }
  if (params.quantity <= 0n) {
    throw new Error('Quantity must be positive');
  }

  // TickSize 검증
  if (pool.tickSize && params.price % pool.tickSize !== 0n) {
    throw new Error(`Price must be multiple of tick size: ${pool.tickSize}`);
  }

  // LotSize 검증
  if (pool.lotSize && params.quantity % pool.lotSize !== 0n) {
    throw new Error(`Quantity must be multiple of lot size: ${pool.lotSize}`);
  }
}
```

### 5.4 테스트

```bash
# Move 컨트랙트 빌드
cd apps/pado/contracts
sui move build

# 프론트엔드 빌드
pnpm build:pado

# 타입체크
pnpm --filter @nasun/pado typecheck
```

### 5.5 완료 조건

- [ ] 토큰 민팅 상한선 구현
- [ ] Faucet 24시간 쿨다운 구현
- [ ] Resolver 환경 변수화
- [ ] Pool ID 검증 추가
- [ ] 주문 검증 강화
- [ ] Move 컨트랙트 빌드 성공

### 5.6 커밋

```bash
git add apps/pado
git commit -m "security(pado): smart contract security hardening

Contracts:
- Add MAX_SUPPLY cap for NBTC/NUSDC minting
- Implement 24h cooldown for faucet claims

Frontend:
- Move RESOLVER_ADDRESS to environment variable
- Add Pool ID validation
- Strengthen order parameter validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

git tag -a security-phase3-done -m "Phase 3 Complete: Smart contract security"
```

---

## 6. Phase 4: DeFi 보안 (1개월)

### 6.1 목표

고급 DeFi 보안 기능 구현

### 6.2 롤백 포인트

```bash
git tag -a security-phase4-pre -m "Before Phase 4: DeFi security"
```

### 6.3 작업 항목 (우선순위별)

#### 6.3.1 오라클 통합 (High)

**목표**: 가격 조작 방지

**구현 계획**:
1. Pyth Network 또는 Switchboard 오라클 연동
2. TWAP (Time-Weighted Average Price) 구현
3. 가격 변동 범위 제한

**파일**:
- `apps/pado/contracts-prediction/sources/oracle.move` (신규)
- `apps/pado/frontend/src/features/prediction/lib/oracle.ts` (신규)

#### 6.3.2 재진입 방어 (Medium)

**목표**: 예측 시장 재진입 공격 방지

**파일**: `apps/pado/contracts-prediction/sources/prediction_market.move`

**수정 방향**:
- Checks-Effects-Interactions 패턴 적용
- 상태 잠금 메커니즘 추가

#### 6.3.3 슬리피지 검증 (Medium)

**목표**: 가격 조작으로 인한 손실 방지

**파일**:
- `apps/pado/frontend/src/features/trading/transactions.ts`
- 스마트컨트랙트 (minExecutionPrice 파라미터)

#### 6.3.4 청산 메커니즘 (Low - 장기)

**목표**: 마진 거래 시 청산 시스템

**Note**: 현재 마진 거래 미지원, 향후 계획

### 6.4 테스트

```bash
# 전체 빌드
pnpm build

# Move 컨트랙트 테스트 (있는 경우)
cd apps/pado/contracts-prediction
sui move test
```

### 6.5 완료 조건

- [ ] 오라클 통합 (선택)
- [ ] 재진입 방어 패턴 적용
- [ ] 슬리피지 검증 강화
- [ ] 통합 테스트 통과

### 6.6 커밋

```bash
git add apps/pado
git commit -m "security(pado): DeFi security enhancements

- Integrate price oracle (Pyth/Switchboard)
- Apply Checks-Effects-Interactions pattern
- Add slippage protection

🤖 Generated with [Claude Code](https://claude.com/claude-code)"

git tag -a security-phase4-done -m "Phase 4 Complete: DeFi security"
```

---

## 7. 완료 후 문서화

### 7.1 업데이트 대상 문서

| 문서 | 경로 | 업데이트 내용 |
|------|------|--------------|
| CLAUDE.md | /CLAUDE.md | 보안 지침 추가 |
| Wallet README | /packages/wallet/README.md | 보안 기능 설명 |
| Pado Implementation | /apps/pado/doc/PADO_IMPLEMENTATION_PLAN.md | 보안 Phase 추가 |
| Security Audit | /docs/SECURITY_AUDIT_REPORT.md | 최종 감사 보고서 |

### 7.2 보안 가이드라인 문서 (신규)

**파일**: `/docs/SECURITY_GUIDELINES.md`

**내용**:
- 암호화 표준 (AES-256-GCM, PBKDF2)
- 입력 검증 패턴
- 에러 처리 지침
- 로깅 정책 (민감 정보 마스킹)
- 코드 리뷰 체크리스트

### 7.3 최종 보안 감사 보고서

**파일**: `/docs/SECURITY_AUDIT_REPORT.md`

**내용**:
- 발견된 취약점 목록
- 수정 조치 내역
- 잔여 위험 평가
- 권장 후속 조치

### 7.4 완료 태그

```bash
git tag -a security-remediation-complete -m "Security Remediation Complete

Phases completed:
- Phase 1: Dependency security
- Phase 2: Web security
- Phase 3: Smart contract security
- Phase 4: DeFi security

Deferred to separate session:
- Wallet security (see Section 8)

Total vulnerabilities addressed: 22
- Critical: 1 → 0
- High: 7 → 0
- Medium: 10 → 0
- Low: 4 → 0 (optional)"

git push origin main --tags
```

---

## 8. 별도 진행: 지갑 보안 (다른 세션)

> ⚠️ 이 섹션의 항목들은 별도 세션에서 진행됩니다.
> 이 계획서에서는 추적 및 검증 목적으로만 기록합니다.

### 8.1 개요

| 항목 | 내용 |
|------|------|
| 대상 패키지 | `packages/wallet`, `packages/wallet-ui` |
| 위험도 분포 | High: 3, Medium: 4 |
| 예상 소요 시간 | 별도 세션에서 결정 |

### 8.2 High 우선순위

#### 8.2.1 sessionStorage 암호 저장 제거

**파일**: `packages/wallet/src/sui/client.ts:244-253`

**현재 문제**:
```typescript
// Base64는 암호화가 아님
const encoded = btoa(password);
sessionStorage.setItem(SESSION_KEY, encoded);
```

**권장 조치**:
- sessionStorage에 암호 저장 기능 완전 제거
- 또는 Web Crypto API로 실제 암호화 적용

**검증 방법**:
- [ ] DevTools > Application > Session Storage에서 암호 없음 확인

#### 8.2.2 Rate Limiting 임계값 강화

**파일**: `packages/wallet/src/core/rate-limit.ts:217`

**현재**: 8회 시도, 30초 지연
**권장**: 5회 시도, 60초 지연

**검증 방법**:
- [ ] 5회 연속 틀린 암호 입력 시 60초 차단 확인

#### 8.2.3 Mnemonic 클립보드 자동 정리

**파일**: `packages/wallet-ui/src/MnemonicBackup.tsx:19`

**권장 조치**:
- 클립보드 복사 후 3초 뒤 자동 정리
- `navigator.clipboard.writeText('')`

**검증 방법**:
- [ ] 니모닉 복사 후 3초 뒤 붙여넣기 시 빈 값

### 8.3 Medium 우선순위

| 항목 | 파일 | 조치 |
|------|------|------|
| JavaScript 문자열 메모리 | crypto.ts:191 | 문서화 및 경고 추가 |
| Private Key 메모리 정리 | ExportPrivateKey.tsx:32 | unmount 시 secureZero 호출 |
| Password 복잡도 | WalletConnect.tsx:327 | 복잡도 검사 추가 |
| PBKDF2 iteration | core/crypto.ts | 100,000 → 200,000 |

### 8.4 검증 체크리스트

완료 후 다음 항목 확인:

- [ ] sessionStorage에 암호 미저장
- [ ] Rate limiting 동작 (5회/60초)
- [ ] 클립보드 자동 정리 동작
- [ ] 패스워드 복잡도 검사 동작
- [ ] Private key 메모리 정리 동작
- [ ] 모든 테스트 통과: `pnpm --filter @nasun/wallet test`
- [ ] 모든 테스트 통과: `pnpm --filter @nasun/wallet-ui test`

### 8.5 완료 시 태그

```bash
git tag -a security-wallet-complete -m "Wallet Security Complete

- sessionStorage password removed
- Rate limiting strengthened (5/60s)
- Clipboard auto-clear after 3s
- Password complexity validation
- Private key memory cleanup

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## 부록 A: 롤백 절차 요약

```bash
# Phase 1 롤백 (의존성 보안)
git reset --hard security-phase1-pre
pnpm install

# Phase 2 롤백 (웹 보안)
git reset --hard security-phase2-pre

# Phase 3 롤백 (스마트컨트랙트 보안)
git reset --hard security-phase3-pre

# Phase 4 롤백 (DeFi 보안)
git reset --hard security-phase4-pre

# 전체 롤백 (모든 보안 수정 전)
git reset --hard security-phase1-pre
```

---

## 부록 B: 테스트 체크리스트

### Phase 1 (의존성 보안)
- [ ] `pnpm audit` clean
- [ ] `pnpm build` success
- [ ] `pnpm test` pass

### Phase 2 (웹 보안)
- [ ] CORS 차단 확인 (unauthorized origin)
- [ ] CSRF 토큰 검증 동작
- [ ] Rate limiting 동작 (429 응답)
- [ ] localStorage 암호화 확인 (해당 시)

### Phase 3 (스마트컨트랙트 보안)
- [ ] Move 컨트랙트 빌드 성공
- [ ] 민팅 상한선 테스트
- [ ] Faucet 쿨다운 테스트
- [ ] Resolver 환경 변수 확인

### Phase 4 (DeFi 보안)
- [ ] 오라클 가격 조회 동작
- [ ] 슬리피지 보호 동작
- [ ] 재진입 방어 확인

### 지갑 보안 (별도 세션)
> 섹션 8.4 체크리스트 참조

---

## 부록 C: 연락처

| 역할 | 담당 | 연락처 |
|------|------|--------|
| 보안 리드 | TBD | - |
| 스마트컨트랙트 | TBD | - |
| 프론트엔드 | TBD | - |
| 인프라 | TBD | - |

---

*이 문서는 보안 개선 작업 진행 시 지속적으로 업데이트됩니다.*
