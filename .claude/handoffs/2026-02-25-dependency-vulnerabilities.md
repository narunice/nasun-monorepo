# Handoff: 의존성 취약점 해결

**생성**: 2026-02-25 13:10
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

`pnpm audit`에서 총 33개 취약점 (critical 3, high 20, moderate 7, low 3)이 발견되었다.
2026-02-25 `/ship` 보안 리뷰에서 식별되었으며, 모두 **기존 의존성**에 의한 것으로 이번 코드 변경과 무관하다.
직접 의존성 업데이트 또는 pnpm overrides로 해결해야 한다.

## 완료된 작업

- [x] `pnpm audit` 전체 실행 및 결과 분석
- [x] 각 취약 패키지의 의존 경로 (`pnpm why`) 확인
- [x] 심각도별 분류 및 해결 전략 수립

## 미완료 작업

- [ ] Tier 1: 직접 의존성 업데이트 (react-router, axios)
- [ ] Tier 2: pnpm overrides 적용 (fast-xml-parser, h3, qs)
- [ ] Tier 3: 업스트림 대기 (node-tar, minimatch, elliptic, lodash, ajv, bn.js)
- [ ] 전체 빌드 검증 (`pnpm build`)
- [ ] 앱별 dev 서버 동작 확인
- [ ] `/ship` 으로 커밋 + 푸시

## 중요 컨텍스트

### 취약점 목록 (해결 순서대로)

#### Tier 1: 직접 의존성 업데이트

| 패키지 | 현재 버전 | 패치 버전 | 심각도 | 영향 앱 | 해결 방법 |
|--------|----------|----------|--------|---------|----------|
| `react-router` | 7.11.0 | >=7.12.0 | HIGH (XSS, Open Redirect, SSR ScrollRestoration) | gensol-website, nasun-website, network-explorer, pado | 각 앱의 `package.json`에서 `react-router-dom` 업데이트. baram은 이미 7.13.0 |
| `axios` | 1.12.2 | >=1.12.0 | HIGH (DoS) | wallet (via @ledgerhq), baram-executor-nitro (via cmake-js) | Ledger SDK 업데이트 필요. cmake-js의 axios@1.13.2는 이미 패치됨 |

**react-router 해결 방법**:
```bash
# 4개 앱에서 업데이트 (baram은 이미 7.13.0이라 불필요)
cd apps/gensol-website/frontend && pnpm update react-router-dom
cd apps/nasun-website/frontend && pnpm update react-router-dom
cd apps/network-explorer && pnpm update react-router-dom
cd apps/pado/frontend && pnpm update react-router-dom
```

**axios 해결 방법**:
- `@ledgerhq` 패키지가 `axios@1.12.2`를 내부 의존. Ledger SDK 업데이트 필요
- 직접 업데이트 안 될 경우 override: `"axios": ">=1.12.0"`

#### Tier 2: pnpm overrides 적용

| 패키지 | 현재 버전 | 패치 버전 | 심각도 | 의존 경로 | Override |
|--------|----------|----------|--------|----------|---------|
| `fast-xml-parser` | 5.2.5 | >=5.3.5 | CRITICAL | @aws-sdk/xml-builder → fast-xml-parser | `"fast-xml-parser": ">=5.3.5"` |
| `h3` | 1.15.4 | >=1.15.5 | HIGH | @walletconnect → unstorage → h3 | `"h3": ">=1.15.5"` |
| `qs` | 6.14.1 | >=6.14.2 | LOW | express → body-parser → qs | `"qs": ">=6.14.2"` |

**적용 위치**: root `package.json`의 `pnpm.overrides` 섹션에 추가:
```json
{
  "pnpm": {
    "overrides": {
      "fast-xml-parser": ">=5.3.5",
      "h3": ">=1.15.5",
      "qs": ">=6.14.2"
    }
  }
}
```

#### Tier 3: 업스트림 대기 (모두 transitive, 클라이언트 사이드 영향 미미)

| 패키지 | 심각도 | 의존 경로 | 비고 |
|--------|--------|----------|------|
| `node-tar` (multiple CVEs) | HIGH | @ledgerhq → tar | Ledger SDK 업데이트 시 같이 해결 |
| `minimatch` (5x ReDoS) | HIGH | @ledgerhq → glob → minimatch | Ledger SDK 업데이트 시 같이 해결 |
| `lodash` (2x Prototype Pollution) | MODERATE | @ethersproject → lodash | ethers.js v5 legacy, 교체 불가 |
| `ajv` (2x ReDoS) | MODERATE | @walletconnect → ajv | WalletConnect 업데이트 대기 |
| `bn.js` (2x infinite loop) | MODERATE | @ethersproject → bn.js | ethers.js v5 legacy, 교체 불가 |
| `elliptic` | LOW | @ledgerhq → elliptic | 클라이언트 사이드, 실질 위험 낮음 |
| `@aws-sdk/core` | LOW | defense in depth 권고, 취약점 아님 | AWS SDK 업데이트 시 자동 해결 |

### 주의사항

- **react-router 7.12+ breaking changes 확인 필요**: 7.11 → 7.12 마이너 업데이트지만, CSRF 보호 관련 변경이 있을 수 있음. 각 앱의 라우팅 동작 확인 필수.
- **fast-xml-parser override 호환성**: AWS SDK가 5.3.5와 호환되는지 확인. semver 범위가 `^5.0.0`이면 문제 없음.
- **h3 override**: WalletConnect의 unstorage가 h3@1.x를 사용하므로, 1.15.5로 올려도 호환됨.
- **Tier 3 패키지들**: `@ledgerhq`와 `@ethersproject`는 deep transitive 의존성. override로 강제 업그레이드하면 런타임 에러 위험. 업스트림 업데이트를 기다리는 것이 안전.

### 현재 pnpm overrides 상태

```json
{
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "@mysten/sui": "1.45.2",
  "happy-dom": ">=20.0.0",
  "valibot": ">=1.2.0",
  "esbuild": ">=0.25.0"
}
```

### 파일 위치

- **Root package.json** (overrides): `package.json:50-57`
- **gensol-website deps**: `apps/gensol-website/frontend/package.json`
- **nasun-website deps**: `apps/nasun-website/frontend/package.json`
- **network-explorer deps**: `apps/network-explorer/package.json`
- **pado deps**: `apps/pado/frontend/package.json`
- **baram-executor-nitro deps**: `apps/baram/executor-nitro/package.json`
- **wallet deps** (Ledger, WalletConnect): `packages/wallet/package.json`

## 즉시 다음 단계

1. Tier 2 overrides 추가 (`fast-xml-parser`, `h3`, `qs`)를 root `package.json`에 적용하고 `pnpm install` 실행
2. 4개 앱에서 `react-router-dom` 업데이트: `pnpm update react-router-dom`
3. `pnpm audit` 재실행하여 Tier 1 + 2 해결 확인
4. `pnpm build` 전체 빌드 검증
5. 남은 Tier 3 취약점 목록 확인 (업스트림 대기 항목만 남아야 함)
6. `/ship` 으로 커밋 + 푸시
