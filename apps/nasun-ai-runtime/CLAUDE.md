# CLAUDE.md (apps/nasun-ai-runtime)

> Last Updated: 2026-05-18
> 공통 규칙은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## 앱 목적

Nasun AI agent의 **실행 런타임**. 외부 LLM(Claude/OpenAI-호환)을 호출해서 의사결정한 결과를 Baram on-chain capability/AER에 settle. 두 가지 트리거 방식을 병행:

1. **Heartbeat** — `INTERVAL_MINUTES`(기본 30분)마다 자율적으로 cycle 실행
2. **`/wake` 인바운드** — `127.0.0.1:WAKE_PORT` Hono 서버. chat-server가 HMAC + JWT dual auth로 호출하면 즉시 cycle 실행 (user message, manual proposal resume 등)

같은 프로세스가 두 방식을 모두 처리. preset(`trader`/`analyst`/`analysis`/`research`/`content`/`manual-execution`)으로 cycle 동작을 분기.

> **Why 별도 앱으로 분리 (baram/agent-runner의 후신)**: 이전 `apps/baram/agent-runner/`는 frontend·smart-contract·bot이 한 디렉토리에 섞여 있어 배포 사이클·의존성·secret 관리가 얽혀 있었음. baram frontend가 nasun-website의 Uju 섹션으로 흡수되면서 agent runtime만 떼어내 독립 운영. **onchain `baram::*` Move 모듈명은 invariant이므로 패키지 이름과 env var prefix(`BARAM_*`)는 유지**. 사용자 facing 텍스트는 "Nasun AI"로 통일 (feedback_no_baram_branding.md).

> **Why TEE 없이 일반 LLM (v1)**: 첫 퍼블릭 프로토타입은 일반 LLM. TEE/Nitro Enclave는 장기 로드맵. `tee_verified=false`가 v1 정상 상태. narrative에서 "TEE 제공"으로 표현 금지 (project_baram_no_tee_v1.md).

---

## 디렉토리 구조

```
apps/nasun-ai-runtime/
├── src/
│   ├── index.ts                    # Entry — preset dispatch, heartbeat loop, /wake server start
│   ├── config.ts                   # 환경변수 로드/검증
│   ├── wake-server.ts              # Hono /wake 서버 (127.0.0.1:WAKE_PORT)
│   ├── wake-router.ts              # /wake 요청을 trigger_type 별 dispatch
│   ├── host-client.ts              # Host /infer + /execute-capability 호출 (LLM + AER settlement)
│   ├── executor-client.ts          # Lambda /execute, /record (Model A: lambda, Model B: record)
│   ├── llm-client.ts               # OpenAI-호환 Chat Completions (Groq/Together/Ollama 등)
│   ├── nasun-ai-client.ts          # Baram on-chain — Budget check + Request creation
│   ├── jwt-verify.ts               # chat-server JWT + HMAC 검증
│   ├── sig.ts                      # Agent wallet 서명 (sig2)
│   ├── idempotency.ts              # SQLite job_id dedup (~/.nasun-ai-runtime/processed_jobs.db)
│   ├── telegram.ts                 # AER landing 알림 (optional)
│   └── presets/                    # preset별 cycle 로직
│       ├── trader.ts / trader-cycle.ts / trader-envelope.ts
│       ├── analyst.ts              # D-4 user_message 핸들러 (Cognition AER)
│       ├── analysis.ts             # 3-step resumable analysis (checkpoint 기반)
│       ├── research.ts / content.ts
│       ├── manual-execution.ts     # D-5 proposal resume
│       └── strategies.ts           # Strategy resolver
├── scripts/
│   └── e2e-foundation-scenario.ts  # foundation scenario end-to-end
├── ecosystem.nasun-ai-runtime.cjs  # PM2 single-daemon (legacy/standalone 운영)
├── agent-template.config.cjs       # PM2 per-agent template (chat-server orchestrator가 spawn)
├── package.json                    # @nasun/nasun-ai-runtime, private
├── README.md
└── tsconfig.json / vitest.config.ts
```

## 개발/빌드/배포

```bash
# 로컬 실행 (.env 또는 환경변수 사전 export 필요)
pnpm --filter @nasun/nasun-ai-runtime start
pnpm --filter @nasun/nasun-ai-runtime typecheck
pnpm --filter @nasun/nasun-ai-runtime test

# Prod 배포 (monorepo root)
pnpm deploy:nasun-ai-runtime:prod    # → scripts/deploy-nasun-ai-runtime-production.sh
```

## 운영 환경

- **Host**: prod EC2 (__PROD_EC2_HOST__)
- **사용자 dir**: `/home/ec2-user/nasun-ai-runtime/`
- **Idempotency DB**: `~/.nasun-ai-runtime/processed_jobs.db` (SQLite). 마이그레이션 시 보존 필요
- **PM2 운영 모드 2가지**:
  - **Single daemon** (`ecosystem.nasun-ai-runtime.cjs`, id 58, `PRESET=trader`, `WAKE_PORT=4400`): 기본/standalone
  - **Per-agent spawn** (`agent-template.config.cjs`): chat-server `agent-orchestrator`가 사용자별 agent마다 동적으로 spawn. `AGENT_SECRET_PARAM`(SSM Parameter Store)로 keypair 주입, 각 agent마다 별도 `WAKE_PORT`/`CAPABILITY_ID`/`STRATEGY`/`MAX_NOTIONAL_QUOTE_RAW`
- **/wake bind**: `127.0.0.1` 만 (외부 노출 금지). chat-server가 같은 EC2 내에서 호출

## 환경변수

**On-chain identifiers (invariant)**:
- `BARAM_PACKAGE_ID`, `BARAM_REGISTRY_ID`, `BARAM_AER_PACKAGE_ID`
- `BUDGET_ID`, `CAPABILITY_ID`, `ESCROW_ID`
- `EXECUTOR_ADDRESS`, `AGENT_PRIVATE_KEY` 또는 `AGENT_SECRET_PARAM`
- `COIN_NUSDC_TYPE`, `COIN_NBTC_TYPE`

**Infra**:
- `BARAM_API_KEY`, `BARAM_CHAT_SERVER_HMAC_SECRET`
- `CHAT_SERVER_BASE_URL`, `LLM_API_KEY`, `LLM_API_URL`
- `RPC_URL` (기본 `https://rpc.devnet.nasun.io`)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (선택)

**Behavior**:
- `PRESET`: research | content | analysis | trader (기본 research)
- `MODE`: lambda | record (Model A vs B)
- `INTERVAL_MINUTES`, `SINGLE_CYCLE`, `WAKE_PORT`
- `STRATEGY`, `MAX_NOTIONAL_QUOTE_RAW`, `DAILY_MAX_QUOTE_RAW`, `MAX_SLIPPAGE_BPS`

## Operational Invariants (자주 까먹는 것)

1. **Lambda env update는 REPLACE not MERGE**: 일부 키만 보내면 나머지 env 전부 삭제. baram-executor 5/17 drift 사고에서 22개 env 중 21개 silent wipe + `AER_PACKAGE_ID=null` 포함. CDK diff는 template OK로 보이므로 무력. 전체 env JSON 직접 푸시 또는 CDK deploy (feedback_lambda_env_replace_not_merge.md, project_2026_05_17_baram_executor_phase_e_drift.md).
2. **chat-server 새 env 키 도입 시 delete+start**: pm2 startOrRestart로는 부족. ecosystem 파일 parse-time env resolution 특성 (feedback_pm2_daemon_env_resolution.md, feedback_pm2_hard_restart_for_new_env.md).
3. **Agent별 keypair는 SSM**: `AGENT_SECRET_PARAM` 경유. .env 파일에 직접 저장 금지. orchestrator가 spawn 시 execFile로 주입하되 daemon이 parse-time에 다시 resolve하므로 JSON 리터럴로 baked-in 또는 per-spawn config 파일 작성.
4. **stdout은 spawn 검증 끝나기 전까지 /dev/null 금지**: 보안 로그 누락 + 스타트업 디버깅 불가. 검증 후에만 /dev/null로 redirect (feedback_pm2_daemon_env_resolution.md).
5. **AI agent 자금 UX**: Budget(추론료)과 Agent Wallet(매매자본)을 사용자에게 명확히 분리 표시 필요. 현재 UI는 두 funds가 혼동되는 상태 — PR2.A 안정화 후 PR2.B에서 별도 처리 예정 (project_nasun_ai_agent_funds_ux_revamp.md).
6. **fast/slow 모드는 Opus 4.6 이상**: Fast mode for Claude Code uses Claude Opus with faster output. AI agent도 Opus 4.6/4.7 family를 default로 사용.

## 외부 의존

- **chat-server (`apps/nasun-website/chat-server/`)**: `/wake` 호출 (HMAC + JWT), agent-orchestrator가 spawn 관리, AER landing 알림 수신
- **Baram contracts (on-chain)**: BARAM_PACKAGE_ID, BUDGET_ID, CAPABILITY_ID 등
- **baram-executor Lambda**: `/execute`, `/record` (외부 모노레포 또는 별도 deploy)
- **LLM provider**: OpenAI-호환 endpoint (Groq, Together, Ollama 등 모두 가능)

## 참조 문서

- [README.md](README.md) — 컴포넌트 컨트랙트 + integration mapping
- [../../docs/infrastructure.md](../../docs/infrastructure.md) — PM2 운영 규칙, Lambda env update 정책
- [../../docs/packages.md](../../docs/packages.md) — `@nasun/baram-sdk` 사용법
- [../baram/CLAUDE.md](../baram/CLAUDE.md) — archived. AER 코덱, Move 모듈 reference만 참고
