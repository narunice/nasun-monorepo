# Pado 통합 금융 앱 구축 계획서

**작성일**: 2025-12-25
**최종 업데이트**: 2025-12-25
**목표**: Nasun Network 위에 DeepBook V3 기반 Spot DEX로 시작하여, Perps, Prediction Markets, Lending으로 확장 가능한 통합 금융 플랫폼 구축

**핵심 철학**: Smart Account, Unified Margin, Object-based Architecture

---

## 현황 요약

| 항목 | 상태 |
|------|------|
| Nasun Devnet V3 리셋 | ✅ 완료 (Sui mainnet v1.63.0 fork) |
| Chain ID | `6681cdfd` |
| Validator 합의 | ✅ 운영중 (2노드) |
| Fullnode RPC | ✅ 운영중 (http://3.38.127.23:9000) |
| Faucet | ✅ 운영중 (100 NASUN/요청) |
| DeepBook V3 | ✅ 배포 완료 (`0xceaeca5c...`) |
| Test Tokens | ✅ 배포 완료 (NBTC, NUSDC) |
| Explorer 지갑 | ✅ 정상 작동 |

### 네트워크 정보

| 항목 | 값 |
|------|-----|
| Chain ID | `6681cdfd` |
| Fork Source | Sui mainnet v1.63.0 |
| RPC | http://3.38.127.23:9000 |
| Faucet | http://3.38.127.23:5003/gas |
| Total Supply | 10,000,000,000 NASUN |
| 최소 단위 | SOE (1 NASUN = 10^9 SOE) |
| Epoch Duration | 60초 |

---

## 전략 변경: V2 → V3

### 변경 배경

기존 계획은 DeepBook V2를 sui-framework에서 복원하여 사용하는 것이었으나,
Nasun Devnet을 최신 Sui mainnet v1.63.0으로 완전 리셋하면서 **DeepBook V3**로 전환.

### V3 선택 이유

| 항목 | V2 | V3 |
|------|----|----|
| 상태 | ❌ deprecated (`abort 1337`) | ✅ 활성 개발중 |
| Flash Loan | ❌ | ✅ |
| Oracle Integration | ❌ | ✅ |
| Governance | ❌ | ✅ |
| Deep Token | ❌ | ✅ |
| SDK 지원 | 레거시 | 최신 |

### V3 핵심 정보

| 항목 | 값 |
|------|-----|
| Repository | https://github.com/MystenLabs/deepbookv3 |
| Move 패키지 | `deepbookv3/packages/deepbook` |
| 타입 | User Package (별도 배포 필요) |
| License | Apache 2.0 |
| SDK | `@mysten/deepbookv3-sdk` |

---

## Phase 0: Nasun Devnet V3 리셋 ✅ 완료

### 0.1 최신 Sui mainnet fork ✅

```bash
git clone https://github.com/MystenLabs/sui.git
git checkout main  # v1.63.0
cargo build --release
```

### 0.2 제네시스 생성 ✅

```bash
./sui genesis --force --epoch-duration-ms 60000 --committee-size 2 \
  --benchmark-ips 3.38.127.23 3.38.76.85 --with-faucet
```

### 0.3 서비스 운영 ✅

| 서비스 | 상태 |
|--------|------|
| Validator Node 1 | ✅ 실행중 |
| Validator Node 2 | ✅ 실행중 |
| Fullnode (RPC) | ✅ 실행중 (port 9000) |
| Faucet | ✅ 실행중 (port 5003) |

---

## Phase 1: DeepBook V3 배포 + 테스트 토큰 ✅ 완료

### 배포된 컨트랙트 (2025-12-25)

**DeepBook V3**:
| 항목 | 값 |
|------|-----|
| Package | `0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757` |
| Registry | `0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4` |
| AdminCap | `0x1010f2ef902c482ffba7c9848d74b209bfcbbef4003f583f5faaadcf4ca883cb` |

**Pado Test Tokens**:
| 항목 | 값 |
|------|-----|
| Package | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976` |
| NBTC Type | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nbtc::NBTC` |
| NUSDC Type | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC` |
| NBTC TreasuryCap | `0xe45f798115f60b04ae8c7c56202f8b7c218c4ad0e3f24bea840f91e8476d2b01` |
| NUSDC TreasuryCap | `0x038d9ecce1c57ddb61ca2351b39a1dbb52c73b48fb0d454c3ed036f93d425a46` |

### 1.1 DeepBook V3 배포 ✅

> **Gemini 제안 반영**: Git Submodule로 관리하여 버전 업데이트 용이

```bash
# Step 1: DeepBook V3를 Submodule로 추가 (git clone 대신)
cd /home/naru/my_apps/nasun-apps/pado
git submodule add https://github.com/MystenLabs/deepbookv3.git deepbookv3

# Step 2: Move 패키지 빌드
cd deepbookv3/packages/deepbook
sui move build

# Step 3: Nasun Devnet에 배포
nasun client test-publish . --gas-budget 5000000000 --build-env nasun-devnet --with-unpublished-dependencies --force

# Step 4: 환경변수에 기록 (.env.local)
echo "VITE_DEEPBOOK_PACKAGE=<PackageID>" >> ../../.env.local
```

**Submodule 장점**:
- DeepBook V3 업데이트 시 `git submodule update --remote`로 간편 갱신
- 특정 버전 고정 가능 (안정성)
- 이후 클론 시 `git clone --recursive` 사용

### 1.2 테스트 토큰 배포 ✅

**파일 생성**:
- `/home/naru/my_apps/nasun-apps/pado/contracts/sources/nbtc.move`
- `/home/naru/my_apps/nasun-apps/pado/contracts/sources/nusdc.move`

```move
module pado::nbtc {
    use sui::coin::{Self, TreasuryCap};

    public struct NBTC has drop {}

    fun init(witness: NBTC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<NBTC>(
            witness, 8, b"NBTC", b"Nasun BTC",
            b"Nasun Network Test BTC", option::none(), ctx
        );
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}
```

**배포 후 환경변수 기록**:
```bash
# 배포
cd /home/naru/my_apps/nasun-apps/pado/contracts
sui move build
nasun client publish --gas-budget 100000000

# .env.local에 기록
echo "VITE_NBTC_TYPE=<PackageID>::nbtc::NBTC" >> ../.env.local
echo "VITE_NUSDC_TYPE=<PackageID>::nusdc::NUSDC" >> ../.env.local
```

### 1.3 V3 Pool 생성 ✅

**생성된 Pool** (2025-12-25):
| 항목 | 값 |
|------|-----|
| NBTC/NUSDC Pool | `0xf1f6ee99616774ab0861348f5e3cf4285cea2fa0a5a7e91cee13f4ec554bcc63` |
| tick_size | 10,000 ($0.01) |
| lot_size | 10,000 (0.0001 BTC) |
| min_size | 10,000 |
| maker_fee | 0.05% |
| taker_fee | 0.1% |

**사용한 명령어**:
```bash
sui client call \
  --package 0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757 \
  --module pool \
  --function create_pool_admin \
  --type-args "0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nbtc::NBTC" \
              "0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC" \
  --args <REGISTRY> <tick_size> <lot_size> <min_size> <whitelisted> <stable> <ADMIN_CAP> \
  --gas-budget 100000000
```

---

## Phase 2: Frontend MVP 🔜 다음 단계

### 2.0 기술 스택

> nasun-explorer, nasun-website와 동일한 스택 사용

| 항목 | 기술 |
|------|------|
| 빌드 도구 | Vite |
| 프레임워크 | React 18/19 |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS |
| 상태 관리 | Zustand |
| 라우팅 | react-router-dom |
| 데이터 페칭 | @tanstack/react-query |
| Sui SDK | @mysten/sui |

### 2.1 프로젝트 구조

```
/home/naru/my_apps/nasun-apps/pado/
├── .env.local                    # 환경변수 (git 제외)
├── .gitignore
├── contracts/                    # Move 컨트랙트
│   └── sources/
│       ├── nbtc.move
│       └── nusdc.move
├── deepbookv3/                   # DeepBook V3 (git submodule)
│   └── packages/deepbook/
└── src/
    ├── config/
    │   └── network.ts           # RPC, Package IDs
    ├── lib/
    │   ├── sui-client.ts
    │   └── deepbook.ts          # DeepBook V3 유틸
    ├── wallet/                   # Explorer에서 이식
    │   ├── lib/crypto.ts, keystore.ts
    │   ├── hooks/useWallet.ts
    │   └── components/WalletConnect.tsx
    ├── smart-account/            # Smart Account 래퍼
    │   ├── types/account.ts
    │   ├── adapters/
    │   │   ├── BrowserWalletAdapter.ts
    │   │   ├── EmbeddedWalletAdapter.ts
    │   │   └── ZkLoginAdapter.ts
    │   └── core/SmartAccountProvider.tsx
    ├── features/
    │   ├── orderbook/
    │   ├── trading/
    │   ├── flash-loan/          # V3 신기능
    │   └── margin/
    └── stores/                   # Zustand
```

### 2.2 Smart Account 래퍼 인터페이스

```typescript
// smart-account/types/account.ts
export interface ISmartAccount {
  readonly address: string | null;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;

  // DeepBook V3 BalanceManager 관리
  getBalanceManager(poolId: string): Promise<string | null>;
  createBalanceManager(): Promise<string>;
}

export type AccountType = 'browser' | 'embedded' | 'zklogin' | 'passkey';
```

### 2.3 지갑 모듈 이식

| 원본 (nasun-explorer) | 대상 (pado) | 수정 |
|----------------------|-------------|------|
| `wallet/lib/crypto.ts` | `wallet/lib/crypto.ts` | 없음 |
| `wallet/lib/keystore.ts` | `wallet/lib/keystore.ts` | 없음 |
| `wallet/hooks/useWallet.ts` | `wallet/hooks/useWallet.ts` | 없음 |
| `wallet/lib/sui-client.ts` | `wallet/lib/sui-client.ts` | 경로 수정 |

---

## 예상 일정

| Phase | 작업 | 상태 |
|-------|------|------|
| **Phase 0** | Nasun Devnet V3 리셋 | ✅ 완료 |
| **Phase 1** | DeepBook V3 배포 + 테스트 토큰 + Pool 생성 | ✅ 완료 (2025-12-25) |
| **Phase 2** | Frontend MVP | 🔜 다음 |
| **Phase 3** | Smart Account (zkLogin/Passkey) | 🔜 예정 |
| **Phase 4** | Perps / Unified Margin | 🔜 예정 |

---

## Critical Files

1. **DeepBook V3 소스**
   - https://github.com/MystenLabs/deepbookv3

2. **지갑 모듈 이식 원본**
   - `/home/naru/my_apps/nasun-explorer/src/wallet/`

3. **인프라 정보**
   - `/home/naru/my_apps/nasun-devnet/CLAUDE.md`
   - `/home/naru/my_apps/nasun-apps/pado/CLAUDE.md`

---

## 환경변수 관리

> **Gemini 제안 반영**: `.env` 파일로 배포된 Package ID 관리

### .env.local (Git 제외)

```bash
# Nasun Devnet 설정
VITE_RPC_URL=http://3.38.127.23:9000
VITE_FAUCET_URL=http://3.38.127.23:5003/gas
VITE_CHAIN_ID=6681cdfd

# DeepBook V3 (2025-12-25 배포)
VITE_DEEPBOOK_PACKAGE=0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757
VITE_DEEPBOOK_REGISTRY=0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4

# Test Tokens (2025-12-25 배포)
VITE_TOKENS_PACKAGE=0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976
VITE_NBTC_TYPE=0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nbtc::NBTC
VITE_NUSDC_TYPE=0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC

# Pool (Phase 2에서 생성)
VITE_POOL_ID=<TBD>
```

### 프론트엔드에서 사용

```typescript
// src/config/network.ts
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL,
  faucetUrl: import.meta.env.VITE_FAUCET_URL,
  chainId: import.meta.env.VITE_CHAIN_ID,
  deepbookPackage: import.meta.env.VITE_DEEPBOOK_PACKAGE,
  nbtcType: import.meta.env.VITE_NBTC_TYPE,
  nusdcType: import.meta.env.VITE_NUSDC_TYPE,
  poolId: import.meta.env.VITE_POOL_ID,
};
```

### .gitignore 추가

```
.env.local
.env.*.local
```

---

## 주의사항

1. **DeepBook V3 별도 배포 필수**: V3는 시스템 패키지가 아님
2. **BalanceManager**: V2의 AccountCap 대신 V3의 BalanceManager 사용
3. **Pool 생성 비용**: 예상 100+ NASUN
4. **SDK 선택**: `@mysten/deepbookv3-sdk`
5. **Submodule 클론**: `git clone --recursive` 또는 `git submodule update --init`

---

## Pado 비전과의 정합성

| Pado 비전 | V3 구현 반영 |
|-----------|-------------|
| Smart Account | `smart-account/` 래퍼 인터페이스 (zkLogin/Passkey 확장 가능) |
| Unified Margin | `features/margin/` 구조 준비 + V3 BalanceManager 활용 |
| Object-based | DeepBook V3의 Pool, BalanceManager 객체 모델 |
| Cross-Market | V3의 Flash Loan, Oracle로 Perps/Lending 확장 용이 |

---

## 기술적 배경 및 결정 근거

### V3 선택의 장점

1. **미래 지향적**: V3는 Sui 생태계의 표준 DEX 엔진
2. **확장성**: Flash Loan, Oracle 통합으로 Pado Phase 2-4 개발 용이
3. **SDK 지원**: 최신 TypeScript SDK로 개발 생산성 향상
4. **기술 부채 제거**: deprecated V2 유지 관리 부담 없음

### BalanceManager와 Unified Margin 확장 전략

DeepBook V3는 사용자 잔액을 **BalanceManager 객체**로 관리합니다.

**현재 (Phase 2)**:
- BalanceManager를 사용자 지갑이 직접 소유
- Pool별 독립 잔고

**향후 Unified Margin 구현 시**:
- BalanceManager를 Pado Smart Contract(공용 금고)가 소유
- 사용자는 논리적 소유권만 보유
- `ISmartAccount` 인터페이스 덕분에 프론트엔드 수정 없이 백엔드 로직만 교체 가능

### Pado의 진짜 혁신 포인트

- Smart Account (zkLogin/Passkey 기반 계정 추상화)
- Unified Margin (포트폴리오 레벨 마진 시스템)
- Object-based Architecture (Move 객체 모델 활용)
- Flash Loan 통합 (V3 고유 기능 활용)

**결론**: V3를 사용하는 것은 Pado의 비전과 완벽히 정렬된 최적의 선택
