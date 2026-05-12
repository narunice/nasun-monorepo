# Baram-AER Research Report: AI Agent Admin Dashboard + AER

> Research Date: 2026-02-10
> Team: product-researcher, infra-researcher, security-researcher
> Lead: protocol-architect (team-lead)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Part 1: Product Research](#part-1-product-research)
3. [Part 2: On-Chain Infrastructure Research](#part-2-on-chain-infrastructure-research)
4. [Part 3: Security Analysis](#part-3-security-analysis)
5. [Cross-Review: Key Consensus Points](#cross-review)
6. [7 Core Questions Answered](#7-core-questions)
7. [Part 4: Market Research - AI Agent Autonomous Spending (2025-2026)](#part-4-market-research)
8. [Part 5: Pado DEX Integration Analysis](#part-5-pado-dex-integration-analysis)

---

## Executive Summary

3개 리서치 에이전트(product, infra, security)의 병렬 조사 결과를 종합한 보고서.

**핵심 결론:**
- "에이전트 지갑 + 예산 관리 + 감사 기록" 단일 대시보드는 **시장에 없음** (White Space)
- Agent Origin: **하이브리드** (기본 템플릿 + 외부 임포트) 추천
- Agent Wallet: NSA 직접 재활용보다 **단순 주소 + Budget 위임 + 경량 AgentProfile** 우선
- AER 핵심 결함: submit_proof와 create_report 분리 → **패키지 병합 또는 witness 패턴 필수**
- Budget 최우선 확장: **시간 기반 지출 한도** (Rate Limiting 부재는 Critical)
- 결제 레일: Phase 1은 **baram.move 에스크로**, Phase 2에서 x402
- 브랜딩: **"Your agents work for you. Baram proves it."**

---

# Part 1: Product Research

> By: product-researcher

## 1. 경쟁사 분석 보고서 (AI Agent Management Platforms)

### 1-1. Virtuals Protocol (GAME Framework)

**플랫폼 개요:**
Virtuals Protocol은 2024년 10월 Ethereum L2 Base에서 출시된 AI Agent 토큰화 및 런칭 플랫폼. GAME(Generative Autonomous Multimodal Entities) 프레임워크를 통해 에이전트를 자율적으로 의사결정하도록 지원.

**사용자 여정 (Step by Step):**
1. fun.virtuals.io 접속 -> "Create New Agent" 클릭
2. 100 $VIRTUAL 토큰 지불 (에이전트 생성 비용)
3. Agent Creation Form 작성: 에이전트 이름, 설명, 성격, 목표 정의
4. Worker 정의: 구체적 기능/액션 세트 설정 (트레이딩, 소셜 미디어 등)
5. 배포 완료 후 Telegram에서 에이전트와 상호작용
6. 사용자 대시보드에서 에이전트 통계 및 설정 관리

**핵심 화면/기능:**
- Agent Dashboard: 에이전트별 통계, 앱 상호작용 현황, 시장 데이터
- GAME SDK: 개발자가 목표, 성격, 상태, 액션 세트를 커스텀 통합
- 플러그인 시스템: 온체인 트랜잭션, 트레이딩, 이미지 생성, 소셜 인게이지먼트

**잘하는 점:**
- 토큰화로 에이전트에 경제적 가치 부여 (에이전트 = 토큰 = 투자 가능)
- $500M+ 마켓캡, $8B+ DEX 볼륨 달성 (2025년 9월 기준)
- 비개발자도 접근 가능한 No-code 생성 플로우

**약점:**
- GAME Cloud (호스팅 로우코드 인터페이스) 지원 중단 -> SDK만 남음
- 에이전트의 실질적 "관리(budget, wallet control)" 기능 부재
- 토큰 투기에 치우쳐 실용적 에이전트 관리 UX가 약함

### 1-2. OpenClaw (구 Moltbot / Clawdbot)

**플랫폼 개요:**
Peter Steinberger가 개발한 오픈소스 AI Agent. 2025년 Clawdbot으로 시작, Moltbot으로 리브랜딩 후, 2026년 1월 OpenClaw로 최종 리브랜딩. 로컬 기기에서 실행되는 개인 AI 어시스턴트.

**사용자 여정:**
1. 로컬 설치 (self-hosted)
2. Interactive wizard로 설정 파일 생성 (몇 가지 질문 응답)
3. 멀티채널 연동: WhatsApp, Telegram, Slack, Discord, Signal 등 20+ 채널
4. AgentSkills (100+개 프리설정) 선택하여 기능 확장
5. 멀티에이전트 정의: 세일즈, 서포트, 개인 비서 등 역할별 에이전트 선언적 정의

**잘하는 점:**
- 완전한 오픈소스, 로컬 실행 (데이터 주권)
- 20+ 메시징 플랫폼 통합 (가장 넓은 채널 커버리지)
- ERC-8004와의 통합으로 온체인 트러스트리스 트레이딩 에이전트 구현 가능

**약점:**
- 순수 개발자 도구 -> 일반 사용자 대시보드 UX 부재
- 지갑/예산 관리는 네이티브 기능이 아님 (ERC-8004 외부 통합 필요)
- 보안 이슈: 악성 크립토 트레이딩 스킬 발견 사례 있음

### 1-3. ElizaOS V2 (ai16z)

**플랫폼 개요:**
ai16z 창립자 Shaw가 개발한 AI Agent 프레임워크. V2는 2025년 3월 베타 런칭, 4월 정식 출시. "Autonomous agents for everyone"을 표방.

**핵심 기능:**
- **Unified Agent Wallet**: 여러 블록체인 네트워크에 걸친 자산을 단일 인터페이스로 관리
- **Event-Driven Architecture**: 이벤트 기반 아키텍처 + HTN(Hierarchical Task Networks)
- **Plugin System**: 플랫폼 코어와 플러그인 확장 분리
- **Sui Plugin**: plugin-sui로 Sui 네트워크 토큰 운영 및 지갑 관리 지원

**잘하는 점:**
- 통합 지갑이 V1의 파편화 문제 해결
- 넓은 생태계: Gelato, Lit Protocol, MetaMask 등과 플러그인 통합
- Sui 네트워크 네이티브 지원 (Baram과의 호환성 높음)

**약점:**
- 여전히 개발자 중심 도구 (일반 사용자용 대시보드 UI 미약)
- "Agent Marketplace" + 노코드는 로드맵 단계
- 에이전트 예산/지출 제한 등의 관리 기능은 미구현

### 1-4. Coinbase AgentKit / CDP

**핵심 기능:**
- **Smart Wallet**: 가스리스 트랜잭션 (ETH 보유 불필요)
- **x402 Protocol 통합**: HTTP 기반 자율 결제 (75M+ 트랜잭션, $24M 처리 - 2025년 12월 기준)
- **멀티체인**: EVM + Solana 지원
- **Coinbase Onramp**: 법정화폐 -> 크립토 펀딩 경로

**약점:**
- 순수 인프라/SDK -> 에이전트 관리 대시보드 자체는 제공하지 않음
- Coinbase 생태계 의존성 (Base 체인 중심)
- 예산 관리, 지출 카테고리 등 "Admin Dashboard" 기능 없음

### 1-5. Turnkey

**플랫폼 개요:**
TEE(Trusted Execution Environment) 기반 지갑 인프라. 50-100ms 서명 지연, 99.9% 가동시간.

**핵심 기능:**
- **정책 기반 제어(Policy Controls)**: "$1,000/일 지출 한도", "출금 시 2-of-3 다중서명" 등 코드로 정의
- **Delegated Access**: 역할 기반 제한된 접근 + 소셜 리커버리
- **TEE 보안**: 모든 서비스가 Secure Enclave에서 실행

**잘하는 점:**
- **Baram-AER와 가장 유사한 접근**: 정책 기반 지갑 관리 + TEE 보안
- 실제 프로덕션 검증: Spectral 등에서 에이전트 지갑 정책 적용

**약점:**
- 인프라 레이어만 제공 -> 사용자 대면 대시보드는 직접 구축 필요
- Ethereum/EVM 중심 (Sui/Move 지원 없음)

### 1-6. Fetch.ai Agentverse

**핵심 기능:**
- **브라우저 IDE**: 코드 에디터, 로깅 콘솔, 파일 관리
- **Inspector Dashboard**: 실시간 에이전트 행동 추적, 메시지 송수신 상세 조회
- **Agent Discovery**: 에이전트끼리 서로 발견, 협업

**잘하는 점:**
- 가장 완성도 높은 에이전트 관리 UI (IDE + Inspector + 메트릭)
- 플랫폼 무관(platform-agnostic): 어디서든 만든 에이전트 합류 가능

**약점:**
- 금융/지갑 관리 특화 기능 부재
- 개발자 중심 (비개발자의 에이전트 "Admin" 경험 부족)

### 1-7. 경쟁사 종합 비교 매트릭스

| 기능 | Virtuals | OpenClaw | ElizaOS V2 | Coinbase AgentKit | Turnkey | Fetch.ai |
|------|----------|----------|------------|-------------------|---------|----------|
| 에이전트 생성 | O (노코드) | O (설정파일) | O (CLI+플러그인) | O (SDK) | X (지갑만) | O (IDE) |
| 지갑 관리 | X | X | O (통합 지갑) | O (Smart Wallet) | O (TEE 지갑) | X |
| 예산/지출 제한 | X | X | X | X | **O (정책 기반)** | X |
| 관리 대시보드 | 부분적 | X | X | X | X | O (Inspector) |
| 온체인 감사 | X | ERC-8004 | X | x402 로그 | 감사 로깅 | X |
| 비개발자 접근성 | 높음 | 낮음 | 낮음 | 낮음 | 낮음 | 중간 |
| TEE 보안 | X | X | X | X | **O** | X |

**핵심 인사이트:**
> 현재 시장에서 "에이전트 지갑 + 예산 관리 + 감사 기록"을 **단일 대시보드**로 제공하는 플랫폼은 **존재하지 않음**. Turnkey가 정책 기반 지갑 제어로 가장 가까우나, 인프라 레이어에 머물러 있고 사용자 대면 대시보드는 없음. **이것이 Baram-AER의 핵심 기회**.

---

## 2. Agent Origin 추천안

### Option 1: Baram이 에이전트를 직접 생성 (All-in-One)
- 구현 복잡도: 매우 높음
- 생태계 네트워크 효과: 낮음 (자체 생태계에 갇힘)
- 경쟁 모트: 약함

### Option 2: 외부 에이전트 임포트 전용 (Import Only)
- 구현 복잡도: 중간
- 사용자 가치: 중상 (에이전트가 없는 사용자에게 진입 장벽)
- 생태계 네트워크 효과: 높음

### Option 3: 하이브리드 -- **추천**
- 구현 복잡도: 중간~중상
- 사용자 가치: 최고 (양쪽 사용자 모두 온보딩)
- 생태계 네트워크 효과: 최고
- 경쟁 모트: 강함

**추천 이유:**
1. 프로토타입 출시 전략과 부합: 3-5개 사전 빌트 템플릿으로 "이런 것이 가능하다" 시연
2. 커뮤니티 빌딩: 템플릿 = 진입 장벽 낮음, 외부 개발자 = 고급 사용자
3. 차별화: "에이전트를 만드는 곳"이 아닌 "에이전트에 지갑을 주고 관리하는 곳"
4. 자원 효율: ElizaOS의 Sui 플러그인 활용하여 템플릿 빠르게 구현

**실행 방안:**
- Phase 1 (프로토타입): 2-3개 에이전트 템플릿 + 지갑 할당/예산 관리 대시보드 + AER 기록
- Phase 2: 외부 에이전트 등록 API (MCP 호환) + ERC-8004 식 에이전트 ID
- Phase 3: 에이전트 마켓플레이스 + 커뮤니티 기여 템플릿

---

## 3. Dashboard UX 구조 제안

### 결론: 채팅 UI를 완전히 제거하지 말고, "에이전트 커뮤니케이션 채널"로 재포지셔닝.

### 전체 레이아웃: 사이드바 + 메인 콘텐츠 + 상세 패널

```
+------------------+--------------------------------+------------------+
|                  |                                |                  |
|   SIDEBAR        |       MAIN CONTENT             |   DETAIL PANEL   |
|   (Navigation)   |       (Context-dependent)      |   (선택적 표시)   |
|                  |                                |                  |
|  - Dashboard     |                                |                  |
|  - My Agents     |                                |                  |
|  - Exec. Reports |                                |                  |
|  - Wallets       |                                |                  |
|  - Settings      |                                |                  |
|                  |                                |                  |
+------------------+--------------------------------+------------------+
```

### 핵심 화면 (Key Screens)

**Screen 1: Dashboard (Overview)**
- 총 에이전트 수, 활성 에이전트 수, 총 지갑 잔액
- 최근 24시간 에이전트 활동 요약 (트랜잭션 수, 총 지출)
- 이상 징후 알림 카드 (예산 초과 경고, 실패한 트랜잭션)
- 에이전트별 미니 상태 카드 (이름, 상태, 잔액, 최근 활동)

**Screen 2: My Agents (에이전트 목록 + 관리)**
- 에이전트 카드 그리드 (이름, 타입, 상태, 지갑 잔액, 생성일)
- "Create Agent" (템플릿 선택) / "Import Agent" (외부 등록) 버튼
- 에이전트 상세 페이지:
  - Tab 1: Overview -- 기본 정보, 현재 상태, 실시간 로그
  - Tab 2: Wallet -- 할당된 지갑 주소, 잔액, 입출금 이력
  - Tab 3: Budget -- 예산 한도 설정, 카테고리별 지출 제한, 유효 기간
  - Tab 4: Activity -- 이 에이전트의 활동 기록 타임라인
  - Tab 5: Chat -- 에이전트와의 대화 (기존 채팅 UI를 여기에 내장)

**Screen 3: Execution Reports**
- 타임라인 뷰: 시간순 활동 로그 (에이전트별 색상 구분)
- 필터: 에이전트별, 날짜 범위, 금액 범위, 트랜잭션 타입
- 각 AER 레코드 클릭 시: 트랜잭션 상세, AI 의사결정 로그, 온체인 증거 링크
- 내보내기(Export) 기능: CSV/PDF 리포트 생성

**Screen 4: Wallets (지갑 관리)**
- 지갑 목록: 주소, 연결된 에이전트, 잔액, 최근 트랜잭션
- 자금 이체: 메인 지갑 -> 에이전트 지갑으로 충전
- 정책 설정: 일별/주별 지출 한도, 승인 필요 금액 임계값

**Screen 5: Settings**
- 글로벌 예산 정책, 알림 설정, 계정 관리, 외부 에이전트 API 키

### UX 디자인 원칙
1. **Transparency First**: 모든 에이전트 활동에 "thought log" 표시
2. **Adaptive Control**: 에이전트 자율성 슬라이더 (완전 자율 <-> 매 트랜잭션 승인)
3. **Progressive Disclosure**: 요약 -> 클릭 -> 상세 -> 온체인 증거
4. **Real-time Clarity**: 5-10초마다 자동 갱신
5. **Action-Focused**: 핵심 액션을 1-2클릭 내 접근

---

## 4. AER 시장 포지셔닝 분석

### 한국 블랙박스 문화와의 유비

사람들이 블랙박스를 사는 이유:
1. **무고 증명**: "내가 잘못하지 않았다"는 증거
2. **보험 분쟁 해결**: 사고 시 과실 비율 판정의 결정적 증거
3. **사기 방지**: 보험 사기(꽃뱀) 방어
4. **안심**: 녹화되고 있다는 사실 자체가 안도감

AI 에이전트 AER로의 전이:
1. "내 에이전트가 무단으로 돈을 쓰지 않았다" -> 분쟁 시 증거
2. DeFi에서 예기치 않은 손실 발생 시, AI가 왜 그 결정을 했는지 추적
3. 에이전트 탈취/조작 시도의 기록
4. "내 AI가 뭘 하고 있는지 언제든 확인할 수 있다"

### 직접 경쟁자: 사실상 없음

| 플레이어 | 접근 방식 | Baram-AER와의 차이 |
|----------|-----------|-------------------|
| AnChain.AI | 블록체인 포렌식/AML 도구 | 사후 조사 도구, 에이전트 관리 아님 |
| Zenity | 엔터프라이즈 AI 거버넌스 | Web2 기업 대상, 온체인 아님 |
| Galileo AI | AI 에이전트 컴플라이언스 | 규제 준수 플랫폼, 금융 특화 아님 |

### 간접 경쟁자

| 플레이어 | 포지션 | 핵심 차이 |
|----------|--------|-----------|
| x402 (Coinbase) | 결제 프로토콜 | "결제 인프라"지, "감사/관리" 아님 |
| Olas | 에이전트 마켓플레이스 | "에이전트 거래/발견"이지, "관리/감사" 아님 |
| Virtuals | 에이전트 토큰화 | "투자/투기"지, "관리/감사" 아님 |
| ERC-8004 | 에이전트 신원/평판 | "정체성 표준"이지, "활동 기록" 아님 (보완적) |
| Turnkey | TEE 지갑 인프라 | "지갑 보안"이지, "활동 기록/대시보드" 아님 |

### 시장 지도

```
                    에이전트 "생성"                    에이전트 "관리"
                         |                                  |
  토큰화/투기  ----  Virtuals                               |
                         |                                  |
  마켓플레이스  ----  Olas (Pearl)                           |
                         |                                  |
  런타임/프레임워크  ---- ElizaOS, OpenClaw, Fetch.ai        |
                         |                                  |
  결제 인프라  ----  x402, AgentKit              Baram-AER  |  <-- 유일한 포지션
                         |                                  |
  지갑 인프라  ----  Turnkey                                |
                         |                                  |
  신원/평판  ----  ERC-8004                                 |
```

**고유 가치 제안:**
> "AI 에이전트는 이미 어디서든 만들 수 있다. 하지만 **내 에이전트가 내 돈으로 무엇을 했는지** 증명할 수 있는 곳은 Baram뿐이다."

---

# Part 2: On-Chain Infrastructure Research

> By: infra-researcher-v2

## 1. Agent 지갑 아키텍처 제안

### NSA(smart_account.move) 에이전트 지갑 재활용 분석

현재 smart_account.move 핵심 구조:
```move
public struct SmartAccount has key {
    signers: VecMap<address, SignerInfo>,  // 최대 5명
    threshold: u8,
    guardians: vector<address>,           // 최대 5명
    guardian_threshold: u8,
    recovery_owner: address,
    assets: Bag,                          // 다중 토큰 저장
    created_at: u64,
}
```

| 기능 | "소유자 + 에이전트" 모델 적합성 | 평가 |
|------|-------------------------------|------|
| Multi-signer | 소유자(weight=3) + 에이전트(weight=1), threshold=3 -> 소유자 단독 서명 가능, 에이전트는 불가 | 부분 적합 |
| Guardian recovery | guardian 시스템으로 에이전트 키 분실 시 소유자가 rotate_signers()로 교체 가능 | 적합 |
| Bag 자산 저장 | type_name::get<T>()를 키로 사용, NUSDC/NBTC/NASUN 등 다중 토큰 보유 가능 | 적합 |
| Shared object | SmartAccount는 shared object -> 소유자와 에이전트 모두 접근 가능 | 적합 |

**핵심 한계점:**
1. **권한 분리 부재**: assert_is_signer()는 단순히 signer 목록에 있는지만 확인. 에이전트가 withdraw()를 호출하면 소유자와 동일한 권한으로 무제한 출금 가능. threshold 검증이 withdraw 단계에서 이뤄지지 않음.
2. **예산 제약 없음**: NSA에는 "건당 한도", "일일 한도", "허용 모델" 같은 에이전트 지출 제약 개념이 없음. 이 역할은 이미 budget.move가 수행 중.
3. **2-phase signer addition 오버헤드**: 에이전트를 추가할 때마다 propose_add_signer() -> accept_signer_proposal() 2단계 필요.

**결론: NSA 직접 재활용보다는 "단순 Sui 주소 + budget.move 위임"이 현 단계에서 더 현실적.**

### 온체인 Agent Profile 제안

```move
public struct AgentProfile has key, store {
    id: UID,
    // Identity
    owner: address,              // Human owner
    agent_address: address,      // Agent's Sui address
    name: String,                // e.g., "Research Assistant"
    role: String,                // e.g., "executor", "researcher", "trader"
    capabilities: vector<String>,// e.g., ["baram_request", "budget_spend"]

    // Metadata
    created_at: u64,
    last_active_at: u64,
    is_active: bool,

    // Budget linkage
    linked_budgets: vector<ID>,  // Budget object IDs

    // Stats
    total_executions: u64,
    total_spent: u64,
}
```

설계 근거:
- `owner`와 `agent_address` 분리 -> "누구의 에이전트인지" 온체인 증명
- `capabilities` -> 대시보드에서 에이전트 권한 시각화
- `linked_budgets` -> 하나의 에이전트가 여러 Budget을 관리하는 시나리오 지원
- Owned object (not shared) -> 소유자만 수정 가능, 에이전트는 읽기만

---

## 2. Budget 시스템 확장 설계

### 현재 한계

| 항목 | 현재 상태 | 한계 |
|------|----------|------|
| 지출 카테고리 | allowed_models + allowed_executors로 간접 제한 | "어떤 용도"인지 제한 불가 |
| 시간 기반 한도 | expires_at만 있음 | 일일/주간/월간 한도 없음 |
| 승인 흐름 | 없음 | 고액 요청도 자동 승인 |
| 위임 체인 | 1단계 (Human -> Agent) | 다단계 위임 불가 |

### 2-A. 지출 카테고리 제한

```move
public struct BudgetV2 has key, store {
    // ... 기존 필드 유지 ...
    allowed_categories: vector<String>,  // e.g., ["code_review", "customer_support"]
    // Empty = all categories allowed
}
```

### 2-B. 시간 기반 지출 한도

```move
public struct SpendingLimits has store {
    daily_limit: u64,           // 일일 한도 (0 = 무제한)
    weekly_limit: u64,          // 주간 한도 (0 = 무제한)
    monthly_limit: u64,         // 월간 한도 (0 = 무제한)

    spent_daily: u64,           // 오늘 지출 누적
    spent_weekly: u64,          // 이번 주 지출 누적
    spent_monthly: u64,         // 이번 달 지출 누적

    last_daily_reset: u64,      // 마지막 일간 리셋 timestamp
    last_weekly_reset: u64,     // 마지막 주간 리셋 timestamp
    last_monthly_reset: u64,    // 마지막 월간 리셋 timestamp
}
```

리셋 로직 (spend_from_budget 호출 시 자동):
```move
fun maybe_reset_limits(limits: &mut SpendingLimits, now: u64) {
    let day_ms: u64 = 86_400_000;
    let week_ms: u64 = 604_800_000;
    let month_ms: u64 = 2_592_000_000; // 30일 근사

    if (now >= limits.last_daily_reset + day_ms) {
        limits.spent_daily = 0;
        limits.last_daily_reset = now - (now % day_ms);
    };
    // ... weekly, monthly 동일 패턴
}
```

**주의**: Nasun devnet의 max_fields_in_struct=32 제약. Dynamic Field로 저장 권장.

### 2-C. 승인 흐름 (고액 요청)

```move
public struct ApprovalPolicy has store {
    approval_threshold: u64,    // 이 금액 이상이면 소유자 승인 필요
    pending_requests: Table<u64, PendingApproval>,
}
```

### 2-D. 다단계 위임

```move
public struct DelegatedBudget has key, store {
    id: UID,
    parent_budget_id: ID,       // 상위 Budget 참조
    delegator: address,         // Manager agent address
    delegate: address,          // Worker agent address
    balance: Balance<NUSDC>,
    max_per_request: u64,
    // ... 하위 한도는 상위를 초과 불가
}
```

### 구현 우선순위
1. **Phase 1 (즉시)**: 2-B 시간 기반 한도
2. **Phase 2 (단기)**: 2-A 카테고리 제한
3. **Phase 3 (중기)**: 2-C 승인 흐름
4. **Phase 4 (장기)**: 2-D 다단계 위임

---

## 3. AER 진화 제안

### 현재 31필드 감사 기록 역할 평가

| 카테고리 | 감사 기록 역할 | 평가 |
|---------|------------|------|
| WHO (Requester) | 누가 요청했나 | 충분 |
| WHO (Executor) | 누가 실행했나 | 충분 |
| HOW MUCH | 비용 추적 | 충분 |
| WHAT | 무엇을 실행했나 | **부분적** -- I/O 해시만 |
| WHY | 왜 실행했나 | **부분적** -- purpose가 Optional |
| HOW TRUSTWORTHY | 신뢰도 | 충분 |
| WHEN | 타이밍 | 충분 |
| CHAIN | 연쇄 실행 | 기본적 |

**전체 평가**: 감사 기록 역할의 약 75% 충족.

### 제약: max_fields_in_struct=32, 남은 여유 1 필드

**권장: 기존 JSON 필드 활용 (컨트랙트 업그레이드 불필요)**

| 기존 필드 | 추가 데이터 | 패킹 방식 |
|----------|-----------|----------|
| constraints | agent_profile_id, decision_context | JSON 확장 |
| fee_detail | budget_before/after snapshot | JSON 확장 |
| model_metadata | anomaly_flag, rate_limit_info | JSON 확장 |

---

## 4. 결제 레일 분석

### x402 vs baram.move 에스크로

| 비교 항목 | baram.move 에스크로 확장 | x402 도입 |
|----------|------------------------|----------|
| 구현 비용 | 낮음 (기존 코드 재활용) | 중간-높음 |
| 즉시 사용 가능 | 예 (이미 배포됨) | 아니오 (3-6주) |
| 외부 호환성 | Nasun 전용 | 범용 (x402 생태계) |
| 감사 추적 | AER 자동 생성 | 별도 AER 통합 필요 |
| 생태계 신호 | 자체 시스템 | "x402 지원"은 강력한 시그널 |

**추천: 하이브리드 접근**
- Phase 1 (프로토타입): baram.move 에스크로 확장
- Phase 2 (중기): x402 게이트웨이 추가
- Phase 3 (장기): Sui 공식 x402 facilitator 활용

---

# Part 3: Security Analysis

> By: security-researcher

## 1. 기존 컨트랙트 보안 리뷰

### SEC-B1: Rate Limiting 부재 (Critical)
- `spend_from_budget()`에 시간 기반 rate limiting 없음
- 에이전트가 `max_per_request` 한도 내에서 **무제한 빈도**로 호출 가능
- 단일 PTB 내에서 100건의 요청으로 전액 소진 가능

### SEC-B2: Daily/Hourly Spending Cap 부재 (High)
- `total_spent`은 누적치만 추적, 기간별 지출 한도 없음

### SEC-B3: 가격 결정 로직 문제 (High)
- `baram.move:458-459`: 에이전트가 항상 `max_per_request` 금액을 지출
- 0.1 NUSDC 서비스에 10 NUSDC를 지불하는 과다 지출 구조

### SEC-E1: 허위 request_id로 평판 인플레이션 (High)
- `record_job_completion()`이 BaramRegistry에 해당 request_id 실제 존재 여부 교차 검증 불가
- 50건이면 Gold tier(1000) 도달

### SEC-SA1: 단일 signer의 무제한 권한 (High)
- `withdraw()`에서 threshold 검증 없이 단일 signer만으로 전액 출금 가능
- multi-signer의 의미가 사실상 무효화

### SEC-BM1: 결과 검증 부재 (High)
- `submit_proof()`가 result_hash의 정확성을 검증하지 않음
- 임의의 32바이트 해시를 제출해도 에스크로 자금 지급

### SEC-PTB1: PTB 내 선택적 호출 (High)
- executor가 PTB에서 `create_report()` 호출을 생략 가능
- **AER 없이 정산 완료**

---

## 2. 에이전트 자율 금융 위협 모델

### 에이전트 키 위협

| 위협 | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-K1: 개인키 탈취 | High | Critical | Hard |
| T-K2: 에이전트 사칭 | Medium | Critical | Medium |
| T-K3: 키 로테이션 실패 | Medium | High | Medium |
| T-K4: Side-channel 공격 | Low | Critical | Hard |

### 예산/금융 위협

| 위협 | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-F1: 예산 고속 소진 | High | Critical | Medium |
| T-F2: TOCTOU | Low | Medium | Easy |
| T-F3: Frontrunning (MEV) | Medium | High | Hard |
| T-F4: Flash-loan 스타일 | Low | Medium | Easy |
| T-F5: Executor-Agent 공모 | High | High | Hard |

### 위임 위협

| 위협 | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-D1: 권한 상승 | Low | Critical | Medium |
| T-D2: Circular Delegation | Low | Medium | Easy |
| T-D3: Confused Deputy | Medium | High | Medium |
| T-D4: 취소 지연 | High | High | Medium |

### AER 우회 위협

| 위협 | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-DC1: AER 없는 금융 활동 | High | Critical | Medium |
| T-DC2: AER 데이터 조작 | High | High | Hard |
| T-DC3: 선택적 보고 | High | High | Medium |
| T-DC4: 타임스탬프 신뢰성 | Low | Medium | Easy |

### 비상 정지 위협

| 위협 | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-ES1: 비활성화 후 진행 중 TX | High | High | Medium |
| T-ES2: 비활성화-지출 레이스 | High | Medium | Medium |
| T-ES3: Global Kill Switch 부재 | Medium | High | Medium |

---

## 3. AER 증거력 요건

### 불변성 (Immutability)
- AER은 `has key, store` without `drop` -> 생성 후 수정/삭제 불가
- **충분함**

### 완전성 (Completeness)
- **심각한 결함**: 실행이 AER 생성 없이 완료 가능
- submit_proof()와 create_report()가 별도 패키지
- **필요 조치**: 패키지 병합 또는 Witness 패턴

### 타임스탬프 신뢰성
- `Clock.timestamp_ms()` 사용 -> consensus-determined
- 단일 validator에서는 조작 가능, 다중 validator에서는 BFT 보장

### 서명 체인
- **문제**: AER의 executor 필드가 파라미터로 전달됨 -> 호출자가 다른 주소 기입 가능
- **필요**: `assert!(executor == tx_context::sender(ctx))` 추가

---

## 4. 보안 요구사항 체크리스트

### Critical (즉시 해결)
1. Budget Rate Limiting -- `spend_from_budget()`에 시간/빈도 제한
2. AER 생성 강제 -- submit_proof와 AER의 원자적 결합
3. 기간별 지출 한도 -- daily/hourly cap

### High (프로토타입 이후 즉시)
4. AER executor 필드 검증
5. record_job_completion 교차 검증
6. Global Circuit Breaker
7. SmartAccount multi-sig 강화

### Medium (로드맵 반영)
8. Agent 키 로테이션 메커니즘
9. Budget allowed_executors 기본값 변경
10. 실패 실행의 강제적 AER 기록
11. Off-chain AER 완전성 감시 인덱서

---

# Cross-Review: Key Consensus Points

3개 리서처가 독립적으로 도달한 합의점:

| 질문 | product | infra | security | 합의 |
|------|---------|-------|----------|------|
| Agent Origin | 하이브리드 (Option 3) | ElizaOS Sui 플러그인 활용 | - | **하이브리드** |
| Agent Wallet | - | NSA보다 단순 주소+Budget | NSA SEC-SA1 결함 | **단순 주소 + AgentProfile** |
| AER 핵심 결함 | - | Witness 패턴 필요 | T-DC1 Critical | **패키지 병합/Witness 필수** |
| Budget 최우선 | - | SpendingLimits struct | SEC-B1 Critical | **시간 기반 한도** |
| 결제 레일 | x402는 Phase 2 | baram.move 에스크로 우선 | - | **Phase 1 에스크로, Phase 2 x402** |
| AER 포지셔닝 | 시장 빈 공간 | - | 증거 신뢰성 보강 필요 | **유일한 포지션 + 보안 강화** |

---

# 7 Core Questions Answered

### Q1. Agent Origin: 에이전트를 Baram이 직접 만드는가, 외부에서 가져오는가?
**A: 하이브리드.** Phase 1에서 2-3개 에이전트 템플릿 제공 + 외부 등록 API. ElizaOS Sui 플러그인 활용.

### Q2. UI Structure: 대시보드로 전면 교체인가, 채팅과 공존하는가?
**A: 공존.** 대시보드가 메인 UI, 채팅은 에이전트 상세 페이지의 Tab 5 "Chat"으로 이동.

### Q3. Agent Wallet: NSA를 재활용하는가?
**A: Phase 1에서는 아니오.** 단순 Sui 주소 + budget.move 위임 + 경량 AgentProfile struct 신규 생성. NSA는 Phase 2에서 에이전트 자체 자산 보유 시 vault로 선택적 활용.

### Q4. Budget Extension: 지출 카테고리, 일일 한도를 어떻게 구현하는가?
**A:** SpendingLimits struct (daily/weekly/monthly) + allowed_categories 필드 추가. Dynamic Field 활용으로 max_fields_in_struct=32 제약 회피. 구현 우선순위: 시간 한도 > 카테고리 > 승인 흐름 > 다단계 위임.

### Q5. AER 필드 충분성: 현재 31필드로 충분한가?
**A: 75% 충분.** 추가 데이터(budget_before, anomaly_flag, agent_profile_id)는 기존 JSON 필드(constraints, fee_detail, model_metadata) 확장으로 해결. 컨트랙트 업그레이드 불필요. 단, AER 생성 강제(패키지 병합/witness)와 executor 필드 검증은 필수.

### Q6. Payment Rails: x402 통합 vs 자체 에스크로?
**A: Phase 1은 baram.move 에스크로 확장.** 이미 작동하고 AER 감사 추적이 자동 통합됨. x402는 Phase 2에서 외부 에이전트 생태계와의 호환성이 필요해질 때 HTTP 게이트웨이로 도입.

### Q7. MVP Scope: 가장 먼저 구현해야 할 것은?
**A:**
1. AgentProfile 온체인 모듈 + BudgetV2 (시간 기반 한도)
2. AER 생성 강제 (패키지 병합)
3. 대시보드 UI: Dashboard Overview + My Agents + Execution Reports
4. 기존 Chat UI -> 에이전트 상세 Tab 5로 이동
5. 2-3개 에이전트 템플릿 (DeFi Trader, Portfolio Monitor)

---

# Part 4: Market Research - AI Agent Autonomous Spending (2025-2026)

> Research Date: 2026-02-10
> Context: "에이전트 지갑 + 예산 관리 + 감사 기록" 대시보드 프로토타입에서 에이전트의 자율 지출을 가장 효과적으로 시연하는 방법 조사

## 1. 경쟁사 자율 지출 데모 분석

### 1-1. Coinbase AgentKit / x402 Protocol

**자율 지출 방식:**
- x402 HTTP 결제 프로토콜 - 에이전트가 API 호출 시 402 Payment Required 응답을 받으면 자동으로 USDC 결제
- 2025년 12월 기준 75M+ 트랜잭션, $24M 처리량
- "Pay-per-API-call" 모델 - 에이전트가 외부 서비스를 직접 구매

**데모 시나리오:**
- 에이전트가 날씨 API, 주가 API 등 외부 데이터를 x402로 구매
- Smart Wallet (가스리스) + Coinbase Onramp (법정화폐 → 크립토)

**한계:**
- 결제 인프라만 제공, 예산 관리/감사 대시보드 없음
- Base 체인 중심의 생태계 의존성
- "무엇을 샀는지"는 보이지만 "왜 샀는지, 예산 내인지"는 추적 불가

### 1-2. ElizaOS Spartan (ai16z)

**자율 지출 방식:**
- Unified Agent Wallet으로 멀티체인 자산 관리
- 에이전트가 DeFi 프로토콜과 직접 상호작용 (스왑, 스테이킹)
- Sui 플러그인(plugin-sui)으로 Sui 네트워크 토큰 운영

**데모 시나리오:**
- "Spartan" 에이전트가 DEX에서 자율 트레이딩
- 토큰 스왑, 유동성 공급, 포트폴리오 리밸런싱

**한계:**
- 개발자 중심 CLI 도구 - 비개발자용 대시보드 UI 없음
- 예산 한도, 지출 카테고리 등 관리 기능 미구현
- 에이전트가 "얼마나" 쓸 수 있는지 제한 불가

### 1-3. Virtuals Protocol (Luna, GAME)

**자율 지출 방식:**
- 에이전트 토큰화 → 에이전트 자체가 경제 주체
- GAME 프레임워크로 자율 의사결정 → 온체인 트랜잭션

**데모 시나리오:**
- Luna AI 에이전트가 Base 체인에서 자율 트레이딩
- 에이전트 토큰 가격이 에이전트 성과에 연동
- TikTok, X에서 에이전트가 자율적으로 컨텐츠 생성 + 토큰 홍보

**한계:**
- 투기/밈코인 성격이 강함 - 실용적 에이전트 관리 UX 부재
- 에이전트 소유자가 예산/지출을 통제하는 메커니즘 없음
- GAME Cloud 중단 → SDK만 남아 진입 장벽 상승

### 1-4. Skyfire

**자율 지출 방식:**
- AI 에이전트 전용 결제 네트워크
- USDC 에스크로 + 자동 정산
- 에이전트에게 "지갑" 할당 후 API 서비스 구매

**데모 시나리오:**
- 에이전트가 여러 AI 서비스(GPT-4, Claude 등)를 자율적으로 구매
- 결제 → 서비스 이용 → 정산의 자동화

**한계:**
- 순수 결제 인프라 - 에이전트 관리 대시보드 없음
- 예산 한도, 카테고리 제한 등 관리 기능 없음
- 중앙화된 에스크로 (온체인 감사 아님)

### 1-5. Google Agent-to-Agent Protocol (A2A/AP2)

**자율 지출 방식:**
- 에이전트 간 협업 프로토콜 (2025년 4월 발표)
- 에이전트가 다른 에이전트의 서비스를 발견하고 구매
- Agent Card로 에이전트 신원/능력 공개

**데모 시나리오:**
- "여행 예약 에이전트"가 항공편/호텔 에이전트에게 지출
- 멀티에이전트 워크플로우에서 자동 결제

**한계:**
- 프로토콜 표준만 제공 - 구현체 없음
- 예산 관리, 감사 기록은 범위 밖
- 웹2 중심 (온체인 아님)

### 1-6. OpenAI + Stripe ACP (Agent Commerce Protocol)

**자율 지출 방식:**
- Stripe 결제 인프라 위에 에이전트 결제 레이어
- 에이전트가 Stripe 가맹점에서 직접 구매

**데모 시나리오:**
- 쇼핑 에이전트가 온라인 스토어에서 물건 구매
- 법정화폐 결제 → 기존 상거래 생태계 활용

**한계:**
- 웹2 중심의 법정화폐 결제 - 온체인 감사 없음
- 에이전트 예산 관리는 Stripe 측에서 처리 (투명하지 않음)
- 온체인 증명 불가

### 1-7. Truth Terminal (Andy Ayrey)

**자율 지출 방식:**
- AI 에이전트가 자율적으로 $GOAT 밈코인 홍보 → 시가총액 $300M+
- Marc Andreessen으로부터 $50K BTC 수령 후 자율 사용

**시사점:**
- AI 에이전트의 자율 금융 활동이 실제 경제적 임팩트를 만들 수 있음을 증명
- 그러나 **통제/감사 메커니즘 전무** - "블랙박스" 그 자체
- **Baram-AER의 존재 이유를 가장 잘 보여주는 사례**: "Truth Terminal에 Baram이 있었다면?"

## 2. VC 투자 트렌드 (AI Agent Finance, 2025-2026)

| 기간 | 투자 규모 | 주요 라운드 | 트렌드 |
|------|----------|------------|--------|
| 2025 상반기 | ~$2.8B | Skyfire Series A, Turnkey Series B | 에이전트 인프라 초기 투자 |
| 2025 하반기 | ~$3.9B | AgentKit ecosystem, ElizaOS ecosystem | 프레임워크 생태계 확대 |
| 2026 전망 | ~$6.7B+ | Agent-native finance, compliance | 규제/감사 레이어에 관심 증가 |

**핵심 투자 트렌드:**
- **Phase 1 (2024-2025)**: 에이전트 생성/실행 프레임워크 (ElizaOS, Virtuals, CrewAI)
- **Phase 2 (2025-2026)**: 에이전트 결제/지갑 인프라 (AgentKit, Skyfire, Turnkey)
- **Phase 3 (2026~)**: 에이전트 거버넌스/감사/컴플라이언스 ← **Baram-AER 포지션**

> VC 관점에서 "에이전트가 돈을 쓸 수 있게 하는 인프라"에 투자가 집중되고 있으나,
> "에이전트가 쓴 돈을 추적하고 관리하는 레이어"는 아직 Blue Ocean이다.

## 3. Baram-AER의 유일한 포지션 확인

### 경쟁사 자율 지출 기능 비교

| 플랫폼 | 에이전트 지갑 | 자율 결제 | 예산 관리 | 지출 한도 | 온체인 감사 | 관리 대시보드 |
|--------|-------------|----------|----------|----------|------------|-------------|
| AgentKit/x402 | O | O | X | X | 부분적 | X |
| ElizaOS | O | O | X | X | X | X |
| Virtuals | X | O | X | X | X | 부분적 |
| Skyfire | O | O | X | X | X | X |
| Google A2A | X | 프로토콜만 | X | X | X | X |
| OpenAI+Stripe | X | O | X | X | X | X |
| Turnkey | O | X (지갑만) | X | O (정책 기반) | 감사 로깅 | X |
| **Baram-AER** | **O** | **O** | **O** | **O** | **O** | **O** |

> **결론**: 6개 핵심 기능을 모두 제공하는 플랫폼은 Baram-AER뿐이다.
> Turnkey가 가장 가까우나 인프라 레이어에 머물러 있고, 사용자 대면 대시보드와 온체인 감사 기록이 없다.

## 4. 데모 시나리오 분석 및 추천

### 4-1. 후보 시나리오 평가

| 시나리오 | 시각적 임팩트 | 기술 복잡도 | 스토리텔링 | 실현 가능성 | 종합 |
|---------|-------------|-----------|----------|-----------|------|
| A. DeFi Trader + Budget Guardian | **최고** | 중간 | **최고** | **높음** | **추천** |
| B. Research Bot (API 구매) | 중간 | 낮음 | 중간 | 높음 | 차선 |
| C. NFT 구매 에이전트 | 높음 | 높음 | 중간 | 낮음 | 보류 |
| D. 멀티에이전트 협업 | 높음 | 매우 높음 | 높음 | 낮음 | Phase 2 |

### 4-2. 추천: "DeFi Trader + Budget Guardian" 시나리오

**왜 이것이 최선인가:**

1. **"가게" 문제 해결**: Pado DEX(NBTC/NUSDC)가 에이전트의 실제 지출 대상을 제공
   - LP봇이 실시간 BTC 가격에 연동된 주문을 넣고 있어 "실제 시장"이 존재
   - 에이전트가 AI 분석 후 실제 DEX에서 거래 → 돈이 실제로 오감

2. **데모의 "킬러 모먼트"**:
   - 에이전트가 예산 내에서 자율 거래하는 것을 대시보드에서 실시간 관찰
   - **핵심 장면**: 에이전트가 일일 한도를 초과하려 할 때 → 온체인에서 TX 거부 → "Budget Guardian이 작동합니다"
   - 이 한 장면이 Baram-AER의 가치 전체를 설명함

3. **스토리텔링**:
   - "AI 트레이딩봇에게 50 NUSDC 예산을 줬습니다"
   - "봇이 BTC 가격을 분석하고, 매수 결정을 내리고, DEX에서 실제로 거래합니다"
   - "모든 결정이 AER(실행 보고서)로 기록되고, 대시보드에서 실시간으로 볼 수 있습니다"
   - "일일 한도 20 NUSDC를 초과하려 하면? - 온체인에서 자동 거부됩니다"

4. **기존 인프라 최대 활용**:
   - `@nasun/baram-sdk` → AI 추론 실행 + Budget 관리
   - `apps/pado/bots/lib/order-manager.ts` → DeepBook V3 주문 배치
   - `apps/pado/bots/lib/price-source.ts` → Binance 실시간 가격
   - 신규 개발 최소화, 기존 코드 재활용으로 빠른 구현 가능

### 4-3. 데모 플로우 설계

```
┌─ 5분 데모 플로우 ─────────────────────────────────────────────────┐
│                                                                    │
│  [1] 에이전트 생성 (대시보드)                                       │
│      → "DeFi Trader" 에이전트 등록, 키페어 생성                     │
│                                                                    │
│  [2] 예산 설정 (대시보드)                                           │
│      → 50 NUSDC 총 예산, 일일 20, 건당 최대 5                     │
│      → 카테고리: [trading, analysis]                                │
│      → 최소 간격: 30초                                              │
│                                                                    │
│  [3] AI 분석 실행 (자동)                                            │
│      → Baram 에스크로로 AI 추론: "Analyze BTC/USD market"          │
│      → AER 생성됨 → 대시보드에 실시간 표시                         │
│                                                                    │
│  [4] DEX 자율 거래 (자동)                                           │
│      → AI 응답 파싱 → "매수" 결정                                  │
│      → Pado DEX NBTC/NUSDC 풀에 limit order 배치                  │
│      → 체결 확인 → AER 기록                                        │
│                                                                    │
│  [5] 한도 초과 시도 (★ 킬러 모먼트)                                │
│      → 에이전트가 일일 한도(20 NUSDC) 초과 거래 시도               │
│      → TX abort → "E_DAILY_LIMIT_EXCEEDED"                        │
│      → 대시보드에 "Budget Guardian" 경고 표시                      │
│      → "이것이 Baram의 가치입니다"                                  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

# Part 5: Pado DEX Integration Analysis

> Research Date: 2026-02-10
> Context: Baram-AER 데모 에이전트의 거래 대상으로서의 Pado DEX 활용 가능성 분석

## 1. Pado DEX 현황

### 1-1. 아키텍처

- **CLOB 엔진**: DeepBook V3 (Sui 네이티브 Central Limit Order Book)
- **체인**: Nasun Devnet (Chain ID: 272218f1)
- **프론트엔드**: React + Vite (`apps/pado/frontend/`)

### 1-2. 활성 마켓

| 마켓 | Base | Quote | Pool ID | LP봇 |
|------|------|-------|---------|------|
| NBTC/NUSDC | NBTC | NUSDC | `0xa2b7...cd0` | Active |
| NETH/NUSDC | NETH | NUSDC | 별도 | Active |
| NSOL/NUSDC | NSOL | NUSDC | 별도 | Active |

### 1-3. LP봇 실시간 가격 연동

LP봇은 Binance API에서 실시간 BTC/ETH/SOL 가격을 가져와 DeepBook V3에 주문을 배치한다:

- **가격 소스**: Binance REST API (`api.binance.com/api/v3/ticker/price`)
- **업데이트 주기**: 10초
- **전략**: Grid 주문 (중심가 기준 ±0.1~0.5% 간격으로 매수/매도 주문)
- **재고 관리**: 인벤토리 스큐 조정 (보유 비율에 따라 매수/매도 가격 편향)

> **핵심**: NBTC/NUSDC 마켓에서 실제 BTC 가격에 연동된 "실시장"이 작동 중.
> 에이전트가 여기서 거래하면 "실제 가격에 실제 자산을 거래하는" 경험을 제공.

## 2. LP봇 코드 재활용 가능성

### 2-1. 재활용 가능한 모듈

| 모듈 | 파일 | 재활용 방법 |
|------|------|------------|
| **Order Manager** | `apps/pado/bots/lib/order-manager.ts` | DeepBook V3 주문 생성/취소/조회 함수 직접 재활용 |
| **Price Source** | `apps/pado/bots/lib/price-source.ts` | Binance 실시간 가격 조회 함수 직접 재활용 |
| **Orderbook** | `apps/pado/bots/lib/orderbook.ts` | Level 2 오더북 조회 함수 직접 재활용 |
| **Config** | `apps/pado/bots/lib/config.ts` | 마켓 설정 (Pool ID, 토큰 타입 등) 참조 |

### 2-2. 재활용 불가 / 신규 개발 필요

| 기능 | 이유 | 구현 방향 |
|------|------|----------|
| AI 의사결정 로직 | LP봇은 Grid 전략, 에이전트는 AI 분석 기반 | Baram SDK로 AI 추론 → 매수/매도 결정 |
| Budget 연동 | LP봇에는 예산 개념 없음 | `@nasun/baram-sdk`의 `executeWithBudget` 활용 |
| AER 생성 | LP봇에는 감사 기록 없음 | Witness 패턴으로 자동 생성 |
| 에이전트 키 관리 | LP봇은 관리자 키 사용 | 에이전트 전용 키페어 생성/관리 |

### 2-3. 기술적 구현 경로

```
데모 에이전트 스크립트 (scripts/demo-agent.ts)
│
├── @nasun/baram-sdk
│   ├── execute()          → AI 추론 요청 (BTC 시장 분석)
│   ├── executeWithBudget() → 예산에서 비용 차감 + AER 생성
│   └── createBudget()     → 에이전트용 Budget 생성
│
├── Pado LP Bot Libs (재활용)
│   ├── price-source       → Binance에서 현재 BTC 가격 조회
│   ├── order-manager      → DeepBook V3에 limit order 배치
│   └── orderbook          → 현재 오더북 상태 확인
│
└── 신규 로직
    ├── AI 응답 파싱       → "BUY 0.001 BTC at $98,500" 추출
    ├── Budget 한도 확인    → 일일 한도 잔여 확인
    └── 데모 시나리오 제어  → 한도 초과 시도 포함
```

## 3. x402 제외 근거 업데이트

기존 결론: "baram 에스크로로 충분하므로 x402는 Phase 2"
업데이트된 근거:

1. **Pado DEX가 "가게" 역할을 해결**: 에이전트가 실제로 돈을 쓸 수 있는 대상(NBTC/NUSDC 거래)이 이미 존재
2. **x402의 핵심 가치(외부 서비스 결제)가 프로토타입에 불필요**: 데모 시나리오에서 에이전트는 "외부 API 구매"가 아닌 "DeFi 거래"를 수행
3. **감사 추적이 자동**: baram 에스크로 + Witness 패턴으로 모든 지출이 AER로 기록. x402는 별도 AER 통합이 필요
4. **기존 인프라 최대 활용**: Pado LP봇 코드 재활용으로 신규 개발 최소화, x402 도입은 새로운 의존성 추가

> **결론**: Pado DEX가 실가격 거래 대상을 제공하므로 프로토타입에서 x402는 불필요.
> Phase 2에서 외부 에이전트 생태계 호환이 필요해질 때 도입.
