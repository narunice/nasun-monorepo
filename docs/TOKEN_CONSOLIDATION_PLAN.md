# Token Consolidation Plan

> **Date**: 2026-01-27
> **Status**: Planning
> **Author**: Claude + Naru

---

## 개요

Nasun Devnet에서 NUSDC/NBTC 토큰을 단일 패키지로 통합하여 앱 간 호환성을 확보합니다.

---

## 현재 상황 분석

### 문제점

| 앱 | NUSDC Package ID | 비고 |
|---|---|---|
| pado | `0xd0e01761b2f822df9cd412af99d75d35c477d805b1636981acd15c4a5c0ab772` | pado_tokens 패키지 |
| baram | `0x85dcb01f178587080052e9e78fa2a1c73cddaf175f48b2f99730d5c5b7fd08e3` | baram 패키지에 번들 |

**결과:**
1. `pado::nusdc::NUSDC` ≠ `baram::nusdc::NUSDC` (서로 다른 타입)
2. pado에서 받은 NUSDC를 baram에서 사용 불가
3. 사용자가 앱마다 별도 Faucet 사용 필요
4. 유동성 분산

### 현재 파일 구조

```
apps/pado/contracts/
├── sources/
│   ├── nusdc.move      # pado::nusdc::NUSDC
│   ├── nbtc.move       # pado::nbtc::NBTC
│   └── faucet.move     # TokenFaucet, ClaimRecord
└── Move.toml           # name = "pado"

apps/baram/contracts/
├── sources/
│   └── baram.move      # use pado::nusdc::NUSDC (내부 모듈 참조)
└── Move.toml           # name = "baram", addresses: pado = "0x0"
```

### devnet-config 현황

```json
{
  "tokens": {
    "packageId": "0xd0e01761...",
    "tokenFaucet": "0x91ff89b0...",
    "claimRecord": "0xc06fdade..."
  },
  "baram": {
    "packageId": "0x85dcb01f...",
    "nusdcType": "0x85dcb01f...::nusdc::NUSDC"
  }
}
```

---

## 통합 방안

### Option A: pado 토큰을 공식 토큰으로 지정 (권장)

**장점:**
- 이미 배포된 Faucet 재사용
- pado 앱 변경 불필요
- 최소 변경으로 통합 가능

**단점:**
- "pado" 이름이 앱 중립적이지 않음
- baram 컨트랙트 재배포 필요

**구현:**
1. baram.move에서 외부 pado 패키지 의존성 추가
2. baram 패키지 재배포
3. devnet-config에서 `baram.nusdcType`을 pado 토큰으로 변경

### Option B: packages/devnet-tokens 신규 생성

**장점:**
- 앱 중립적 이름 (devnet_tokens)
- 깔끔한 구조

**단점:**
- 모든 컨트랙트 재배포 필요
- 기존 토큰 잔액 초기화

**구현:**
1. `packages/devnet-tokens/` Move 패키지 생성
2. devnet에 배포
3. pado, baram 모두 새 토큰 타입 사용하도록 수정
4. 각 앱 컨트랙트 재배포

### Option C: Frontend 레벨 통합 (임시)

**장점:**
- 컨트랙트 변경 없음

**단점:**
- 근본적 해결 아님
- 여전히 두 종류 토큰 존재

**구현:**
1. Frontend에서 앱별 다른 토큰 타입 사용
2. devnet-config에서 앱별 NUSDC 타입 분리

---

## 권장 방안: Option B (packages/devnet-tokens)

V6 devnet이 최근 리셋되었고, pado 앱도 V6 기준 재배포가 필요한 상황입니다.
이 기회에 토큰 패키지를 앱 중립적인 위치로 이동하는 것이 장기적으로 유리합니다.

---

## 구현 계획

### Phase 1: packages/devnet-tokens 생성

```
packages/devnet-tokens/
├── sources/
│   ├── nusdc.move      # devnet_tokens::nusdc::NUSDC
│   ├── nbtc.move       # devnet_tokens::nbtc::NBTC
│   └── faucet.move     # TokenFaucet, ClaimRecord
├── Move.toml
└── README.md
```

**Move.toml:**
```toml
[package]
name = "devnet_tokens"
edition = "2024.beta"

[dependencies]
Sui = { git = "...", subdir = "crates/sui-framework/packages/sui-framework" }

[addresses]
devnet_tokens = "0x0"
```

### Phase 2: Devnet V6 배포

```bash
cd packages/devnet-tokens
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000
```

**배포 결과 기록:**
- Package ID: `<TBD>`
- TokenFaucet: `<TBD>`
- ClaimRecord: `<TBD>`

### Phase 3: Faucet 초기화

```bash
# TreasuryCap 전송 후 Faucet 생성
sui client call --package <PACKAGE_ID> \
  --module faucet \
  --function create_faucet \
  --args <NBTC_TREASURY_CAP> <NUSDC_TREASURY_CAP>
```

### Phase 4: devnet-config 업데이트

**devnet-ids.json:**
```json
{
  "tokens": {
    "packageId": "<NEW_PACKAGE_ID>",
    "tokenFaucet": "<NEW_FAUCET_ID>",
    "claimRecord": "<NEW_CLAIM_RECORD>"
  }
}
```

**ids/tokens.ts:**
```typescript
// Unified token types for all apps
export const NBTC_TYPE: CoinType = `${TOKENS_PACKAGE_ID}::nbtc::NBTC`;
export const NUSDC_TYPE: CoinType = `${TOKENS_PACKAGE_ID}::nusdc::NUSDC`;
```

### Phase 5: baram 컨트랙트 수정

**apps/baram/contracts/Move.toml:**
```toml
[dependencies]
devnet_tokens = { local = "../../../packages/devnet-tokens" }

[addresses]
baram = "0x0"
devnet_tokens = "<NEW_PACKAGE_ID>"
```

**apps/baram/contracts/sources/baram.move:**
```move
// Before
use pado::nusdc::NUSDC;

// After
use devnet_tokens::nusdc::NUSDC;
```

### Phase 6: baram 재배포

```bash
cd apps/baram/contracts
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000
```

### Phase 7: pado 컨트랙트 정리 (선택)

**Option 1: 토큰 코드 삭제**
- `apps/pado/contracts/sources/nusdc.move` 삭제
- `apps/pado/contracts/sources/nbtc.move` 삭제
- `apps/pado/contracts/sources/faucet.move` 삭제
- pado 컨트랙트에서 devnet_tokens 의존성 추가

**Option 2: 토큰 코드 유지 (deprecated)**
- 코드는 유지하되 주석으로 deprecated 표시
- 새 앱은 devnet_tokens 사용

### Phase 8: 문서 업데이트

1. `CLAUDE.md` (루트) - 토큰 패키지 위치 업데이트
2. `apps/pado/CLAUDE.md` - 토큰 변경 반영
3. `apps/baram/CLAUDE.md` - 토큰 변경 반영
4. `packages/devnet-config/README.md` - 토큰 설정 설명

---

## 마이그레이션 체크리스트

- [ ] packages/devnet-tokens 디렉토리 생성
- [ ] nusdc.move 복사 및 모듈명 변경 (pado → devnet_tokens)
- [ ] nbtc.move 복사 및 모듈명 변경
- [ ] faucet.move 복사 및 모듈명 변경
- [ ] Move.toml 생성
- [ ] devnet-tokens 패키지 배포
- [ ] Faucet 및 ClaimRecord 초기화
- [ ] devnet-ids.json 업데이트
- [ ] baram/contracts/Move.toml 수정
- [ ] baram.move에서 import 변경
- [ ] baram 패키지 재배포
- [ ] devnet-config 업데이트
- [ ] Frontend 환경 변수 업데이트
- [ ] E2E 테스트
- [ ] 문서 업데이트

---

## 예상 비용

| 항목 | 예상 가스 |
|------|----------|
| devnet-tokens 배포 | ~0.1 NASUN |
| Faucet 생성 | ~0.01 NASUN |
| baram 재배포 | ~0.1 NASUN |
| **총합** | **~0.21 NASUN** |

> Devnet이므로 실제 비용 없음 (Faucet에서 NASUN 무료 획득 가능)

---

## 롤백 계획

문제 발생 시:
1. devnet-ids.json을 이전 버전으로 복원
2. Frontend 환경 변수 롤백
3. 기존 토큰 패키지 ID 사용 재개

---

## 향후 고려사항

### Mainnet 배포 시

- 토큰 패키지 이름을 `nasun_tokens`로 변경 권장
- 정식 감사(audit) 필요
- TreasuryCap 멀티시그 관리

### 추가 토큰 지원

devnet-tokens 패키지에 새 토큰 추가 가능:
- `neth.move` - Test ETH
- `nnas.move` - Test NAS (거버넌스 토큰)

---

## 관련 문서

- [CLAUDE.md (루트)](../CLAUDE.md) - 모노레포 개요
- [BARAM_IMPLEMENTATION_PLAN.md](./BARAM_IMPLEMENTATION_PLAN.md) - Baram 구현 계획
- [apps/pado/CLAUDE.md](../apps/pado/CLAUDE.md) - Pado 앱 가이드
- [apps/baram/CLAUDE.md](../apps/baram/CLAUDE.md) - Baram 앱 가이드
