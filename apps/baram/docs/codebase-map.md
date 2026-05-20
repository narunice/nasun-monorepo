# Baram Codebase Map

> ## ⚠️ STALE (as of 2026-05-19)
>
> Last updated 2026-05-07. **Predates the Baram app archive** (`pnpm-workspace.yaml` excludes `apps/baram`).
> The directory tree below is no longer authoritative:
> - `apps/baram/frontend/` was absorbed into [apps/nasun-website/src/sections/uju/](../../nasun-website/src/sections/uju/)
> - `apps/baram/agent-runner/` was split out into [apps/nasun-ai-runtime/](../../nasun-ai-runtime/)
> - Onchain `baram::*` Move modules under `apps/baram/contracts*/` remain canonical (rename would break chain compatibility)
>
> Current map for active code:
> - [apps/nasun-ai-runtime/CLAUDE.md](../../nasun-ai-runtime/CLAUDE.md) - runtime directory structure (current)
> - [apps/baram/CLAUDE.md](../CLAUDE.md) - archive header + what still lives where
>
> Treat sections below as historical.

## Directory Structure

```
apps/baram/
├── frontend/                    # React 19 + Vite 7 (포트 5177) [moved to nasun-website/sections/uju/]
│   └── src/
│       ├── features/
│       │   ├── request/         # 요청 생성 UI + hooks (useExecutors, useCreateRequest, selectExecutorWeightedRandom)
│       │   │   ├── hooks/       # useExecutors, useCreateRequest, useAER, useAttestation, useRequestWithRetry
│       │   │   ├── services/    # transactionBuilder.ts (TX builders), coinService.ts, aerService.ts
│       │   │   └── components/  # AttestationDisplay.tsx, ExecutionReport.tsx (AER detail UI)
│       │   ├── aer/             # AER data fetching
│       │   │   └── hooks/       # useAERRecords.ts (indexer API first, RPC fallback), useAERResult.ts
│       │   └── agents/          # Agent data fetching
│       │       └── hooks/       # useAgentProfiles.ts, useAgentBudgets.ts
│       ├── pages/               # Dashboard pages
│       │   ├── DashboardOverview.tsx  # 메인 대시보드
│       │   ├── AgentList.tsx          # Agent 목록 + Register Agent
│       │   ├── AgentDetail.tsx        # Agent 상세 (5 tabs) + Deactivate/Reactivate
│       │   ├── BudgetsPage.tsx        # Budget 관리 (통계, 필터, CRUD)
│       │   ├── AERTimeline.tsx        # AER 타임라인
│       │   ├── ChatPage.tsx           # Standalone chat page (/chat route)
│       │   └── AuthCallback.tsx       # zkLogin OAuth callback
│       ├── layouts/             # DashboardLayout.tsx (sidebar + header shell)
│       ├── components/
│       │   ├── input/           # ChatInput, InputFooter, ModelSelector
│       │   ├── badges/          # TierBadge
│       │   ├── modals/          # CreateBudgetModal, BudgetSettingsModal, CreateAgentModal, ResultViewerModal
│       │   ├── sidebar/         # BudgetCard, BudgetDetail, BudgetSection, NewChatButton, SessionItem, SessionList, SidebarSettings
│       │   ├── navigation/      # DashboardSidebar, DashboardHeader
│       │   ├── receipt/         # AER receipt components (Row, Section, CopyableHash, ReceiptFooter, LocalReceiptContent, OnChainReceiptContent)
│       │   ├── chat/            # Chat UI (AssistantMessage, ChatTopBar, MessageList, UserMessage)
│       │   ├── empty/           # LandingScreen, WelcomeScreen, NFTGateScreen, OnboardingChecklist, SuggestionCard
│       │   └── theme/           # ThemeProvider, ThemeToggle
│       ├── hooks/               # useNFTGate, useIdleTimeout, useBudgets, useCreateAgent, useAgentActions, useWalletSession
│       ├── stores/              # budgetStore.ts, chatStore.ts (Zustand)
│       ├── config/              # network.ts (Tier 상수, MODEL_PRICING, AER_CONFIG, TEE_TYPES, BUDGET_CONFIG 등), attestation.ts, client.ts
│       ├── services/            # chatCrypto.ts (AES-256-GCM), chatStorage.ts (IndexedDB), agentKeyStorage.ts, contextBuilder.ts
│       ├── types/               # chat.ts (chat message/session 타입)
│       └── utils/               # crypto.ts (RSA-OAEP), format.ts (NUSDC formatting), budget.ts, tee.ts, suiPagination.ts, executor.ts, encoding.ts
│
├── contracts/                   # baram 패키지 (에스크로 + Budget + BetaAccess)
│   └── sources/
│       ├── baram.move           # 에스크로 + 정산
│       ├── budget.move          # Budget delegation (에이전트 예산 위임)
│       └── beta_access.move     # BetaAccessNFT (베타 테스터 게이팅)
│
├── contracts-executor/          # Executor 패키지
│   └── sources/
│       ├── executor.move        # Registry + reputation + self-service (F-2) + ProcessedRequests
│       ├── executor_staking.move # Staking/Slashing + get_executor view
│       └── executor_tier.move   # TierRegistry (4-level) + refresh_tier_from_state (F-2)
│
├── contracts-attestation/       # Attestation 패키지
│   └── sources/
│       └── attestation_registry.move  # PCR baseline 등록/검증
│
├── contracts-compliance/        # Compliance 패키지 (FROZEN -- 기존 ECR 보존)
│   └── sources/
│       └── compliance.move      # ExecutionComplianceRecord (새 레코드 생성 안 함)
│
├── contracts-aer/               # AER 패키지 (AIExecutionReport -- 8카테고리, 31필드)
│   └── sources/
│       └── aer.move             # AIExecutionReport + AERRegistry + create_report_with_receipt()
│
├── contracts-agent/             # Agent 패키지 (AgentProfile + Registry)
│   └── sources/
│       └── agent_profile.move   # AgentProfile + AgentProfileRegistry + Kill Switch
│
├── executor-nitro/              # TEE Executor (AWS Nitro)
│   ├── src/host/                # Host HTTP 서버 + Attestation 검증 + Settlement (PTB 4-call)
│   ├── src/enclave/             # Enclave (crypto, inference, local-llm, attestation)
│   ├── src/shared/              # protocol.ts, vsock.ts
│   ├── scripts/                 # Spot 인스턴스 관리 + decay-reputation.ts (cron)
│   ├── docker/                  # Nitro EIF Dockerfile
│   └── models/                  # LLaMA 모델 (.gitignore)
│
├── cdk/                         # AWS CDK 인프라
│   └── lambda-src/executor/     # Lambda executor (Groq cloud models)
│
├── api-server/                  # AER 인덱서 API (Hono.js + PostgreSQL, 포트 3201)
│   └── src/
│       ├── index.ts             # 메인 서버 (CORS, rate limiting, graceful shutdown)
│       ├── db.ts                # PostgreSQL 스키마 (aer_records 31필드 인덱싱)
│       ├── cache.ts             # In-memory TTL 캐시 (15초) + cache.test.ts
│       ├── rate-limit.ts        # Rate limit 미들웨어 + rate-limit.test.ts
│       ├── routes/aer.ts        # /api/v1/aer (필터, 페이지네이션) + aer.test.ts
│       └── sync/aer-sync.ts     # RPC 이벤트 동기화 워커 (30초 간격)
│
├── agent-runner/                # 자율 에이전트 실행기 (CLI 데몬)
│   └── src/
│       ├── index.ts             # 메인 루프 + runCycle 오케스트레이션
│       ├── config.ts            # 환경 변수 로딩 + 검증 (+ config.test.ts)
│       ├── baram-client.ts      # 온체인: Budget 체크, create_request_with_budget_v2 (+ baram-client.test.ts)
│       ├── executor-client.ts   # Lambda /execute + /record 클라이언트 (+ executor-client.test.ts)
│       ├── llm-client.ts        # LLM 호출 추상화 (+ llm-client.test.ts)
│       └── presets/             # research (30분), content (24시간), analysis (24시간, 3단계 체크포인팅) + types.ts
│
├── scripts/                     # mint-beta-access.sh (BetaAccessNFT 민팅), demo-agent.ts, demo-config.ts
└── docs/                        # 설계 문서
```

## Key File References

| 파일 | 설명 |
|------|------|
| [baram.move](../contracts/sources/baram.move) | 에스크로 + 정산 |
| [budget.move](../contracts/sources/budget.move) | Budget delegation (에이전트 예산 위임) |
| [beta_access.move](../contracts/sources/beta_access.move) | BetaAccessNFT (베타 게이팅) |
| [executor.move](../contracts-executor/sources/executor.move) | Registry + reputation + decay |
| [executor_staking.move](../contracts-executor/sources/executor_staking.move) | Staking/Slashing |
| [executor_tier.move](../contracts-executor/sources/executor_tier.move) | TierRegistry (Phase E-1) |
| [attestation_registry.move](../contracts-attestation/sources/attestation_registry.move) | PCR baseline |
| [compliance.move](../contracts-compliance/sources/compliance.move) | ECR (FROZEN) |
| [aer.move](../contracts-aer/sources/aer.move) | AIExecutionReport (8카테고리, 31필드) |
| [chatCrypto.ts](../frontend/src/services/chatCrypto.ts) | AES-256-GCM 암호화 (PBKDF2 키 파생) |
| [chatStorage.ts](../frontend/src/services/chatStorage.ts) | IndexedDB 암호화 저장 (per-wallet database) |
| [transactionBuilder.ts](../frontend/src/features/request/services/transactionBuilder.ts) | TX builders + object ID 검증 |
| [useIdleTimeout.ts](../frontend/src/hooks/useIdleTimeout.ts) | 15분 idle timeout hook |
| [network.ts](../frontend/src/config/network.ts) | Tier 상수, MODEL_PRICING, TEE_TYPES |
| [useExecutors.ts](../frontend/src/features/request/hooks/useExecutors.ts) | Executor 목록 + selectExecutorWeightedRandom |
| [server.ts](../executor-nitro/src/host/server.ts) | Host HTTP + Attestation 검증 |
| [sui-client.ts](../executor-nitro/src/host/sui-client.ts) | On-chain settlement + AER 생성 |
| [decay-reputation.ts](../executor-nitro/scripts/decay-reputation.ts) | Permissionless decay cron 스크립트 |
| [protocol.ts](../executor-nitro/src/shared/protocol.ts) | 메시지 프로토콜 (v1.3.0) |
| [agent_profile.move](../contracts-agent/sources/agent_profile.move) | AgentProfile + Registry + Kill Switch |
| [index.ts (api-server)](../api-server/src/index.ts) | AER 인덱서 API 메인 서버 |
| [aer-sync.ts](../api-server/src/sync/aer-sync.ts) | RPC 이벤트 → PostgreSQL 동기화 |
| [index.ts (agent-runner)](../agent-runner/src/index.ts) | 자율 에이전트 메인 루프 |
| [baram-client.ts](../agent-runner/src/baram-client.ts) | Agent → Budget → 온체인 요청 |
| [SPOT_INSTANCE_GUIDE.md](SPOT_INSTANCE_GUIDE.md) | Spot 인스턴스 운영 가이드 |
| [AER_DESIGN.md](AER_DESIGN.md) | AIExecutionReport 구현 레퍼런스 |
