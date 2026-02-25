# Baram Smart Contracts Reference

> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

## baram.move (Escrow)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_request` | User | NUSDC 에스크로 + 요청 생성 |
| `create_request_with_budget` | Agent | **DEPRECATED** -- Budget 연동 요청 생성 (v1, 전액 지출) |
| `create_request_with_budget_v2` | Agent | **ACTIVE** -- Budget 연동 요청 생성 (v2, 카테고리 지원) |
| `cancel_request` | User | 타임아웃 전 취소 + 환불 (Frontend auto-cancel on execution failure) |
| `claim_timeout_refund` | User | 타임아웃 후 환불 요청 |
| `mark_executing` | Executor | 요청 실행 시작 표시 (executor가 작업 claim) |
| `submit_proof` | Executor | 결과 해시 제출 + 지급 (witness 없는 레거시 경로, 유지) |
| `submit_proof_with_receipt` | Executor | **PRIMARY** -- 결과 해시 제출 + SettlementReceipt 반환 (AER 강제 생성) |

## budget.move (Budget Delegation)

> 에이전트에게 제한된 예산을 위임하여 자율적 AI 실행을 가능하게 함.

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_budget` | User | Budget 생성 (에이전트 주소, 모델/Executor 화이트리스트, 만료, 최대 건당 금액) |
| `deposit_to_budget` | User (Owner) | Budget에 NUSDC 입금 |
| `withdraw_from_budget` | User (Owner) | Budget에서 NUSDC 출금 |
| `deactivate_budget` | User (Owner) | Budget 비활성화 + 잔액 반환 |
| `update_constraints` | User (Owner) | 모델/Executor 화이트리스트, 최대 건당 금액, 만료 업데이트 |
| `set_spending_limits` | User (Owner) | 일/주/월 지출 한도 + rate limiting 설정 (Dynamic Field) |
| `set_categories` | User (Owner) | 허용 카테고리 설정 (Dynamic Field) |
| `spend_from_budget` | Agent | Budget에서 NUSDC 차감 (모델/Executor/금액/rate 제약 검증) |
| `spend_from_budget_with_category` | Agent | Budget에서 NUSDC 차감 (v2, 카테고리 포함) |
| `get_balance` / `get_stats` | View | Budget 잔액/통계 조회 |
| `is_model_allowed` / `is_executor_allowed` | View | 화이트리스트 확인 |

## beta_access.move (BetaAccessNFT)

> 베타 테스터에게 NFT를 발급하여 채팅 접근을 게이팅함. 프론트엔드 UX 게이트 (보안 경계 아님).

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `initialize` | UpgradeCap 보유자 | AdminCap + Registry 생성 (업그레이드 후 1회 호출) |
| `mint` | Admin | NFT 민팅 후 recipient에게 전송 |
| `batch_mint` | Admin | 다수 주소에 일괄 민팅 (MAX_BATCH_SIZE=100) |
| `use_access` | NFT 보유자 | 사용 횟수 차감 (original_uses=0이면 무제한) |
| `is_valid` | View | 만료/사용횟수 확인 |

## agent_profile.move (Agent Identity + Kill Switch)

> 온체인 AI 에이전트 프로필. 소유자만 생성/수정 가능. 별도 패키지 (`AGENT_CONFIG`).

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_agent` | User (Owner) | AgentProfile 생성 (agent 주소, name, role, capabilities) |
| `deactivate_agent` | User (Owner) | 에이전트 비활성화 (is_active=false, 즉시 지출 차단) |
| `reactivate_agent` | User (Owner) | 에이전트 재활성화 (is_active=true) |
| `increment_stats` | Internal | 실행 횟수/지출 누적 업데이트 |

## executor.move (Registry + Self-Service)

**Admin 함수:**

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_executor` | Admin | Executor 등록 |
| `update_executor_stats` | Admin | 통계 + reputation 업데이트 (+10 성공, -20 실패) |
| `decay_reputation` | Admin | 30일 비활성 reputation 감소 (고정 -50, 최소 100) |
| `link_stake` / `update_stake_status` | Admin | 스테이킹 연동 |

**Self-service 함수 (Phase F-2):**

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `record_job_completion` | Executor (self) | 작업 완료 기록 + reputation +10 (request_id dedup via ProcessedRequests) |
| `record_job_failure` | Executor (self) | 작업 실패 기록 + reputation -20 (request_id dedup) |
| `update_own_endpoint` | Executor (self) | endpoint_url + supported_models 자율 변경 |
| `decay_reputation_permissionless` | Anyone | 30일 비활성 reputation 감소 (AdminCap 불필요, Clock 기반) |

## executor_staking.move (Staking/Slashing)

| 상수 | 값 |
|------|-----|
| `MIN_STAKE` | 1,000 NASUN |
| `UNBONDING_PERIOD_MS` | 7일 |
| `SLASH_TIMEOUT_PERCENT` | 5% |
| `SLASH_ATTESTATION_PERCENT` | 10% |
| `SLASH_FRAUD_PERCENT` | 100% |

## executor_tier.move (Tier Registry)

| Tier | 표시명 | Stake | Reputation | 공식 |
|------|--------|-------|------------|------|
| 0 | Open | 0 | 0 | - |
| 1 | Bronze | 1,000 | 300 | `min(stake_tier, rep_tier)` |
| 2 | Silver | 5,000 | 500 | `min(stake_tier, rep_tier)` |
| 3 | Gold | 10,000 | 700 | `min(stake_tier, rep_tier)` |

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `refresh_tier_from_state` | Anyone | on-chain state에서 tier 재계산 (F-2, AdminCap 불필요) |

## compliance.move (ECR -- FROZEN)

> 기존 ECR 오브젝트는 보존되지만, 새 레코드는 더 이상 생성되지 않음. AER로 대체됨.

## aer.move (AIExecutionReport -- ACTIVE)

> ECR을 대체하는 AI 실행 보고서. 8카테고리, 31필드. 모든 새 실행은 AER을 생성.

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_report` | ~~Executor~~ | **DEPRECATED** -- `abort E_DEPRECATED (405)` |
| `create_report_with_receipt` | Executor (PTB) | **ACTIVE** -- SettlementReceipt를 소비하여 AER 생성 |

## attestation_registry.move (PCR Baseline)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_baseline` | Admin | PCR baseline 등록 |
| `activate_baseline` | Admin | baseline 활성화 |
| `revoke_baseline` | Admin | baseline 폐기 |
| `verify_pcrs` | View | PCR 검증 |

---

## Deployed Contracts (Devnet V7)

> **Chain ID**: `272218f1` (V7 리셋, 2026-02-04)

### Baram Contract (v6)
| 항목 | 주소 |
|------|------|
| Package ID (v6) | `0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9` |
| Original Package ID | `0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6` |
| BaramRegistry | `0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833` |
| BetaAccessRegistry | `0xaf2fd2a1ccfd1f41afe51071981047860b81f9cfaa775fc12acadf099577e4f7` |
| BetaAccessAdmin | `0x7daa09decafcfa78b712308a13e8c8204eb89de8434df806df51f4cec076d6c2` |

### Executor Registry + Staking + Tier
| 항목 | 주소 |
|------|------|
| Package ID | `0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd` |
| ExecutorRegistry | `0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656` |
| ProcessedRequests | `0x1d88bb96c90d9bde3a2c10fa4e26f3180e948dae908cb09ef4d6a79e905d7e48` |
| TierRegistry | `0xda37bee40cdc5e9a6188ddf021fe78d3328ff6384e84dc36014479c07e4300f1` |

### Attestation Registry
| 항목 | 주소 |
|------|------|
| Package ID | `0x6ab728f371455e7db3530794a1c02426f673ec5d2292835bdf365dd248519b9a` |
| AttestationRegistry | `0x120434fe3c76f084b13e9a294bec0c42e95ac408cdeb7327ea5d46e822c3c290` |

### AER Registry (v3)
| 항목 | 주소 |
|------|------|
| Package ID (v3) | `0x809f22f2262fd4211e51c1d890addfaeadb21e4bbf61748d7714306272427692` |
| AERRegistry | `0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583` |

### Agent Profile Registry
| 항목 | 주소 |
|------|------|
| Package ID | `0x05edb7edec6e69af66e5d2564e6ca7cb46b60469a0897291c51f8d5c949424de` |
| AgentProfileRegistry | `0x1e236dfab7e4c3df21651fa4b5dc846d8d1bed314a2615474dd1b805445b9f11` |

### Compliance Registry (FROZEN)
| 항목 | 주소 |
|------|------|
| Package ID | `0x601d879d176f5f22f1c3f267bb8895c6b18f1020878ac38a5f88f27ffeed55c3` |
| ComplianceRegistry | `0x884af83cb0b9d5dc1f584a29018e812e777fb36ea99b8b0d96a8645188a4bec0` |

### Lambda Backend (Cloud Models -- Groq only)
| 항목 | 값 |
|------|-----|
| API Endpoint | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod` |
| Active Models (Lambda) | llama-3.3-70b-versatile (Groq proxy) |
| Active Models (TEE) | llama-3.2-3b-local (executor-nitro enclave) |
