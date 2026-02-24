# Baram Codebase Map

## Directory Structure

```
apps/baram/
├── frontend/                    # React 19 + Vite 7 (포트 5177)
│   └── src/
│       ├── features/
│       │   ├── request/         # 요청 생성 UI + hooks (useExecutors, useCreateRequest, selectExecutorWeightedRandom)
│       │   │   ├── hooks/       # useExecutors, useCreateRequest, useAER, useAttestation, useRequestWithRetry
│       │   │   ├── services/    # transactionBuilder.ts (TX builders), coinService.ts
│       │   │   └── components/  # ECRReceipt.tsx (AER detail modal)
│       │   ├── aer/             # AER data fetching
│       │   │   └── hooks/useAERRecords.ts  # Dual-mode: indexer API first, RPC fallback
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
│       ├── components/
│       │   ├── input/           # ChatInput, InputFooter
│       │   ├── badges/          # TierBadge, DormantBadge
│       │   ├── modals/          # CreateBudgetModal, BudgetSettingsModal, CreateAgentModal
│       │   ├── sidebar/         # BudgetDetail, SidebarSettings
│       │   ├── navigation/      # DashboardSidebar, DashboardHeader
│       │   ├── receipt/         # AER receipt components (Row, Section, CopyableHash, ReceiptFooter, LocalReceiptContent, OnChainReceiptContent)
│       │   ├── chat/            # Chat UI (AssistantMessage, ChatTopBar, MessageList, UserMessage)
│       │   ├── empty/           # LandingScreen, WelcomeScreen, NFTGateScreen
│       │   └── theme/           # ThemeProvider, ThemeToggle
│       ├── hooks/               # useNFTGate, useIdleTimeout, useBudgets, useCreateAgent, useAgentActions, useWalletSession
│       ├── stores/              # budgetStore.ts, chatStore.ts (Zustand)
│       ├── config/              # network.ts (Tier 상수, MODEL_PRICING, AER_CONFIG), attestation.ts, client.ts
│       ├── services/            # chatCrypto.ts (AES-256-GCM), chatStorage.ts (IndexedDB)
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
├── scripts/                     # mint-beta-access.sh (BetaAccessNFT 민팅)
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
| [SPOT_INSTANCE_GUIDE.md](SPOT_INSTANCE_GUIDE.md) | Spot 인스턴스 운영 가이드 |
| [AER_DESIGN.md](AER_DESIGN.md) | AIExecutionReport 구현 레퍼런스 |
