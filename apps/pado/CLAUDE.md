# CLAUDE.md (apps/pado)

> Last Updated: 2026-05-18
> Common rules (language, UI language rules): see root [CLAUDE.md](../../CLAUDE.md)

---

## Vision: Unified Onchain Finance

**Pado** is a **self-custodial unified financial application** running on Nasun Network.

> *"Unified, self-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network."*

### Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Single Smart Account** | All financial activities (trading, lending, staking, payments) managed through one account |
| **Unified Margin System** | Portfolio-level unified margin -- assets serve as collateral across all products |
| **Self-Custodial Control** | Users maintain full control over assets, no private key exposure |
| **Object-Based Architecture** | Nasun's object-based state model natively models complex financial interactions on-chain |
| **CEX-Grade UX, DEX-Level Transparency** | CEX-level user experience + on-chain verifiability |

---

## Core Architecture

### Account Model: Smart Account

```
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Smart Account                       │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                              │
│  ├── zkLogin (ZK proof + Google OAuth)                      │
│  ├── Passkey (Device credentials)                           │
│  └── Embedded Wallet (Current primary)                      │
├─────────────────────────────────────────────────────────────┤
│  Single Account → All Products                               │
│  ├── Spot Trading (DeepBook V3 CLOB)                        │
│  ├── Perpetual Futures (20x leverage)                       │
│  ├── Prediction Markets (Binary YES/NO)                     │
│  ├── Lottery (Weekly draw)                                  │
│  ├── Lending/Borrowing [Partial - contracts deployed]       │
│  ├── Staking [Partial - UI stub]                             │
│  └── Payments (QR code transfer)                            │
└─────────────────────────────────────────────────────────────┘
```

### Unified Margin & Risk Engine (v1)

- **Multi-Collateral**: NUSDC (0% haircut) + NBTC (5% haircut, admin-adjustable)
- **4-Tier Threshold**: IM(10%), Warning(8%), MM(5%), FC(3%)
- **Liquidation**: 5% bonus, 50% max liquidation ratio, permissionless
- **Benefits**: Capital silo removal, composable yields, enhanced capital efficiency

---

## Development Commands

```bash
# From monorepo root
pnpm dev:pado              # Dev server (port 5176)
pnpm dev:pado:with-bot     # Dev server + LP Bot + Price Updater + TP/SL Keeper
pnpm build:pado            # Production build

# Move contracts
cd apps/pado/contracts-margin
nasun move build
nasun client publish --gas-budget 100000000

# Tests
cd apps/pado/frontend && pnpm test
cd apps/pado/frontend && pnpm test:coverage
```

---

## Operational Invariants (자주 까먹는 것)

1. **Bot 단일 인스턴스 강제** (CRITICAL): `price-updater`, `tpsl-keeper`, `lottery-keeper`, `prediction-keeper`, `prediction-arb`는 **prod에서만 실행**. staging `.env`에 동일 ADMIN_KEY/TradeCap이 있어도 PM2 stopped 유지. 중복 실행 시 owned object LockConflict로 fullnode 크래시 (project_pado_bot_single_instance.md).
2. **TP/SL keeper 주소 invariant**: prod keeper=`0x74a7daf4...`. `VITE_TPSL_KEEPER_ADDRESS` ↔ `KEEPER_PRIVATE_KEY` pubkey 동기화 필수. 불일치 시 keeper가 사용자 주문을 보지 못함 (project_pado_tpsl_keeper_address.md).
3. **envDir 패턴**: vite config에 `envDir: '../'` 적용. `.env.production`은 `apps/pado/`에 위치 (`apps/pado/frontend/.env` 아님). env 변경 시 빌드 후 [/env-verify](../../scripts/env-verify.sh)로 `VITE_*` embed 검증 필수.
4. **Prediction-keeper 자동 정산 (stock markets)**: Twelve Data 1차 + Yahoo cross-check. `TWELVEDATA_API_KEY` 없으면 awaiting resolution이 deadline까지 stall (project_pado_prediction_keeper.md).
11. **Prediction-keeper esports resolver (LCK)**: lolesports unofficial `getSchedule` API + 공개 x-api-key 상수. `ESPORTS_RESOLVER_DISABLED=true`로 kill switch. `state=completed` 단독으로 finalCache promote 금지 — stability window(default 10min) + gameWins majority cross-check 모두 통과 후에만. `match.flags`가 비어있지 않으면 forfeit/walkover 보수적 처리 (pending → `cancel_expired_market` 환불). 자세: [docs/bots.md](docs/bots.md#prediction-market-resolvers).
5. **Sui SDK 버전 분리**: Frontend @mysten/sui 1.45.2, bots 1.21.1. 의도적 분리 (봇 안정성 vs frontend 최신 기능). 같이 올리지 말 것.
6. **Keeper gas auto-refill**: `keeper-gas-watchdog` pm2 process가 1h마다 점검, threshold 미만이면 treasury에서 PTB 충전. 2026-04-29 operator gas 고갈 사고 후 도입 (project_keeper_gas_watchdog.md).
7. **Turnstile 영구 제거 (2026-05-16)**: pado 채팅/idea-submission에서 CF Turnstile 완전 제거. 봇 방어는 banned list shadow-ban 단독 (project_chat_turnstile_removed.md).
8. **Chat-server는 unified**: pado-chat-server(3100) 운영 중단됨. nasun-chat-server(3101)가 nasun + pado 공용 (project_unified_chat_server.md). `/api/pado/*` prefix가 pado 전용 라우트.
9. **Bot faucet ↔ baseType invariant**: 각 마켓의 `faucetV2Object`는 그 마켓의 `baseType`을 mint하는 `TreasuryCap`을 들고 있어야 한다. 토큰 패키지를 재배포하면 `_PACKAGE` 상수와 그 토큰 전용 faucet object 둘 다 갱신해야 한다. `lib/preflight.ts::verifyMarketFaucet`이 lp-bot/prefund-bot/balance-watchdog 부팅 시 강제. 2026-05-18 NETH 사고 후 도입 — NETH가 11일간 잘못된 패키지의 faucet을 호출해 trading에 쓸 수 없는 타입을 mint해온 게 ask 고갈의 진짜 원인이었음. 자세한 페어링은 `apps/pado/docs/bots.md`의 "Token / Faucet Invariant" 표 참조.
10. **Prediction v5/legacy dual-package dispatch** (2026-05-20 cutover): prediction_market은 두 패키지가 공존한다. v5 fresh-publish `0x86595464...` (모든 신규 마켓 + admin paths) + legacy v1~v4 `0x9b2361fe...` (만료 전 ~117 in-flight). 코드 분기점:
    - `packages/devnet-config/devnet-ids.json`: `prediction` (v5 canonical) + `prediction_legacy` (frozen v1~v4) 두 블록.
    - `@nasun/devnet-config`: `PREDICTION_*` + `PREDICTION_LEGACY_*` + `PREDICTION_ORIGINAL_IDS` + `packageIdForMarketType()` / `adminCapForMarketType()`.
    - Frontend: `apps/pado/frontend/src/features/prediction/constants.ts`의 `marketPackageRegistry` (fetchMarket이 populate) — builders는 `packageForMarket(marketId)`로 dispatch.
    - Bots: `.env`에 `PREDICTION_PACKAGE_ID`(v5) + `PREDICTION_PACKAGE_ID_LEGACY`(v1originalId,v4latest) + `PREDICTION_ADMIN_CAP`(v5) + `PREDICTION_ADMIN_CAP_LEGACY` 모두 필요. **신규 키 추가 시 `pm2 restart`로 부족 — `pm2 delete + start` 필수** ([feedback_pm2_hard_restart_for_new_env](../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md)).
    - 자세: [docs/CUTOVER_v5_HANDOFF.md](docs/CUTOVER_v5_HANDOFF.md) "Completion Record" 섹션.

## Pending / Partial

- **Lending UI**: contract V7 deployed, pool creation + .env integration + pool UI 미완 (2026-05-18 기준 변경 없음)
- **Perp**: `features/perp/` 디렉토리 존재하나 주요 기능 비활성. unified-margin 우선 (archived 분류 검토)
- **Market Narrator pool hardcoding**: `formatAlert`가 "NBTC" hardcode. NETH/NSOL 추가 시 갱신 필요
- **Env var mismatch**: 일부 `.env.local` 주소가 `devnet-ids.json`과 어긋날 수 있음 (V7 리셋 후 부분 갱신)
- **Staging Chain ID**: staging은 별도 체인, dev는 `272218f1`

## 최근 30일 주요 변경 (요약)

- **Prediction market 확장**: SK Hynix 마켓 (3/5/7/9d horizons, 2026-05-15 추가), prediction PnL → PnL leaderboard 통합, bulk Claim All, optimistic UI, settle all single-PTB refactor
- **Prediction LP 확장**: MVP single-level → **10-level ladder** (1.3 geometric, 100 bps spread)
- **Prediction Arb 봇 추가**: yes_bid + no_bid > 10000 bps 캡처
- **Leaderboard 고도화**: rank cap (MAX_RANK), search, badge thresholds 상향, light theme + hover tooltip
- **Keeper 안정화**: LockConflict/ObjectVersionMismatch handling, RPC retry/backoff, gas watchdog
- **News feed X API 50% 호출 감소**
- **Cloudflare Turnstile 제거** (2026-05-14): chat/pado/nasun 일괄
- **Portfolio settle all + indexer-lag sync**: 시장 정산 후 UI 즉시 반영

---

## Reference Documentation

| Document | Contents |
|----------|----------|
| [docs/roadmap.md](docs/roadmap.md) | Product roadmap (phases) + feature completeness matrix |
| [docs/architecture.md](docs/architecture.md) | Project structure + architecture patterns (state, data fetching, contracts, UI) |
| [docs/frontend.md](docs/frontend.md) | Routes + feature modules + frontend libraries (lib/) |
| [docs/contracts.md](docs/contracts.md) | Network config, trading pairs, deployed contract addresses, Move contract specs |
| [docs/bots.md](docs/bots.md) | LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper + deployment |
| [docs/chat-server.md](docs/chat-server.md) | Pado chat-server archive 이력 + 현 구조(nasun-chat-server 통합) |
| [docs/environment.md](docs/environment.md) | All environment variables (network, DeepBook, tokens, pools, oracle, zkLogin, chat) |
| [docs/PADO_NEXT_STEPS.md](docs/PADO_NEXT_STEPS.md) | Next feature priorities + post-launch improvements |
| [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md) | Competitive analysis and improvement roadmap |
| [docs/SOCIAL_LAYER_DISCUSSION.md](docs/SOCIAL_LAYER_DISCUSSION.md) | Social layer strategy (finance-first social thesis) |
| [docs/LOTTERY.md](docs/LOTTERY.md) | Lottery system design and mechanisms |
| [docs/MANUAL_E2E_CHECKLIST.md](docs/MANUAL_E2E_CHECKLIST.md) | Manual E2E test checklist |
| [docs/SPOT_TRADING_UX_BENCHMARK.md](docs/SPOT_TRADING_UX_BENCHMARK.md) | Spot Trading & Account UX competitive benchmark analysis |
| [bots/README.md](bots/README.md) | Bot documentation (LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper) |
| [contracts-prediction/README.md](contracts-prediction/README.md) | Prediction Market contract overview |
