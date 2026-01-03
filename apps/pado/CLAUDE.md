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

### 왜 Pado인가?

현재 온체인 금융은 분절되어 있습니다:
- DEX, 무기한 선물, 대출 프로토콜이 각각 분리되어 운영
- 사용자는 유동성 브릿징, 다중 지갑 관리, 일관성 없는 리스크 가정을 감수해야 함

Pado는 이 분절을 해결합니다:
- 핵심 시장 기능을 하나의 일관된, 검증 가능한 아키텍처로 통합
- 중앙화 거래소의 효율성 + 온체인의 투명성

---

## Product Roadmap

### 완료된 단계

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 0 | ✅ 완료 | Infrastructure | Nasun Devnet V3 (Sui mainnet v1.63.0 fork) |
| Phase 1 | ✅ 완료 | Spot DEX Core | DeepBook V3 CLOB 배포 + 테스트 토큰 |
| Phase 2 | ✅ 완료 | Trading UI MVP | 오더북, 주문폼, 잔고관리 |
| Phase 3 | ✅ 완료 | Trading UX | 가격 클릭 연동, 주문 상태 피드백 |
| Phase 4 | ✅ 완료 | Multi-Pool | NASUN/NUSDC 풀 추가, MarketSelector |
| Phase 5 | ✅ 완료 | Native Token | NASUN 입금/출금 지원 (가스비 예약) |

### 진행 중 및 예정

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 6 | ✅ 완료 | Trading UX Pro | 고급 주문 유형, 슬리피지 설정, 가격 제안 |
| Phase 7 | ✅ 완료 | Portfolio Dashboard | 포트폴리오 대시보드, P&L 표시 |
| Phase 8 | ✅ 완료 | Mobile & Theme | 모바일 반응형, 다크/라이트 테마 |
| Phase 9 | ✅ 완료 | Smart Account v2 | zkLogin 인증, 시드리스 온보딩 (2026-01-03) |
| Phase 10 | 📋 계획 | Cross-Chain Vaults | BTC, ETH 등 외부 자산 Vault 통합 |
| Phase 11 | 📋 계획 | Perpetuals | 무기한 선물 거래 |
| Phase 12 | 📋 계획 | Lending & Borrowing | 통합 대출 프로토콜 |
| Phase 13 | 📋 계획 | Staking | NAS 토큰 스테이킹 |
| Phase 14 | ⚠️ MVP+ | Prediction Markets | 예측 시장 (Sell/Admin 완료, 유동성 미구현) |
| Phase 15 | ✅ 완료 | Payments | 즉시 결제 및 전송 |
| Phase 16 | 📋 계획 | Unified Margin | 크로스-프로덕트 통합 마진 시스템 |

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

**현재 구현**:
- Embedded Wallet (AES-256-GCM 암호화, PBKDF2)
- zkLogin (Google OAuth + ZK proof 기반 인증)

**향후 확장**: Passkey 기반 생체 인증

### 2. Object-Based Financial Architecture

Nasun의 객체 지향 상태 모델로 모든 자산과 포지션을 동적, 조합 가능한 객체로 표현:

| 객체 유형 | 설명 |
|-----------|------|
| **Collateral Objects** | idle ↔ margin ↔ lending 상태 간 전환 |
| **Position Objects** | 청산, 오라클, 결제 로직 내장 |
| **Market Objects** | 크로스-프로덕트 조합성, 원자적 연산 지원 |

### 3. Unified Margin & Risk Engine (향후)

```
┌─────────────────────────────────────────────────────────────┐
│                   Unified Risk Engine                        │
├─────────────────────────────────────────────────────────────┤
│  Portfolio-Level Margin                                      │
│  ├── 자산별 리스크 가중치 적용                               │
│  ├── Spot, Futures, Lending, Prediction 간 마진 공유        │
│  └── 실시간 손익 계산 및 결정론적 청산                       │
├─────────────────────────────────────────────────────────────┤
│  Benefits                                                    │
│  ├── 자본 사일로 제거                                       │
│  ├── 조합 가능한 수익률                                     │
│  └── 향상된 자본 효율성                                     │
└─────────────────────────────────────────────────────────────┘
```

### 4. Cross-Chain Asset Integration (향후)

Vault 기반 외부 자산 통합:

```
External Chain (BTC, ETH)
        │
        ▼
┌───────────────────┐
│   Verified Vault   │  ← MPC / Threshold Signatures
│   (Lock Assets)    │
└─────────┬─────────┘
          │ 1:1 Mint
          ▼
┌───────────────────┐
│  Nasun-Native     │
│  Representation   │  → 모든 Pado 제품에서 사용 가능
└───────────────────┘
```

---

## Security & Governance

### Trust Model

| 항목 | 설명 |
|------|------|
| **Non-Custodial** | 사용자가 자산에 대한 완전한 통제권 유지 |
| **Vault Governance** | MPC + Threshold Signature로 단독 통제 제거 |
| **Onchain Verifiability** | Vault 상태, 발행량, 담보 투명하게 감사 가능 |
| **Deterministic Execution** | 마진, 청산, 결제 로직이 공개 검증 가능한 코드로 강제 |

### Progressive Decentralization

```
Phase 1: Foundation Stewardship
    ↓
Phase 2: Onchain Vault Management + Risk Parameter Governance
    ↓
Phase 3: DAO-controlled System Configuration
    ↓
Phase 4: Community-owned Protocol
```

### Compliance-Ready Architecture

| 원칙 | 구현 |
|------|------|
| **Privacy-Preserving** | ZK 기반 신원 증명으로 데이터 노출 없이 규제 요건 충족 |
| **Risk-Aligned** | "same activity, same risk, same standard" 원칙 |
| **Deterministic Risk** | 기관 수준의 리스크 엔진, 투명한 마진, 프로토콜 강제 안전장치 |

---

## Technical Specifications

### Network Configuration

| Spec | Value |
|------|-------|
| Network | Nasun Devnet |
| Chain ID | `6681cdfd` (2025-12-25 V3 리셋) |
| Fork Source | Sui mainnet v1.63.0 |
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Base Technology | DeepBook V3 CLOB |

### Deployed Contracts

**DeepBook V3**:
| 항목 | 값 |
|------|-----|
| Package | `0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757` |
| Registry | `0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4` |
| AdminCap | `0x1010f2ef902c482ffba7c9848d74b209bfcbbef4003f583f5faaadcf4ca883cb` |

**Pado Test Tokens** (Single Source of Truth: `.env.development`, `.env.staging`):
| 항목 | 환경 변수 |
|------|-----|
| Package | `VITE_TOKENS_PACKAGE` |
| NBTC Type | `VITE_NBTC_TYPE` |
| NUSDC Type | `VITE_NUSDC_TYPE` |

> 현재 주소: `0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489` (2026-01-03 배포)

**Trading Pools**:

| Pool | Pool ID | tick_size | lot_size | maker_fee | taker_fee |
|------|---------|-----------|----------|-----------|-----------|
| NBTC/NUSDC | `0xf1f6ee99616774ab0861348f5e3cf4285cea2fa0a5a7e91cee13f4ec554bcc63` | 10,000 ($0.01) | 10,000 (0.0001 BTC) | 0.05% | 0.1% |
| NASUN/NUSDC | `0x2662e8818e9f5f7c97362e50c33854c4b8e8af1a0cd0e53b1e9677cd66ee8f61` | 1,000 ($0.001) | 10,000,000 (0.01 NASUN) | 0.05% | 0.1% |

**Token Faucet**:
| 항목 | 값 |
|------|-----|
| Faucet Object | `0xcc9a3c29c42ac6cfb02a5d9b25be8b1c8f70c6f3ea6e48e0bb9a58e8ef01f36f` |
| 지급량 | 1 NBTC + 100,000 NUSDC per request |

---

## Tech Stack

| 항목 | 기술 |
|------|------|
| 빌드 도구 | Vite 7 |
| 프레임워크 | React 19 |
| 언어 | TypeScript 5.9 |
| 스타일링 | Tailwind CSS 3.4 |
| 상태 관리 | Zustand |
| 라우팅 | react-router-dom |
| 데이터 페칭 | @tanstack/react-query |
| Sui SDK | @mysten/sui |
| Wallet | @nasun/wallet, @nasun/wallet-ui |

---

## Project Structure

```
apps/pado/
├── CLAUDE.md                     # 이 파일
├── README.md                     # 프로젝트 소개
├── doc/
│   ├── PADO_IMPLEMENTATION_PLAN.md  # 구현 계획서
│   ├── PADO_NEXT_STEPS.md           # 다음 단계 계획
│   ├── PADO_UI_ROADMAP.md           # UI 로드맵
│   └── PREDICTION_LIQUIDITY_PLAN.md # 예측 시장 유동성 계획
├── contracts/                    # Move 스마트 컨트랙트
│   ├── pado/                    # Pado 테스트 토큰 패키지
│   │   └── sources/
│   │       ├── nbtc.move        # 테스트 BTC 토큰
│   │       ├── nusdc.move       # 테스트 USDC 토큰
│   │       └── faucet.move      # Token Faucet
│   ├── contracts-prediction/    # Prediction Market 컨트랙트
│   └── deepbookv3/              # DeepBook V3 (git submodule)
└── frontend/                    # Frontend (Vite + React)
    └── src/
        ├── config/
        │   └── network.ts       # RPC, Package IDs, Pools
        ├── lib/
        │   ├── sui-client.ts    # Sui 클라이언트
        │   └── deepbook.ts      # DeepBook V3 유틸
        ├── features/
        │   ├── trading/         # 거래 기능 모듈
        │   │   ├── components/
        │   │   ├── context/
        │   │   ├── hooks/
        │   │   └── types.ts
        │   ├── prediction/      # 예측 시장 모듈
        │   │   ├── components/  # MarketCard, OutcomeOrderForm, etc.
        │   │   ├── hooks/       # useMarkets, usePredictionTrade, etc.
        │   │   ├── lib/         # prediction-market.ts, transactions.ts
        │   │   └── types.ts
        │   ├── portfolio/       # 포트폴리오 모듈
        │   │   ├── components/  # AssetOverview, TokenBalanceList, etc.
        │   │   └── hooks/       # useTotalValue, useTradeHistory
        │   └── payments/        # 결제 모듈
        │       └── components/  # PaymentQRCode
        ├── pages/
        │   ├── TradePage.tsx    # 메인 거래 페이지
        │   ├── PortfolioPage.tsx # 포트폴리오 페이지
        │   ├── PaymentPage.tsx  # 결제 페이지
        │   ├── PredictPage.tsx  # 예측 시장 목록
        │   ├── PredictMarketPage.tsx # 예측 시장 상세
        │   └── PredictAdminPage.tsx  # Admin 마켓 생성
        ├── providers/
        │   └── theme/           # ThemeProvider, useTheme
        └── components/          # 공통 UI 컴포넌트
```

---

## Development Commands

```bash
# 모노레포 루트에서
pnpm dev:pado          # 개발 서버 (포트 5176)
pnpm build:pado        # 프로덕션 빌드

# Move 컨트랙트 배포
cd contracts && nasun client publish --gas-budget 100000000

# DeepBook V3 배포
cd deepbookv3 && nasun client publish --gas-budget 500000000
```

---

## Future Product Modules

### Perpetuals (Phase 11)
- 무기한 선물 거래
- 펀딩 레이트 메커니즘
- 교차/격리 마진

### Lending & Borrowing (Phase 12)
- 공급/대출 프로토콜
- 동적 금리 곡선
- 통합 마진과 연동

### Staking (Phase 13)
- NAS 토큰 스테이킹
- 네트워크 보안 참여
- 담보 모델링에 반영

### Unified Margin (Phase 16)
- 크로스-프로덕트 통합 마진 시스템
- 자산이 모든 상품에 걸쳐 담보로 기능
- 실시간 포트폴리오 리스크 계산

---

## Comparative Positioning

| 특성 | 기존 DeFi | CEX | Pado |
|------|----------|-----|------|
| 수탁 모델 | Non-custodial | Custodial | **Non-custodial** |
| 마진 시스템 | 분리됨 | 통합 | **통합 (온체인)** |
| 실행 속도 | 느림 | 빠름 | **빠름 (병렬 실행)** |
| 투명성 | 높음 | 낮음 | **높음** |
| 자본 효율성 | 낮음 | 높음 | **높음** |
| 크로스체인 | 브릿지 필요 | 중앙화 | **Vault 통합** |

---

## Related Projects

| 프로젝트 | 경로 | 설명 |
|---------|------|------|
| nasun-devnet | 별도 레포 | 블록체인 노드 (Rust) |
| network-explorer | `../network-explorer` | 블록 탐색기 |
| nasun-website | `../nasun-website` | 공식 웹사이트 |
| @nasun/wallet | `../../packages/wallet` | 지갑 핵심 로직 |
| @nasun/wallet-ui | `../../packages/wallet-ui` | 지갑 UI 컴포넌트 |

---

## Important Notes

1. **DeepBook V3 필수**: V3는 시스템 패키지가 아니므로 별도 배포 필요
2. **BalanceManager**: V3에서 AccountCap 대신 BalanceManager 사용
3. **SOE 단위**: 1 NASUN = 10^9 SOE (NASUN의 최소 단위)
4. **비전 정렬**: 모든 새로운 기능은 "Unified Onchain Finance" 비전에 부합해야 함

---

## EC2 SSH Access

```bash
# Node 1 (Validator + Fullnode + Faucet)
ssh -i ~/.ssh/<your-devnet-key>.pem ubuntu@3.38.127.23

# Node 2 (Validator)
ssh -i ~/.ssh/<your-devnet-key>.pem ubuntu@3.38.76.85
```
