# Baram-AER Architecture Specification
# AI Agent Admin Dashboard + AER

> Version: 1.1
> Date: 2026-02-10
> Author: protocol-architect (based on research by product-researcher, infra-researcher, security-researcher)
> Status: **Implemented — Deployed on Devnet V7**
> Deployment: contracts v0.0.5, contracts-aer v0.0.3, contracts-agent v1.0.0

---

## Table of Contents

1. [Vision & Positioning](#1-vision--positioning)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [On-Chain Architecture: Move Contract Specs](#3-on-chain-architecture-move-contract-specs)
4. [Off-Chain Architecture: Dashboard Frontend](#4-off-chain-architecture-dashboard-frontend)
5. [Security Architecture](#5-security-architecture)
6. [MVP Scope Definition](#6-mvp-scope-definition)
7. [Implementation Phases](#7-implementation-phases)
8. [Open Questions & Future Work](#8-open-questions--future-work)

---

## 1. Vision & Positioning

### 1.1 One-Line Pitch

> "Your agents work for you. Baram proves it."

### 1.2 Problem

AI 에이전트가 자율적으로 금융 활동을 하는 시대가 오고 있다. 그러나:
- 에이전트에게 돈을 맡기면, 그 돈이 어떻게 쓰였는지 **증명할 수 없다**
- 에이전트가 잘못된 행동을 했을 때, 소유자가 **스스로를 방어할 수 없다**
- 에이전트의 재무 활동에 대한 **투명한 감사 기록이 없다**

### 1.3 Solution

Baram-AER은 AI 에이전트의 재무 활동을 위한 **관리 대시보드 + 온체인 블랙박스**를 제공한다:

| 레이어 | 역할 | 비유 |
|--------|------|------|
| **Admin Dashboard** | 에이전트에게 지갑을 부여하고, 예산을 설정하고, 권한을 정의 | 차량 소유자가 운전자를 고용하고 연료 카드에 한도를 설정 |
| **AER** | 모든 재무 활동의 불변 온체인 기록 | 블랙박스가 모든 운행을 녹화 |
| **Budget System** | 지출 한도, 카테고리 제한, 승인 흐름 | 연료 카드의 일일 한도, 사용처 제한 |

### 1.4 Market Position: Blue Ocean

리서치 결론: "에이전트 지갑 + 예산 관리 + 감사 기록"을 **단일 대시보드**로 제공하는 플랫폼은 시장에 **존재하지 않는다**.

```
에이전트 "생성" ◄────────────────────────► 에이전트 "관리"
       │                                        │
 Virtuals (토큰화)                               │
 ElizaOS (프레임워크)                             │
 Fetch.ai (마켓플레이스)                          │
 AgentKit (결제 인프라)              Baram-AER ◄──┤  유일한 포지션
 Turnkey (TEE 지갑)                              │
 ERC-8004 (신원)                                 │
```

### 1.5 Key Decisions (from Research)

| 질문 | 결정 | 근거 |
|------|------|------|
| Agent Origin | **하이브리드** | Phase 1: 2-3개 템플릿 제공 + Phase 2: 외부 에이전트 등록 API |
| UI Structure | **대시보드 메인 + 채팅 공존** | 채팅은 에이전트 상세 페이지의 탭으로 이동 |
| Agent Wallet | **단순 Sui 주소 + Budget 위임** | NSA는 오버엔지니어링; Phase 2에서 선택적 vault로 |
| Budget Extension | **SpendingLimits + 카테고리** | 시간 기반 한도가 최우선 (SEC-B1 Critical) |
| AER Enhancement | **기존 JSON 필드 확장** | 컨트랙트 업그레이드 없이 AER 역할 보강 |
| Payment Rails | **Phase 1: baram.move 에스크로** | 이미 작동 중이고 AER 통합됨. x402는 Phase 2 |
| AER Enforcement | **Witness 패턴 도입** | submit_proof 없이 AER 생성 불가 문제 해결 |

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BARAM-AER DASHBOARD                         │
│                     (React + Vite Frontend)                        │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │Dashboard │  │My Agents │  │ Execution │  │ Agent Detail      │  │
│  │Overview  │  │  List    │  │ Reports   │  │ (Chat Tab inside) │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    @nasun/wallet Integration                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────────────────┘
                  │ RPC / Events
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      NASUN NETWORK (On-Chain)                      │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   baram package      │  │   baram_aer package                 │ │
│  │   (contracts/)       │  │   (contracts-aer/)                  │ │
│  │                      │  │                                      │ │
│  │  ┌───────────────┐  │  │  ┌─────────────────────────────┐    │ │
│  │  │ baram.move     │  │  │  │ aer.move                     │    │ │
│  │  │ (Escrow)       │◄─┼──┼──│ (AIExecutionReport)          │    │ │
│  │  └───────────────┘  │  │  │  + SettlementReceipt witness  │    │ │
│  │                      │  │  └─────────────────────────────┘    │ │
│  │  ┌───────────────┐  │  └──────────────────────────────────────┘ │
│  │  │ budget.move    │  │                                           │
│  │  │ (Budget V2)    │  │  ┌──────────────────────────────────────┐ │
│  │  │ +SpendingLimits│  │  │   baram_agent package (NEW)         │ │
│  │  │ +Categories    │  │  │   (contracts-agent/)                │ │
│  │  └───────────────┘  │  │                                      │ │
│  │                      │  │  ┌─────────────────────────────┐    │ │
│  │  ┌───────────────┐  │  │  │ agent_profile.move (NEW)     │    │ │
│  │  │ beta_access    │  │  │  │ (AgentProfile + Registry)    │    │ │
│  │  └───────────────┘  │  │  └─────────────────────────────┘    │ │
│  └─────────────────────┘  └──────────────────────────────────────┘ │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ baram_executor       │  │   baram_compliance                  │ │
│  │ (contracts-executor/) │  │   (contracts-compliance/)           │ │
│  │ executor.move         │  │   compliance.move                  │ │
│  │ executor_staking.move │  └──────────────────────────────────────┘ │
│  └─────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Package Dependency Graph

```
baram_agent (NEW)
    └── (standalone, no Move dependencies)

baram (existing, to be upgraded)
    ├── baram::baram (escrow + settlement)
    │   └── depends on: baram::budget
    └── baram::budget (delegation → BudgetV2)
        └── depends on: devnet_tokens::nusdc

baram_aer (existing, to be upgraded)
    └── baram_aer::aer (AIExecutionReport)
        └── NEW: consumes SettlementReceipt from baram::baram

baram_executor (existing, no changes in MVP)
    ├── executor.move
    └── executor_staking.move

baram_compliance (existing, no changes in MVP)
    └── compliance.move

baram_attestation (existing, no changes in MVP)
    └── attestation_registry.move
```

### 2.3 Data Flow: Agent Execution Lifecycle

```
[1] Owner creates AgentProfile        → AgentProfileRegistry (on-chain)
[2] Owner creates BudgetV2             → Budget shared object (on-chain)
     └── links to AgentProfile
[3] Agent calls create_request_with_budget
     └── Budget validates: agent auth, spending limits, categories
     └── Creates ComputeRequest with escrow
[4] Executor processes request
     └── submit_proof_with_aer()       ← NEW: atomic settlement + AER
     └── Returns SettlementReceipt     ← NEW: witness for AER
[5] AER created atomically             → AIExecutionReport NFT (to owner)
     └── Budget snapshot: before/after
     └── Agent profile linkage
[6] Dashboard displays:
     └── Agent status + wallet balance
     └── AER timeline (execution history)
     └── Budget consumption graphs
```

### 2.4 Pado DEX Integration (Demo Agent Trading)

Baram-AER 프로토타입의 핵심 데모 시나리오는 "DeFi Trader + Budget Guardian"이다.
에이전트가 AI 분석 후 Pado DEX에서 자율 거래하고, 예산 한도 초과 시 온체인에서 거부되는 것을 시연한다.

**왜 Pado DEX인가:**
- Nasun 모노레포에 이미 존재하는 완성도 높은 DEX (DeepBook V3 CLOB)
- NBTC/NUSDC 마켓에 LP봇이 Binance 실시간 BTC 가격에 연동된 주문을 배치 중
- "에이전트가 실제 가격에 실제 자산을 거래하는" 경험 제공 → x402 없이 "가게" 문제 해결

**데모 에이전트 데이터 플로우:**

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Demo Agent  │────►│  Baram Escrow    │────►│  TEE Executor     │
│  Script      │     │  (AI Inference)  │     │  (Nitro)          │
│              │◄────│  + Budget Check  │◄────│  AI Analysis      │
│              │     │  + AER Creation  │     │                   │
└──────┬───────┘     └──────────────────┘     └───────────────────┘
       │
       │ AI says "BUY 0.001 BTC"
       ▼
┌──────────────┐     ┌──────────────────┐
│  Order       │────►│  DeepBook V3     │
│  Manager     │     │  NBTC/NUSDC Pool │
│  (LP Bot Lib)│◄────│  (CLOB)          │
└──────────────┘     └──────┬───────────┘
                            │
                     ┌──────▼───────────┐
                     │  LP Bots         │
                     │  (Real BTC Price) │
                     │  via Binance API  │
                     └──────────────────┘
```

**LP봇 코드 재활용:**

| 모듈 | 원본 | 재활용 방식 |
|------|------|------------|
| Order Manager | `apps/pado/bots/lib/order-manager.ts` | DeepBook V3 주문 생성/취소 함수 직접 import |
| Price Source | `apps/pado/bots/lib/price-source.ts` | Binance 실시간 가격 조회 직접 import |
| Orderbook | `apps/pado/bots/lib/orderbook.ts` | Level 2 오더북 조회 직접 import |
| Strategy | `apps/pado/bots/lib/strategy.ts` | Grid 주문 계산 참조 (에이전트는 AI 기반 결정) |

**DeepBook V3 핵심 참조:**

```
Package: 0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134
NBTC/NUSDC Pool: 0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0
```

---

## 3. On-Chain Architecture: Move Contract Specs

### 3.1 NEW: `agent_profile.move` (contracts-agent/)

경량 에이전트 프로필. 소유자만 생성/수정 가능.

```move
module baram_agent::agent_profile {
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use std::string::String;

    // ========== Error Codes ==========
    const E_NOT_OWNER: u64 = 500;
    const E_AGENT_EXISTS: u64 = 501;
    const E_AGENT_NOT_FOUND: u64 = 502;
    const E_TOO_MANY_CAPABILITIES: u64 = 503;
    const E_NAME_TOO_LONG: u64 = 504;

    // ========== Constants ==========
    const MAX_CAPABILITIES: u64 = 10;
    const MAX_NAME_LENGTH: u64 = 64;

    // ========== Structs ==========

    /// On-chain identity for an AI agent
    /// Owned object — only the owner can modify
    public struct AgentProfile has key, store {
        id: UID,
        // Identity
        owner: address,                  // Human owner
        agent_address: address,          // Agent's Sui address (keypair)
        name: String,                    // Display name (e.g., "DeFi Trader")
        role: String,                    // Role type (e.g., "trader", "researcher")
        capabilities: vector<String>,    // Permitted actions

        // State
        is_active: bool,                 // Emergency kill switch
        created_at: u64,
        last_active_at: u64,

        // Stats (updated by agent via Budget spend events)
        total_executions: u64,
        total_spent: u64,               // Cumulative NUSDC spent
    }

    /// Shared registry mapping agent addresses to profile IDs
    public struct AgentProfileRegistry has key {
        id: UID,
        profiles: Table<address, ID>,   // agent_address -> AgentProfile ID
        total_agents: u64,
        active_agents: u64,
    }

    // ========== Events ==========

    public struct AgentCreated has copy, drop {
        profile_id: address,
        owner: address,
        agent_address: address,
        name: String,
        role: String,
    }

    public struct AgentDeactivated has copy, drop {
        agent_address: address,
        owner: address,
    }

    public struct AgentReactivated has copy, drop {
        agent_address: address,
        owner: address,
    }

    // ========== Core Functions ==========

    /// Create a new agent profile (owner only)
    public entry fun create_agent(
        registry: &mut AgentProfileRegistry,
        agent_address: address,
        name: String,
        role: String,
        capabilities: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // ... validations ...
        // Creates AgentProfile, transfers to owner
        // Registers in AgentProfileRegistry
    }

    /// Emergency deactivate agent (owner only)
    /// Sets is_active = false. Budget checks should respect this.
    public entry fun deactivate_agent(
        profile: &mut AgentProfile,
        ctx: &TxContext,
    ) {
        // assert!(profile.owner == sender, E_NOT_OWNER)
        // profile.is_active = false
    }

    /// Reactivate agent (owner only)
    public entry fun reactivate_agent(
        profile: &mut AgentProfile,
        ctx: &TxContext,
    ) {
        // assert!(profile.owner == sender, E_NOT_OWNER)
        // profile.is_active = true
    }

    /// Update agent stats (called internally or by budget module)
    /// In MVP, this is called by the agent's PTB after budget spend
    public fun increment_stats(
        profile: &mut AgentProfile,
        spent_amount: u64,
        clock: &Clock,
    ) {
        profile.total_executions = profile.total_executions + 1;
        profile.total_spent = profile.total_spent + spent_amount;
        profile.last_active_at = clock.timestamp_ms();
    }

    // ========== View Functions ==========

    public fun is_active(profile: &AgentProfile): bool { profile.is_active }
    public fun get_owner(profile: &AgentProfile): address { profile.owner }
    public fun get_agent_address(profile: &AgentProfile): address { profile.agent_address }
    // ... etc
}
```

**설계 원칙:**
- **Owned object**: AgentProfile은 owner에게 전송되는 소유 객체. 에이전트는 이를 수정할 수 없음
- **경량**: NSA의 Multi-signer 복잡성 없이 순수 프로필 정보만 저장
- **Kill switch**: `is_active` 필드로 소유자가 즉시 에이전트를 비활성화
- **별도 패키지**: budget.move와의 순환 의존성을 방지하기 위해 독립 패키지로 배포

### 3.2 UPGRADE: `budget.move` → BudgetV2 (SpendingLimits)

현재 budget.move에 **시간 기반 지출 한도**를 추가한다. `max_fields_in_struct=32` 제약으로 인해 Dynamic Field 활용.

```move
/// BudgetV2 — Extended with time-based spending limits
/// Uses Dynamic Fields to bypass max_fields_in_struct=32
module baram::budget {
    use sui::dynamic_field;
    // ... existing imports ...

    // NEW: Dynamic Field keys
    public struct SpendingLimitsKey has copy, drop, store {}
    public struct CategoryLimitsKey has copy, drop, store {}

    // NEW: Spending limits struct (stored as Dynamic Field)
    public struct SpendingLimits has store {
        // Limits (0 = unlimited)
        daily_limit: u64,
        weekly_limit: u64,
        monthly_limit: u64,

        // Accumulators
        spent_daily: u64,
        spent_weekly: u64,
        spent_monthly: u64,

        // Reset timestamps
        last_daily_reset: u64,
        last_weekly_reset: u64,
        last_monthly_reset: u64,

        // Rate limiting
        min_interval_ms: u64,          // Minimum time between spends (0 = no limit)
        last_spend_at: u64,            // Timestamp of last spend
    }

    // NEW: Category limits (stored as Dynamic Field)
    public struct CategoryLimits has store {
        allowed_categories: vector<String>,  // Empty = all allowed
    }

    // === EXISTING Budget struct (no changes to core struct fields) ===
    // Dynamic Fields are added after creation

    // ========== NEW: Setup Functions ==========

    /// Add spending limits to an existing Budget (owner only)
    public entry fun set_spending_limits(
        budget: &mut Budget,
        daily_limit: u64,
        weekly_limit: u64,
        monthly_limit: u64,
        min_interval_ms: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        // assert owner
        let now = clock.timestamp_ms();
        let limits = SpendingLimits {
            daily_limit,
            weekly_limit,
            monthly_limit,
            spent_daily: 0,
            spent_weekly: 0,
            spent_monthly: 0,
            last_daily_reset: now,
            last_weekly_reset: now,
            last_monthly_reset: now,
            min_interval_ms,
            last_spend_at: 0,
        };
        // Add or update dynamic field
        if (dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            *dynamic_field::borrow_mut(&mut budget.id, SpendingLimitsKey {}) = limits;
        } else {
            dynamic_field::add(&mut budget.id, SpendingLimitsKey {}, limits);
        };
    }

    /// Set allowed categories (owner only)
    public entry fun set_categories(
        budget: &mut Budget,
        allowed_categories: vector<String>,
        ctx: &TxContext,
    ) {
        // assert owner
        let cats = CategoryLimits { allowed_categories };
        if (dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            *dynamic_field::borrow_mut(&mut budget.id, CategoryLimitsKey {}) = cats;
        } else {
            dynamic_field::add(&mut budget.id, CategoryLimitsKey {}, cats);
        };
    }

    // ========== MODIFIED: spend_from_budget ==========

    /// Spend from budget — NOW with time-based limits and rate limiting
    public fun spend_from_budget(
        budget: &mut Budget,
        amount: u64,
        model: String,
        executor: address,
        request_id: u64,
        category: String,            // NEW parameter
        clock: &Clock,
        ctx: &TxContext,
    ): Balance<NUSDC> {
        // ... existing validations (agent, active, expired, balance, max_per_request) ...

        let now = clock.timestamp_ms();

        // NEW: Check category allowlist
        if (dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            let cats: &CategoryLimits = dynamic_field::borrow(&budget.id, CategoryLimitsKey {});
            if (!vector::is_empty(&cats.allowed_categories)) {
                assert!(vector::contains(&cats.allowed_categories, &category), E_CATEGORY_NOT_ALLOWED);
            };
        };

        // NEW: Check and update spending limits
        if (dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            let limits: &mut SpendingLimits = dynamic_field::borrow_mut(
                &mut budget.id,
                SpendingLimitsKey {},
            );

            // Rate limiting check
            if (limits.min_interval_ms > 0) {
                assert!(now >= limits.last_spend_at + limits.min_interval_ms, E_RATE_LIMITED);
            };

            // Reset periods if needed
            maybe_reset_limits(limits, now);

            // Check daily/weekly/monthly limits
            if (limits.daily_limit > 0) {
                assert!(limits.spent_daily + amount <= limits.daily_limit, E_DAILY_LIMIT_EXCEEDED);
            };
            if (limits.weekly_limit > 0) {
                assert!(limits.spent_weekly + amount <= limits.weekly_limit, E_WEEKLY_LIMIT_EXCEEDED);
            };
            if (limits.monthly_limit > 0) {
                assert!(limits.spent_monthly + amount <= limits.monthly_limit, E_MONTHLY_LIMIT_EXCEEDED);
            };

            // Update accumulators
            limits.spent_daily = limits.spent_daily + amount;
            limits.spent_weekly = limits.spent_weekly + amount;
            limits.spent_monthly = limits.spent_monthly + amount;
            limits.last_spend_at = now;
        };

        // ... existing deduct + event logic ...
    }

    /// Reset period accumulators based on elapsed time
    fun maybe_reset_limits(limits: &mut SpendingLimits, now: u64) {
        let day_ms: u64 = 86_400_000;
        let week_ms: u64 = 604_800_000;
        let month_ms: u64 = 2_592_000_000; // 30 days

        if (now >= limits.last_daily_reset + day_ms) {
            limits.spent_daily = 0;
            limits.last_daily_reset = now - (now % day_ms);
        };
        if (now >= limits.last_weekly_reset + week_ms) {
            limits.spent_weekly = 0;
            limits.last_weekly_reset = now - (now % week_ms);
        };
        if (now >= limits.last_monthly_reset + month_ms) {
            limits.spent_monthly = 0;
            limits.last_monthly_reset = now - (now % month_ms);
        };
    }
}
```

**핵심 변경사항:**
1. `SpendingLimits` Dynamic Field로 시간 기반 한도 추가
2. `CategoryLimits` Dynamic Field로 지출 카테고리 제한
3. `min_interval_ms`로 rate limiting (SEC-B1 Critical 해결)
4. `spend_from_budget`에 `category` 파라미터 추가
5. 기존 Budget struct에는 필드 추가 없음 (max_fields_in_struct=32 제약 회피)

**새 에러 코드:**
```move
const E_CATEGORY_NOT_ALLOWED: u64 = 111;
const E_DAILY_LIMIT_EXCEEDED: u64 = 112;
const E_WEEKLY_LIMIT_EXCEEDED: u64 = 113;
const E_MONTHLY_LIMIT_EXCEEDED: u64 = 114;
const E_RATE_LIMITED: u64 = 115;
```

### 3.3 UPGRADE: `baram.move` — Atomic Settlement + AER Witness

현재 `submit_proof`와 `create_report`가 별도 패키지에 있어 AER 없이 정산이 가능한 문제 (SEC-PTB1)를 해결한다.

**접근법: Settlement Receipt Witness 패턴**

baram.move가 정산 시 `SettlementReceipt` hot-potato 객체를 반환하고, 이 Receipt는 AER 생성 시에만 소비(drop)될 수 있다. Receipt가 소비되지 않으면 트랜잭션이 실패한다.

```move
module baram::baram {
    // ... existing code ...

    // NEW: Hot-potato receipt — MUST be consumed by aer::create_report
    // No `drop` ability → transaction aborts if not consumed
    public struct SettlementReceipt {
        request_id: u64,
        requester: address,
        executor: address,
        payment_amount: u64,
        model: String,
        prompt_hash: vector<u8>,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        settled_at: u64,
    }

    /// Submit proof and get a SettlementReceipt (must be consumed by AER)
    /// Replaces the existing submit_proof entry function
    public fun submit_proof_with_receipt(
        registry: &mut BaramRegistry,
        request_id: u64,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SettlementReceipt {
        // ... same validations as existing submit_proof ...
        // ... same payment transfer logic ...

        let now = clock.timestamp_ms();

        // Return receipt that MUST be consumed
        SettlementReceipt {
            request_id,
            requester: request.requester,
            executor: tx_context::sender(ctx),
            payment_amount: payout,
            model: request.model,
            prompt_hash: request.prompt_hash,
            result_hash,
            execution_time_ms,
            settled_at: now,
        }
    }

    // Receipt accessor functions for AER module
    public fun receipt_request_id(r: &SettlementReceipt): u64 { r.request_id }
    public fun receipt_requester(r: &SettlementReceipt): address { r.requester }
    public fun receipt_executor(r: &SettlementReceipt): address { r.executor }
    public fun receipt_payment_amount(r: &SettlementReceipt): u64 { r.payment_amount }
    public fun receipt_model(r: &SettlementReceipt): String { r.model }
    public fun receipt_prompt_hash(r: &SettlementReceipt): vector<u8> { r.prompt_hash }
    public fun receipt_result_hash(r: &SettlementReceipt): vector<u8> { r.result_hash }
    public fun receipt_execution_time_ms(r: &SettlementReceipt): u64 { r.execution_time_ms }
    public fun receipt_settled_at(r: &SettlementReceipt): u64 { r.settled_at }

    // Consume receipt (called by AER module)
    public fun consume_receipt(receipt: SettlementReceipt): (
        u64, address, address, u64, String, vector<u8>, vector<u8>, u64, u64
    ) {
        let SettlementReceipt {
            request_id, requester, executor, payment_amount,
            model, prompt_hash, result_hash, execution_time_ms, settled_at,
        } = receipt;
        (request_id, requester, executor, payment_amount, model,
         prompt_hash, result_hash, execution_time_ms, settled_at)
    }

    // KEEP existing submit_proof for backwards compatibility during transition
    // Mark as deprecated via comment
}
```

**aer.move 측 변경: Receipt 소비하는 create_report_with_receipt**

```move
module baram_aer::aer {
    // ... existing code ...

    /// Create AER by consuming a SettlementReceipt (atomic enforcement)
    /// This ensures AER is always created when settlement occurs
    public fun create_report_with_receipt(
        registry: &mut AERRegistry,
        receipt: baram::baram::SettlementReceipt,
        // Additional fields not in receipt
        authorizer: address,
        delegation_path: vector<address>,
        executor_principal: Option<address>,
        // ... remaining AER-specific fields ...
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Consume receipt (extracts settlement data)
        let (request_id, requester, executor, payment_amount,
             model, prompt_hash, result_hash, execution_time_ms, settled_at)
            = baram::baram::consume_receipt(receipt);

        // Validate executor == tx sender (SEC fix: prevent executor field spoofing)
        assert!(executor == tx_context::sender(ctx), E_EXECUTOR_MISMATCH);

        // Create AER with receipt data + additional fields
        // ... (same as existing create_report but with verified data from receipt)
    }
}
```

**의존성 고려사항:**

이 패턴은 baram_aer 패키지가 baram 패키지에 의존하게 만든다:
```toml
# contracts-aer/Move.toml
[dependencies]
baram = { local = "../contracts" }
```

이는 현재 "Standalone — no cross-package dependencies" 원칙을 깨지만, AER 생성 강제(AER Always-On)라는 보안 요구사항이 더 중요하다.

> **[IMPLEMENTED — Security Upgrade v0.0.3]**
>
> - `create_report` 함수는 `abort E_DEPRECATED (405)`로 차단됨. 시그니처는 Sui compatible 업그레이드 정책을 위해 유지하되, 호출 시 항상 abort.
> - `create_report_with_receipt`에 `assert!(initiator == requester, E_INVALID_INITIATOR (406))` 검증 추가. executor가 임의 주소로 AER을 전송하는 것을 방지.
> - 안전한 경로인 `create_report_with_receipt`만 사용 가능.

### 3.4 AER JSON 필드 확장 (컨트랙트 변경 없음)

기존 `constraints`, `fee_detail`, `model_metadata` JSON 필드에 에이전트 활동 정보를 추가한다. 프론트엔드/executor 레벨에서 구현.

**constraints 필드 확장:**
```json
{
  "timeout_ms": 300000,
  "max_tokens": 4096,
  "temperature": 0.7,
  "agent_profile_id": "0x...",
  "decision_context": "Portfolio rebalancing triggered by BTC price drop >5%",
  "budget_id": "0x..."
}
```

**fee_detail 필드 확장:**
```json
{
  "model_creator": "0x...",
  "royalty": 1000,
  "protocol_fee": 500,
  "budget_before": 50000000,
  "budget_after": 40000000,
  "budget_daily_remaining": 30000000
}
```

**model_metadata 필드 확장:**
```json
{
  "version": "1.0",
  "hash": "abc...",
  "quantization": "Q4_K_M",
  "anomaly_flag": false,
  "anomaly_reason": null,
  "rate_limit_info": {
    "daily_spent": 20000000,
    "daily_limit": 50000000
  }
}
```

### 3.5 Contract Change Summary

| 패키지 | 변경 유형 | 설명 | 우선순위 |
|---------|-----------|------|----------|
| baram_agent (NEW) | 신규 생성 | AgentProfile + AgentProfileRegistry | P0 |
| baram::budget | 업그레이드 | SpendingLimits DF + CategoryLimits DF + rate limiting | P0 |
| baram::baram | 업그레이드 | SettlementReceipt witness + submit_proof_with_receipt | P0 |
| baram_aer::aer | 업그레이드 | create_report_with_receipt + executor 검증 | P0 |
| baram_executor | 변경 없음 | MVP에서 변경 불필요 | - |
| baram_compliance | 변경 없음 | AER이 compliance 역할을 흡수 | - |
| baram_attestation | 변경 없음 | 기존 유지 | - |

---

## 4. Off-Chain Architecture: Dashboard Frontend

### 4.1 현재 구조 → 목표 구조

**현재**: ChatGPT-style 단일 페이지 (ChatLayout + ChatInput + MessageList)
**목표**: Admin Dashboard (사이드바 네비게이션 + 다중 페이지)

```
현재 App.tsx
    └── ChatLayout
        ├── Sidebar (session list)
        ├── MessageList
        └── ChatInput

→ 목표 App.tsx
    └── DashboardLayout
        ├── Sidebar (navigation)
        │   ├── Dashboard (overview)
        │   ├── My Agents (list + CRUD)
        │   ├── Execution Reports
        │   └── Settings
        └── MainContent
            ├── / → DashboardOverview
            ├── /agents → AgentList
            ├── /agents/:id → AgentDetail
            │   ├── Tab: Overview
            │   ├── Tab: Wallet
            │   ├── Tab: Budget
            │   ├── Tab: Activity
            │   └── Tab: Chat (기존 ChatLayout 이동)
            ├── /aer → AERTimeline
            ├── /aer/:id → AERDetail
            └── /settings → Settings
```

### 4.2 핵심 화면 스펙

#### Screen 1: Dashboard Overview (`/`)

```
┌──────────────────────────────────────────────────────────────┐
│                      Dashboard Overview                       │
├──────────┬──────────┬──────────┬─────────────────────────────┤
│ Agents   │ Active   │ Total    │ Total AER                   │
│ 3        │ 2        │ Budget   │ Records                     │
│          │          │ 150 NUSDC│ 47                          │
├──────────┴──────────┴──────────┴─────────────────────────────┤
│                                                               │
│  Agent Status Cards                                           │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ DeFi Trader      │ │ Research Bot     │ │ Monitor      │ │
│  │ ● Active         │ │ ● Active         │ │ ○ Paused     │ │
│  │ Balance: 45 NUSDC│ │ Balance: 30 NUSDC│ │ Balance: 0   │ │
│  │ Today: 12 txns   │ │ Today: 5 txns    │ │ Today: 0     │ │
│  └──────────────────┘ └──────────────────┘ └──────────────┘ │
│                                                               │
│  Recent Execution Reports (last 24h)                               │
│  ┌───┬────────────────┬───────┬──────────┬─────────────────┐│
│  │ # │ Agent          │ Amount│ Model    │ Time            ││
│  ├───┼────────────────┼───────┼──────────┼─────────────────┤│
│  │47 │ DeFi Trader    │ 2.5   │ gpt-4o   │ 2 min ago      ││
│  │46 │ Research Bot   │ 1.0   │ llama-3  │ 15 min ago     ││
│  └───┴────────────────┴───────┴──────────┴─────────────────┘│
│                                                               │
│  Alerts                                                       │
│  ⚠ DeFi Trader: 80% of daily budget consumed                │
│  ✓ All agents operating within normal parameters             │
└──────────────────────────────────────────────────────────────┘
```

#### Screen 2: Agent Detail (`/agents/:id`)

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back    DeFi Trader                           [Deactivate]│
│            Role: trader │ Status: ● Active                    │
├──────────────────────────────────────────────────────────────┤
│  [Overview] [Wallet] [Budget] [Activity] [Chat]         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Tab: Budget                                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Daily Limit:    ████████████░░░░  80/100 NUSDC          │ │
│  │ Weekly Limit:   ██████░░░░░░░░░░  200/500 NUSDC         │ │
│  │ Monthly Limit:  ██░░░░░░░░░░░░░░  500/2000 NUSDC        │ │
│  │                                                          │ │
│  │ Per-Request Max: 10 NUSDC                                │ │
│  │ Min Interval: 60 seconds                                 │ │
│  │ Categories: [trading] [data_purchase]                    │ │
│  │ Allowed Models: [gpt-4o] [llama-3.3-70b]                │ │
│  │ Expires: 2026-03-10                                      │ │
│  │                                                          │ │
│  │ [Edit Budget Settings]                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Tab: Activity — 에이전트 활동 타임라인                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 14:32 │ ● Settled │ gpt-4o │ 2.5 NUSDC │ Trading      │ │
│  │       │ "Portfolio rebalance: BTC -5% trigger"          │ │
│  │       │ Executor: TEE-Nitro (Gold, Rep: 950)            │ │
│  │       │ Budget: 47.5 → 45.0 NUSDC                      │ │
│  │       │ [View on Explorer] [View Full AER]              │ │
│  │───────┼─────────────────────────────────────────────────│ │
│  │ 14:15 │ ● Settled │ llama-3 │ 1.0 NUSDC │ Analysis    │ │
│  │       │ "Market sentiment analysis for BTC/USD"         │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Frontend Architecture

```
src/
├── App.tsx                          // Router: DashboardLayout wrapping routes
├── layouts/
│   ├── DashboardLayout.tsx          // NEW: Sidebar + Main content
│   └── ChatLayout.tsx               // KEEP: Reused inside Agent Chat tab
├── pages/
│   ├── DashboardOverview.tsx        // NEW
│   ├── AgentList.tsx                // NEW
│   ├── AgentDetail.tsx              // NEW (tabs: overview/wallet/budget/aer/chat)
│   ├── AERTimeline.tsx              // NEW
│   ├── AERDetail.tsx                // NEW
│   ├── Settings.tsx                 // NEW
│   └── AuthCallback.tsx             // KEEP
├── features/
│   ├── agents/                      // NEW feature module
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentCreateForm.tsx
│   │   │   ├── AgentStatusBadge.tsx
│   │   │   └── BudgetEditor.tsx
│   │   ├── hooks/
│   │   │   ├── useAgentProfiles.ts  // Fetch AgentProfile objects from chain
│   │   │   ├── useAgentBudgets.ts   // Fetch Budget objects linked to agent
│   │   │   └── useCreateAgent.ts    // Transaction builder for agent creation
│   │   └── types.ts
│   ├── aer/                         // NEW feature module
│   │   ├── components/
│   │   │   ├── AERTimelineItem.tsx
│   │   │   ├── AERDetailCard.tsx
│   │   │   ├── AERFilter.tsx
│   │   │   └── BudgetChart.tsx      // Budget consumption over time
│   │   ├── hooks/
│   │   │   ├── useAERRecords.ts     // Fetch AER NFTs owned by user
│   │   │   └── useAERStats.ts       // Aggregate AER statistics
│   │   └── types.ts
│   ├── dashboard/                   // NEW feature module
│   │   ├── components/
│   │   │   ├── StatCard.tsx
│   │   │   ├── AlertCard.tsx
│   │   │   └── RecentActivity.tsx
│   │   └── hooks/
│   │       └── useDashboardStats.ts
│   └── request/                     // KEEP: Existing chat/request feature
│       └── ...
├── components/
│   ├── navigation/
│   │   └── Sidebar.tsx              // NEW
│   └── ...existing...
├── hooks/
│   └── ...existing...
├── services/
│   └── nasunClient.ts               // RPC queries for on-chain data
├── stores/
│   ├── chatStore.ts                  // KEEP
│   └── agentStore.ts                 // NEW: Agent management state
└── config/
    └── network.ts                    // KEEP + extend with agent contract addresses
```

### 4.4 데이터 소싱 전략

| 데이터 | 소스 | 방법 |
|--------|------|------|
| AgentProfile 목록 | On-chain | `getOwnedObjects` (type filter: AgentProfile) |
| Budget 상태/잔액 | On-chain | `getObject` (shared object by ID) |
| AER 기록 목록 | On-chain | `getOwnedObjects` (type filter: AIExecutionReport) |
| AER 이벤트 스트림 | On-chain | `subscribeEvent` (ExecutionReportCreated) |
| Agent 활성 상태 | On-chain | AgentProfile.is_active 필드 |
| Budget 지출 한도 | On-chain | Dynamic Field 조회 (SpendingLimitsKey) |
| 알림/경고 | Frontend | Budget 사용률 계산 (spent / limit > 0.8) |

---

## 5. Security Architecture

### 5.1 Threat Model Summary

리서치에서 식별된 위협을 **MVP에서 해결할 것**과 **이후 단계에서 해결할 것**으로 분류.

#### MVP에서 해결 (P0)

| ID | 위협 | 해결 방안 | 구현 위치 |
|----|------|-----------|----------|
| SEC-B1 | Rate limiting 부재 | `min_interval_ms` + SpendingLimits | budget.move |
| SEC-B2 | 기간별 한도 부재 | `daily/weekly/monthly_limit` | budget.move |
| SEC-PTB1 | AER 없는 정산 | SettlementReceipt witness 패턴 | baram.move + aer.move |
| T-DC1 | AER 없는 금융 활동 | Witness 패턴으로 원자적 결합 | baram.move + aer.move |
| T-ES1 | 비활성화 후 진행 중 TX | AgentProfile.is_active 체크 | budget.spend_from_budget |

#### Phase 2에서 해결

| ID | 위협 | 해결 방안 |
|----|------|-----------|
| SEC-E1 | 허위 request_id 평판 인플레이션 | Cross-package witness 또는 패키지 병합 |
| SEC-BM1 | result_hash 검증 부재 | TEE attestation mandatory for settlement |
| SEC-B3 | 고정 max_per_request 가격 결정 | Dynamic pricing oracle |
| T-F3 | Frontrunning (MEV) | Commit-reveal scheme |
| T-D1 | 다단계 위임 권한 상승 | DelegatedBudget with parent cap enforcement |

### 5.2 Security Invariants (불변 조건)

MVP에서 반드시 보장해야 할 보안 불변 조건:

1. **AER Always-On**: 정산(settlement)이 발생하면 AER이 **반드시** 생성된다
2. **Budget Gate**: 에이전트의 모든 지출은 Budget을 통과한다. Budget 없이 직접 결제 불가
3. **Owner Kill Switch**: 소유자는 언제든 에이전트를 비활성화할 수 있고, 비활성화된 에이전트는 지출 불가
4. **Rate Limited**: 동일 에이전트가 단일 PTB 또는 짧은 시간 내에 Budget을 전부 소진하는 것을 방지
5. **Period Capped**: 일일/주간/월간 지출 한도가 설정되면 어떤 경우에도 초과 불가
6. **Executor = Sender**: AER의 executor 필드는 반드시 tx_context::sender()와 일치

### 5.3 Security Testing Checklist

MVP 배포 전 검증 항목:

- [x] Budget rate limiting: min_interval_ms 미만 간격으로 연속 호출 시 abort 확인
- [x] Daily limit: 한도 초과 시 abort 확인
- [x] Weekly/Monthly limit: 리셋 타이밍 정확성 확인
- [x] Witness pattern: submit_proof_with_receipt 후 AER 미생성 시 TX abort 확인
- [x] Agent deactivate: is_active=false인 에이전트의 budget spend 시 abort 확인
- [x] Executor spoofing: AER executor != sender 시 abort 확인
- [x] Category filtering: 허용되지 않은 카테고리로 spend 시 abort 확인
- [x] Dynamic Field 존재 여부: SpendingLimits 미설정 Budget에서 spend 정상 동작 확인
- [x] create_report 차단: 직접 호출 시 E_DEPRECATED (405) abort 확인 (Security Upgrade v0.0.3)
- [x] initiator 검증: create_report_with_receipt에서 initiator != requester 시 E_INVALID_INITIATOR (406) abort 확인
- [x] deposit_to_budget owner 제한: 타인의 deposit 시 E_NOT_OWNER (100) abort 확인

> **Status**: 데모 스크립트(`pnpm demo-agent`)로 6개 시나리오 모두 통과 확인 (2026-02-10).
> Security-reviewer 및 code-reviewer 에이전트 실행 완료.

---

## 6. MVP Scope Definition

### 6.1 MVP Goal

> "소유자가 AI 에이전트에게 지갑을 부여하고, 예산 한도를 설정하고,
> 에이전트의 모든 재무 활동을 추적할 수 있는 대시보드"

### 6.2 MVP Feature Set

#### Tier 1: Must Have (프로토타입 론칭 필수)

| # | Feature | On-Chain | Frontend |
|---|---------|----------|----------|
| 1 | Agent Profile CRUD | agent_profile.move | AgentCreateForm + AgentList |
| 2 | Budget V2 (시간 기반 한도) | budget.move upgrade | BudgetEditor |
| 3 | AER 원자적 생성 (Witness) | baram.move + aer.move upgrade | - |
| 4 | Dashboard Overview | - | DashboardOverview |
| 5 | Agent Detail (5 tabs) | - | AgentDetail |
| 6 | AER Timeline | - | AERTimeline + AERDetailCard |
| 7 | Agent Deactivation (Kill Switch) | agent_profile.move | Deactivate button |
| 8 | Demo Agent Script (AI 분석 + DEX 자율 거래) | - | - (CLI script) |

#### Tier 2: Should Have (프로토타입 완성도)

| # | Feature | On-Chain | Frontend |
|---|---------|----------|----------|
| 9 | Category-based spending limits | budget.move DF | Category selector in BudgetEditor |
| 10 | Budget consumption visualization | - | BudgetChart (Recharts) |
| 11 | AER filtering & search | - | AERFilter component |
| 12 | Alert system (budget threshold) | - | AlertCard (frontend-only) |
| 13 | Chat Tab (existing chat UI 이동) | - | Existing ChatLayout in tab |

#### Tier 3: Nice to Have (데모 인상)

| # | Feature | On-Chain | Frontend |
|---|---------|----------|----------|
| 14 | DeFi Trader 데모 에이전트 (Pado DEX 연동) | - | Demo page / CLI output viewer |
| 15 | AER export (CSV/PDF) | - | Export button |
| 16 | Real-time event subscription | - | WebSocket/polling for live updates |

### 6.3 MVP에서 명시적으로 제외하는 것

| Feature | 이유 | 예정 Phase |
|---------|------|-----------|
| 외부 에이전트 임포트 API | 프로토타입에 불필요 | Phase 2 |
| 다단계 위임 (Agent → Sub-Agent) | 복잡도 대비 가치 낮음 | Phase 3 |
| x402 결제 통합 | Pado DEX가 실가격 거래 대상을 제공하므로 프로토타입에서 불필요 | Phase 2 |
| NSA 활용 (Agent Vault) | 단순 주소 + Budget이면 충분 | Phase 2 |
| 승인 흐름 (고액 요청) | 프로토타입에 불필요 | Phase 2 |
| Agent Marketplace | 생태계 확대 후 | Phase 3 |
| Off-chain AER 감시 인덱서 | Witness 패턴으로 충분 | Phase 2 |
| record_job_completion 교차 검증 | 패키지 병합 필요 | Phase 2 |

### 6.4 On-Chain Deployment Plan

> **Status**: 전체 배포 완료 (2026-02-10)

```
Step 1: [DONE] Deploy baram_agent (NEW package)
        → AgentProfileRegistry: 0x1e236dfab7e4c3df21651fa4b5dc846d8d1bed314a2615474dd1b805445b9f11
        → PackageID: 0x05edb7edec6e69af66e5d2564e6ca7cb46b60469a0897291c51f8d5c949424de

Step 2: [DONE] Upgrade baram package (contracts/ → v0.0.5)
        → budget.move: SpendingLimits DF + CategoryLimits DF + rate limiting + owner-only deposit
        → baram.move: SettlementReceipt + submit_proof_with_receipt
        → PackageID: 0x60375a271223b222ac7060f2c076d0041ef9b1d2fed8d360556eeb29eb43a8b1
        → TX: 8GoppSivipkunjWE8tfSfiPGh2d878ZaeaX1jJ4cV2GQ

Step 3: [DONE] Upgrade baram_aer package (contracts-aer/ → v0.0.3)
        → aer.move: create_report_with_receipt + executor/initiator 검증
        → aer.move: create_report 차단 (abort E_DEPRECATED)
        → PackageID: 0x809f22f2262fd4211e51c1d890addfaeadb21e4bbf61748d7714306272427692
        → TX: 4DisvcSCts3Fp643wwxNfcJjbtHWQaDciYdXZGJgtQhp

Step 4: [DONE] Update devnet-config
        → packages/devnet-config/devnet-ids.json 업데이트 완료
        → apps/baram/scripts/demo-config.ts 업데이트 완료
```

---

## 7. Implementation Phases

### Phase 1: On-Chain Foundation -- DONE

```
[x] contracts-agent/agent_profile.move 구현 + 배포
[x] contracts/budget.move 업그레이드 (SpendingLimits + Rate Limiting)
[x] contracts/baram.move 업그레이드 (SettlementReceipt witness)
[x] contracts-aer/aer.move 업그레이드 (create_report_with_receipt)
[x] Devnet 배포 + devnet-config 업데이트
[x] 보안 테스트 (checklist 5.3 항목 모두 통과)
```

### Phase 2: Dashboard Frontend -- DONE

```
[x] DashboardLayout + Sidebar + Routing 구조
[x] DashboardOverview 페이지
[x] AgentList + AgentCreateForm
[x] AgentDetail (5 tabs: Overview, Wallet, Budget, Activity, Chat)
[x] BudgetEditor (SpendingLimits 설정 UI)
[x] AERTimeline + AERDetailCard
[x] Existing ChatLayout → Agent Chat Tab으로 이동
```

### Phase 2.5: Demo Agent Script -- DONE

```
[x] Demo agent 설정 (keypair 관리, Budget 파라미터, 시나리오 목록)
[x] Pado LP Bot 코드 재활용 (order-manager, price-source, orderbook import)
[x] AI 분석 → DEX 거래 플로우 구현 (Baram SDK + DeepBook V3)
[x] 한도 초과 시도 시나리오 (E_DAILY_LIMIT_EXCEEDED 데모)
[x] 데모 스크립트 실행 + 대시보드 연동 확인
```

### Phase 3: Polish & Security -- DONE

```
[x] Security review + Code review (security-reviewer, code-reviewer 에이전트)
[x] 프론트엔드 버그 수정 (field name mismatch, Option<T> 파싱, 유틸 중복 제거)
[x] Polling 간격 조정 (3-5초 refetchInterval)
[x] .env.local stale 주소 수정
[x] 보안 컨트랙트 업그레이드 (contracts v0.0.5, contracts-aer v0.0.3)
    - C-1: create_report 차단 (abort E_DEPRECATED)
    - H-2: deposit_to_budget owner-only 제한
    - H-4: create_report_with_receipt initiator 검증
    - H-3: create_request_with_budget v1 deprecation 문서화
```

### Phase 3.5: Remaining Polish (TODO)

```
[ ] Alert system (budget threshold warnings)
[ ] AER filter & search
[ ] Budget consumption chart (Recharts)
[ ] Responsive design / mobile
[ ] Move 단위 테스트 (sui move test)
[ ] 프론트엔드 통합 테스트
```

### Phase 4: Post-MVP (Future)

```
- 외부 에이전트 등록 API (MCP 호환)
- x402 결제 게이트웨이
- 다단계 위임 (DelegatedBudget)
- 승인 흐름 (ApprovalPolicy)
- NSA vault 통합
- Off-chain AER 감시 인덱서
- Agent Marketplace
```

---

## 8. Open Questions & Future Work

### 8.1 결정 사항 (Resolved)

| # | 질문 | 결정 | 근거 |
|---|------|------|------|
| 1 | Agent keypair는 어디서 생성하는가? | **A) 프론트엔드에서 생성** | 구현 완료. AgentCreateForm에서 keypair 생성 후 주소만 등록 |
| 2 | 기존 submit_proof를 제거하는가? | **B) 유지 + deprecated** | submit_proof 유지, create_report는 abort E_DEPRECATED로 차단 |
| 3 | AER을 requester에게 전송하는가, owner에게 전송하는가? | **A) requester (현재)** | initiator 파라미터로 전송 대상 지정. H-4 수정으로 initiator==requester 강제 |
| 4 | Chat Tab에서 기존 에스크로 직접 결제도 지원하는가? | **A) 지원 (기존 플로우 유지)** | 구현 완료. Chat Tab은 기존 ChatLayout 그대로 사용 |

### 8.2 Technical Debt 인식

| 항목 | 설명 | 상태 |
|------|------|------|
| ECR/AER 중복 | compliance.move과 aer.move이 유사한 역할 | Phase 2에서 통합 검토 |
| record_job_completion 검증 | 여전히 허위 request_id 가능 | Phase 2에서 witness 패턴 확장 |
| submit_proof 기존 경로 | Witness 없는 정산 경로가 남아있음 | **유지**: submit_proof는 executor 호환성을 위해 유지. create_report만 차단 |
| 가격 결정 로직 | max_per_request 전액 지출 (v1) | **문서화**: create_request_with_budget v1 deprecation 주석 추가. v2 사용 권장 |
| create_report 직접 호출 | 접근제어 없이 누구나 AER 위조 가능 | **해결됨**: abort E_DEPRECATED (405)로 차단 (v0.0.3) |
| deposit_to_budget 그리핑 | 타인이 dust deposit으로 griefing 가능 | **해결됨**: owner-only 제한 추가 (v0.0.5) |
| initiator 스푸핑 | executor가 임의 주소로 AER 전송 가능 | **해결됨**: initiator==requester 검증 추가 (v0.0.3) |
| increment_stats 접근제어 | 시그니처에 ctx 없어 누구나 호출 가능 | **수용**: AgentProfile은 owned object → Sui 레벨 접근제어 작동. compatible 업그레이드 불가 |

### 8.3 Success Metrics (프로토타입)

| Metric | Target | 측정 방법 |
|--------|--------|----------|
| 에이전트 생성 가능 | Yes/No | AgentProfile on-chain 생성 |
| Budget 한도 적용 | Yes/No | 한도 초과 시 TX abort |
| AER 강제 생성 | Yes/No | Witness 패턴 동작 |
| 대시보드 기본 기능 | Yes/No | 5개 화면 렌더링 |
| 데모 시나리오 | 1개 이상 | "DeFi Trader 에이전트가 Budget 내에서 자율 트레이딩" |

---

## Appendix A: Contract Inventory (Current)

| Contract | Package | Version | PackageID |
|----------|---------|---------|-----------|
| baram.move | baram | **v0.0.5** | `0x60375a...a8b1` |
| budget.move | baram | **v0.0.5** | (same package) |
| aer.move | baram_aer | **v0.0.3** | `0x809f22...7692` |
| agent_profile.move | baram_agent | v1.0.0 | `0x05edb7...24de` |
| executor.move | baram_executor | v1.0.0 | devnet-ids.json |
| executor_staking.move | baram_executor | v1.0.0 | (same package) |
| compliance.move | baram_compliance | v1.0.0 | devnet-ids.json |
| attestation_registry.move | baram_attestation | v1.0.0 | devnet-ids.json |

> Full object IDs: `packages/devnet-config/devnet-ids.json`
>
> Upgrade history: baram v1→v5 (5 upgrades), aer v1→v3 (2 upgrades), agent v1 (new deploy)

## Appendix B: Error Code Registry

| Range | Module | Description |
|-------|--------|-------------|
| 0-99 | baram.move | Escrow/Settlement errors |
| 100-199 | budget.move | Budget/Delegation errors |
| 200-299 | executor_staking.move | Staking errors |
| 300-399 | compliance.move | Compliance errors |
| 400-499 | aer.move | AER errors |
| 500-599 | agent_profile.move (NEW) | Agent Profile errors |

## Appendix C: Move.toml Dependency Changes

```toml
# contracts-agent/Move.toml (NEW)
[package]
name = "baram_agent"
edition = "2024.beta"

[dependencies]
Sui = { ... }

[addresses]
baram_agent = "0x0"
```

```toml
# contracts-aer/Move.toml (MODIFIED)
[package]
name = "baram_aer"
edition = "2024.beta"

[dependencies]
Sui = { ... }
baram = { local = "../contracts" }  # NEW dependency for SettlementReceipt

[addresses]
baram_aer = "0x..."
baram = "0x..."  # Published address of baram package
```
