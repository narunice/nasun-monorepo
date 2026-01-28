# CLAUDE.md (apps/pado)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

---

## Vision: Unified Onchain Finance

**Pado**는 Nasun Network 위에서 동작하는 **비수탁형(non-custodial) 통합 금융 애플리케이션**입니다.

> *"Unified, non-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network."*

### 핵심 철학

| 원칙 | 설명 |
|------|------|
| **Single Smart Account** | 모든 금융 활동(거래, 대출, 스테이킹, 결제)을 하나의 계정으로 통합 관리 |
| **Unified Margin System** | 포트폴리오 레벨의 통합 마진 - 자산이 모든 상품에 걸쳐 담보로 기능 |
| **Non-Custodial Control** | 사용자가 자산에 대한 완전한 통제권 유지, 개인키 노출 없음 |
| **Object-Based Architecture** | Nasun의 객체 기반 상태 모델로 복잡한 금융 상호작용을 온체인에서 네이티브하게 모델링 |
| **CEX-Grade UX, DEX-Level Transparency** | 중앙화 거래소 수준의 사용자 경험 + 온체인 검증 가능성 |

---

## Product Roadmap

### 완료된 단계

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 0 | ✅ 완료 | Infrastructure | Nasun Devnet V6 (Sui mainnet v1.63.0 fork, 2026-01-27 리셋) |
| Phase 1 | ✅ 완료 | Spot DEX Core | DeepBook V3 CLOB 배포 + 테스트 토큰 |
| Phase 2 | ✅ 완료 | Trading UI MVP | 오더북, 주문폼, 잔고관리 |
| Phase 3 | ✅ 완료 | Trading UX | 가격 클릭 연동, 주문 상태 피드백 |
| Phase 4 | ✅ 완료 | Multi-Pool | NASUN/NUSDC 풀 추가, MarketSelector |
| Phase 5 | ✅ 완료 | Native Token | NASUN 입금/출금 지원 (가스비 예약) |
| Phase 6 | ✅ 완료 | Trading UX Pro | 고급 주문 유형, 슬리피지 설정, 가격 제안 |
| Phase 7 | ✅ 완료 | Portfolio Dashboard | 포트폴리오 대시보드, P&L 표시 |
| Phase 8 | ✅ 완료 | Mobile & Theme | 모바일 반응형, 다크/라이트 테마 |
| Phase 9 | ✅ 완료 | Smart Account v2 | zkLogin 인증, 시드리스 온보딩 (2026-01-03) |
| Phase 14 | ✅ 완료 | Prediction Markets | 예측 시장 + 시드 유동성 |
| Phase 15 | ✅ 완료 | Payments | 즉시 결제 및 전송 |
| Phase 16 | ✅ 완료 | Unified Margin v1 | Multi-collateral, Risk Engine, Liquidation (2026-01-10) |
| Phase 17 | ✅ 완료 | Lottery | 주간 로또 (2026-01-09 배포) |
| Phase 11 | ✅ 완료 | Perpetuals | 무기한 선물 거래 + 청산 엔진 (11.1-11.4 완료) |

### 진행 중 및 예정

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 10 | 📋 계획 | Cross-Chain Vaults | BTC, ETH 등 외부 자산 Vault 통합 |
| Phase 12 | 📋 계획 | Lending & Borrowing | 통합 대출 프로토콜 |
| Phase 13 | 📋 계획 | Staking | NAS 토큰 스테이킹 |

---

## Core Architecture

### 1. Account Model: Smart Account

Pado는 Nasun의 네이티브 계정 추상화를 활용합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Smart Account                       │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                              │
│  ├── zkLogin (ZK proof + Identity Provider)                 │
│  ├── Passkey (Device credentials)                           │
│  └── Embedded Wallet (Current implementation)               │
├─────────────────────────────────────────────────────────────┤
│  Single Account → All Products                               │
│  ├── Spot Trading                                           │
│  ├── Derivatives                                            │
│  ├── Lending/Borrowing                                      │
│  ├── Staking                                                │
│  └── Payments                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2. Object-Based Financial Architecture

Nasun의 객체 지향 상태 모델로 모든 자산과 포지션을 동적, 조합 가능한 객체로 표현:

| 객체 유형 | 설명 |
|-----------|------|
| **Collateral Objects** | idle ↔ margin ↔ lending 상태 간 전환 |
| **Position Objects** | 청산, 오라클, 결제 로직 내장 |
| **Market Objects** | 크로스-프로덕트 조합성, 원자적 연산 지원 |

### 3. Unified Margin & Risk Engine (v1 완료)

```
┌─────────────────────────────────────────────────────────────┐
│                   Unified Risk Engine v1                     │
├─────────────────────────────────────────────────────────────┤
│  Multi-Collateral Margin (NUSDC + NBTC)                     │
│  ├── NUSDC: 100% 담보 인정 (Haircut 0%)                    │
│  ├── NBTC: 90% 담보 인정 (Haircut 10%)                     │
│  └── Oracle 가격 기반 실시간 담보 가치 평가                 │
├─────────────────────────────────────────────────────────────┤
│  Risk Engine v1                                             │
│  ├── 4-Tier Threshold: IM(10%), Warning(8%), MM(5%), FC(3%)│
│  ├── AccountPositions: 포지션 추적 + PnL 계산              │
│  └── Liquidation: 5% 보너스, 50% 최대 청산 비율            │
├─────────────────────────────────────────────────────────────┤
│  Benefits                                                    │
│  ├── 자본 사일로 제거                                       │
│  ├── 조합 가능한 수익률                                     │
│  └── 향상된 자본 효율성                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Specifications

### Network Configuration

| Spec | Value |
|------|-------|
| Network | Nasun Devnet |
| Chain ID | `12bf3808` (2026-01-27 V6 리셋) |
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Base Technology | DeepBook V3 CLOB |

### Deployed Contracts (V6, 2026-01-27 리셋)

> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

**DeepBook V3**:
| 항목 | 값 |
|------|-----|
| Package | `0xaad9b8cfa778a3d4f2e28c6e07073d9627a85a2e7d6dfc33136f527450606253` |
| Registry | `0x2c386b2a2b8b5756ec316a309208d937b6907d97fbacfaa87fd514894aded384` |
| AdminCap | `0x413ace0602b7f0ec502d53c84aadd41763e1d79b35bfd382ef3ae9c0e7689262` |

**Unified Tokens (devnet_tokens)**:
| 항목 | 값 |
|------|-----|
| Package | `0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017` |
| TokenFaucet | `0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14` |
| NBTC Type | `{Package}::nbtc::NBTC` |
| NUSDC Type | `{Package}::nusdc::NUSDC` |

**Prediction Market**:
| 항목 | 값 |
|------|-----|
| Package | `0xbc4bcead337817d14dcfeef48474866f6b5fb3f655bb7f2822539ae6982696dd` |
| GlobalState | `0xcbff8cda5d8bd9b81358b159b09ff57fb2b159d57ddeb46b9e714e7290825553` |
| AdminCap | `0x34881d8e68f9d90da2865877b782ea27f25195a25ed73655ced2188aa1d3938a` |

**Lottery**:
| 항목 | 값 |
|------|-----|
| Package | `0x3b54a4e29caf4de9582766af8a9f54327161a5ac21cb8cfc6e99fa458117be80` |
| LotteryRegistry | `0x0a64e225326746ff7c1ff7bb0b130cd0df922cc00101aedbfa442550e7995794` |
| AdminCap | `0x8329a17bed9e4b98aeb502b1ecca5ee9d73b7ca1dd8a60a85e09dfd7f61f0cec` |

**Governance**:
| 항목 | 값 |
|------|-----|
| Package | `0x02daf1f825b3eaae3b2f0718e7cbab884dc58d1b740c594f505004607b04e516` |
| Dashboard | `0x3398b1931bc8c418b0e0e1d9c1e04537bfc82c3f85d4dc22e11c97469baee7ae` |
| AdminCap | `0xd96d14baf4422909e6721c5533d981f0a481b947989c95502d3a45f89f607a04` |

**DevOracle, Unified Margin v1, Perpetuals DEX**:
> V6 재배포 대기. 재배포 후 `packages/devnet-config/devnet-ids.json` 업데이트 필요.

---

## Tech Stack

| 항목 | 기술 |
|------|------|
| 빌드 도구 | Vite 7 |
| 프레임워크 | React 19 |
| 언어 | TypeScript 5.9 |
| 스타일링 | Tailwind CSS 3.4 |
| 상태 관리 | Zustand |
| 데이터 페칭 | @tanstack/react-query |
| Sui SDK | @mysten/sui |
| Wallet | @nasun/wallet, @nasun/wallet-ui |

---

## Project Structure

```
apps/pado/
├── CLAUDE.md                     # 이 파일
├── contracts/                    # NBTC, NUSDC, Faucet
├── contracts-prediction/        # Prediction Market
├── contracts-oracle/            # DevOracle
├── contracts-lending/           # Lending (Planned)
├── contracts-lottery/           # Lottery
├── contracts-margin/            # Unified Margin v1
├── contracts-perp/              # Perpetuals DEX
└── frontend/                    # React App
    └── src/
        ├── features/            # 기능 모듈 (trading, prediction, lottery 등)
        ├── components/          # 공통 UI
        ├── pages/               # 페이지
        └── lib/                 # SUI 클라이언트, 유틸
```

---

## Development Commands

```bash
# 모노레포 루트에서
pnpm dev:pado          # 개발 서버 (포트 5176)
pnpm build:pado        # 프로덕션 빌드

# Move 컨트랙트 배포
cd contracts-margin && nasun client publish --gas-budget 100000000
```