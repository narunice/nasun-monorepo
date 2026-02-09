# Baram-AER Full Code Review Brief

> **절대 규칙: 코드를 수정하지 마라.**
> 이 작업은 코드 리뷰 전용이다. 어떤 파일도 수정, 생성, 삭제하지 않는다.
> 발견된 문제점과 수정 권고안을 텍스트로만 출력하라.
> 코드 수정을 시도하면 작업 전체가 무효 처리된다.

## Mission

Baram-AER app의 전체 소스 코드(98개 파일, ~17,600줄)와 SDK(27개 파일, ~3,100줄)를 전수 조사한다. 이 코드는 **바이브코딩(LLM 생성) + 수동 수정**으로 작성되었으며, 프로덕션 배포 전에 코드 품질과 보안 취약점을 식별하는 것이 목적이다.

**결과물**: 발견된 문제점 목록과 우선순위화된 수정 권고안 (텍스트만). **코드 파일은 절대 수정하지 않는다.**

---

## 1. 프로젝트 개요

### Baram이란?

Baram은 **AI 추론 실행을 블록체인(Sui fork인 Nasun Devnet)에서 정산하는 프로토콜**이다.

핵심 플로우:
1. **사용자**: NUSDC(스테이블코인)로 AI 추론 요청 생성 (에스크로 결제)
2. **Executor**: AI 모델 실행 후 결과 해시를 온체인에 제출 (정산 증명)
3. **스마트컨트랙트**: 증명 검증 후 에스크로에서 Executor에게 대금 지급
4. **AER (AI Execution Report)**: 실행 메타데이터를 온체인에 영구 기록

두 가지 실행 모드:
- **Standard**: Lambda → Groq API → 온체인 정산 (평문)
- **Private (TEE)**: AWS Nitro Enclave 내에서 로컬 LLM 실행 (E2E 암호화, RSA+AES)

### 기술 스택

| 영역 | 기술 |
|------|------|
| 블록체인 | Nasun Devnet (Sui fork, Chain ID: `272218f1`) |
| 스마트컨트랙트 | Move (Sui Move) |
| 프론트엔드 | React 19, Vite 7, TypeScript 5.9, TailwindCSS 3.4 |
| 백엔드 (Standard) | AWS Lambda (Node.js), Groq API |
| 백엔드 (TEE) | AWS Nitro Enclave (enclave + host 이중 구조) |
| SDK | TypeScript, @mysten/sui SDK |
| 인프라 | AWS CDK |

### 보안 맥락

- **금전 관련**: NUSDC 에스크로, Budget 위임 시스템 — 취약점은 직접적인 자금 손실
- **암호화 통신**: TEE 모드에서 RSA-OAEP + AES-256-GCM E2E 암호화
- **온체인 영속성**: AER 데이터는 불변 — 잘못된 데이터가 기록되면 수정 불가
- **2인 팀, 부트스트랩 스타트업**: 자동화된 보안 도구나 별도 보안 팀 없음

---

## 2. 코드베이스 구조

```
apps/baram-aer/
├── contracts/                       # Core Move contracts (baram, budget, beta_access)
│   └── sources/
│       ├── baram.move               (533줄) — 에스크로, 요청 생성/정산/취소
│       ├── budget.move              (453줄) — 예산 위임 시스템
│       └── beta_access.move         (237줄) — 베타 액세스 화이트리스트
├── contracts-executor/              # Executor registration system
│   └── sources/
│       ├── executor.move            (1,028줄) — Executor 등록, 평판, 처리된 요청 추적
│       ├── executor_staking.move    (510줄) — 스테이킹 메커니즘
│       └── executor_tier.move       (351줄) — 티어 계산 (Bronze/Silver/Gold)
├── contracts-aer/                   # AI Execution Report (불변 감사 로그)
│   └── sources/
│       └── aer.move                 (441줄) — 8카테고리 31필드 실행 보고서
├── contracts-compliance/            # Compliance module
│   └── sources/
│       └── compliance.move          (371줄)
├── contracts-attestation/           # TEE attestation registry
│   └── sources/
│       └── attestation_registry.move (380줄)
├── cdk/                             # AWS CDK infra + Lambda executor
│   ├── bin/cdk.ts                   (45줄) — CDK app entry
│   ├── lib/baram-stack.ts           (156줄) — Lambda + API Gateway stack
│   └── lambda-src/executor/src/
│       ├── index.ts                 (395줄) — Lambda handler (요청 수신→실행→정산)
│       ├── services/ai.ts           (132줄) — Groq API 호출
│       ├── services/sui.ts          (513줄) — 온체인 트랜잭션 (정산, AER 생성)
│       └── types.ts                 (47줄)
├── executor-nitro/                  # TEE Executor (AWS Nitro Enclave)
│   ├── src/enclave/                 # Enclave 내부 (격리된 환경)
│   │   ├── main.ts                  (455줄) — vsock 서버, 요청 처리 루프
│   │   ├── crypto.ts                (243줄) — RSA/AES 암호화, 키 관리
│   │   ├── inference.ts             (385줄) — llama.cpp 바인딩
│   │   ├── attestation.ts           (600줄) — Nitro attestation document 생성
│   │   ├── local-llm.ts             (191줄) — 로컬 LLM 래퍼
│   │   └── debug-main.ts            (78줄) — 개발용 디버그 진입점
│   ├── src/host/                    # Host (enclave 외부, 네트워크 접근 가능)
│   │   ├── main.ts                  (104줄) — Host 진입점
│   │   ├── server.ts                (466줄) — HTTP 서버 (요청 수신→enclave 전달)
│   │   ├── sui-client.ts            (663줄) — 온체인 정산 (host→chain)
│   │   └── vsock-client.ts          (436줄) — vsock을 통한 enclave 통신
│   ├── src/shared/
│   │   ├── protocol.ts              (283줄) — 메시지 프로토콜 정의
│   │   └── vsock.ts                 (435줄) — vsock 유틸리티
│   ├── src/test-client.ts           (180줄)
│   └── scripts/decay-reputation.ts  (147줄)
├── frontend/                        # React SPA
│   └── src/
│       ├── App.tsx                  (186줄)
│       ├── main.tsx                 (86줄)
│       ├── config/
│       │   ├── network.ts           (180줄) — 모든 설정 (RPC, 컨트랙트 주소, 모델 가격 등)
│       │   ├── client.ts            (8줄)
│       │   └── attestation.ts       (15줄)
│       ├── stores/
│       │   ├── chatStore.ts         (477줄) — Zustand 채팅 상태
│       │   └── budgetStore.ts       (134줄)
│       ├── features/request/
│       │   ├── hooks/
│       │   │   ├── useCreateRequest.ts   (274줄) — 핵심: 요청 생성 오케스트레이션
│       │   │   ├── useExecutors.ts       (315줄) — Executor 목록 조회 + 가중 랜덤 선택
│       │   │   ├── useRequestWithRetry.ts (148줄)
│       │   │   ├── useAttestation.ts     (126줄)
│       │   │   └── useAER.ts            (30줄)
│       │   ├── services/
│       │   │   ├── transactionBuilder.ts (179줄) — PTB 구성
│       │   │   ├── aerService.ts         (190줄) — AER 온체인 조회
│       │   │   └── coinService.ts        (58줄) — NUSDC coin 관리
│       │   └── components/
│       │       ├── ExecutionReport.tsx    (112줄) — AER 모달
│       │       └── AttestationDisplay.tsx (152줄)
│       ├── hooks/
│       │   ├── useBudgets.ts        (243줄) — Budget CRUD
│       │   ├── useNFTGate.ts        (121줄)
│       │   ├── useWalletSession.ts  (74줄)
│       │   └── useIdleTimeout.ts    (70줄)
│       ├── components/
│       │   ├── chat/ (AssistantMessage, UserMessage, MessageList)
│       │   ├── sidebar/ (Sidebar, BudgetCard, BudgetDetail, BudgetSection, ...)
│       │   ├── input/ (ChatInput, InputFooter)
│       │   ├── empty/ (LandingScreen, WelcomeScreen, NFTGateScreen, SuggestionCard)
│       │   ├── receipt/ (OnChainReceiptContent, LocalReceiptContent, CopyableHash, ...)
│       │   ├── modals/ (CreateBudgetModal)
│       │   ├── badges/ (TierBadge)
│       │   └── theme/ (ThemeProvider, ThemeToggle)
│       ├── services/
│       │   ├── chatStorage.ts       (324줄) — IndexedDB 채팅 영속성
│       │   ├── chatCrypto.ts        (187줄) — 로컬 채팅 암호화 (AES-GCM)
│       │   └── contextBuilder.ts    (153줄)
│       ├── utils/
│       │   ├── tee.ts               (119줄) — TEE 암호화 (RSA+AES, E2E)
│       │   ├── crypto.ts            (149줄) — Web Crypto API 유틸리티
│       │   ├── format.ts            (59줄) — 숫자/날짜 포맷
│       │   ├── suiPagination.ts     (39줄) — Sui 동적 필드 페이지네이션
│       │   ├── executor.ts          (29줄) — Executor 스코어링 유틸리티
│       │   ├── encoding.ts          (39줄)
│       │   └── budget.ts            (13줄)
│       ├── types/chat.ts            (179줄)
│       ├── layouts/ChatLayout.tsx    (77줄)
│       └── pages/AuthCallback.tsx   (28줄)

packages/baram-sdk/                  # SDK (npm 패키지)
└── src/
    ├── client.ts                    (678줄) — 메인 클라이언트 클래스
    ├── config.ts                    (57줄)
    ├── errors.ts                    (77줄)
    ├── types.ts                     (279줄)
    ├── index.ts                     (102줄)
    ├── services/
    │   ├── budget.ts                (354줄) — Budget CRUD
    │   ├── executor.ts              (223줄) — Executor 조회
    │   ├── tee.ts                   (192줄) — TEE 암호화 (SDK용)
    │   ├── aer.ts                   (129줄) — AER 조회
    │   ├── transaction.ts           (71줄)
    │   ├── coin.ts                  (53줄)
    │   └── encoding.ts              (27줄)
    └── __tests__/ + __e2e__/        (테스트 파일들)
```

---

## 3. 리뷰 범위 및 체크리스트

### 3A. 스마트컨트랙트 (Move) — 최우선

**파일**: `contracts/sources/*.move`, `contracts-executor/sources/*.move`, `contracts-aer/sources/aer.move`

| # | 점검 항목 | 세부 내용 |
|---|-----------|----------|
| M1 | 에스크로 자금 안전성 | `baram.move`의 create_request, submit_proof, cancel_request에서 NUSDC Balance가 이중 인출되거나 잠기는 경로가 없는지 |
| M2 | 정산 조건 검증 | submit_proof에서 executor 자격, 타임아웃, 상태 전이(Pending→Executing→Settled)가 빈틈없는지 |
| M3 | Budget 위임 보안 | `budget.move`의 create_request_with_budget에서 agent 권한, 잔액 차감, 모델/executor 제약이 우회 불가능한지 |
| M4 | 정수 오버플로우 | 모든 u64 연산(balance, price, fee)에서 오버플로우/언더플로우 가능성 |
| M5 | 접근 제어 | AdminCap 사용 일관성, owner-only 함수에서의 인증, 공유 객체 접근 패턴 |
| M6 | 이벤트 정확성 | emit되는 이벤트의 필드가 실제 상태 변경과 일치하는지 |
| M7 | Executor 평판 조작 | executor.move에서 평판/스테이킹/티어 계산이 self-dealing로 조작 가능한지 |
| M8 | AER 불변성 | aer.move의 create_report가 기존 레코드 덮어쓰기, requestId 충돌을 방지하는지 |
| M9 | 타임아웃 로직 | 에스크로 타임아웃(cancel vs settle) 경합 조건, Clock 객체 사용의 정확성 |
| M10 | 미사용/미배포 코드 | compliance.move, attestation_registry.move가 다른 모듈에서 참조되는지, 데드 코드 여부 |

### 3B. Lambda Executor (Node.js) — 높은 우선순위

**파일**: `cdk/lambda-src/executor/src/`

| # | 점검 항목 | 세부 내용 |
|---|-----------|----------|
| L1 | 입력 검증 | Lambda handler의 event body 파싱에서 모든 필드가 검증되는지 (requestId, model, prompt 등) |
| L2 | 인증/인가 | API Gateway → Lambda 호출 시 인증 방식, 무허가 호출 가능성 |
| L3 | Groq API 호출 보안 | API 키 관리, 타임아웃, 에러 핸들링, 응답 검증 |
| L4 | 온체인 트랜잭션 보안 | sui.ts의 PTB 구성, BCS 직렬화, 가스 예산, 재시도 로직 |
| L5 | 에러 처리 | 실패 시 에스크로 자금 상태 (stuck 가능성), 부분 실패 복구 |
| L6 | AER 데이터 정확성 | create_report에 전달되는 31개 필드의 값이 실제 실행 결과와 일치하는지 |
| L7 | 비밀 관리 | 환경변수로 전달되는 키(Groq API key, Executor private key)의 노출 가능성 |
| L8 | 동시성 | 같은 requestId에 대한 중복 Lambda 실행 방지 |

### 3C. Nitro Enclave Executor — 높은 우선순위

**파일**: `executor-nitro/src/`

| # | 점검 항목 | 세부 내용 |
|---|-----------|----------|
| N1 | vsock 통신 보안 | enclave ↔ host 간 메시지 무결성, 버퍼 오버플로우, 메시지 인젝션 |
| N2 | 암호화 구현 | RSA-OAEP 키 생성, AES-256-GCM 암/복호화, 키 교환 플로우의 정확성 |
| N3 | 키 관리 | RSA 프라이빗 키의 생성, 저장, 폐기 라이프사이클 |
| N4 | Attestation | Nitro attestation document 생성/검증 로직의 완전성 |
| N5 | 로컬 LLM 격리 | inference.ts의 llama.cpp 호출이 명령어 인젝션 등에 취약하지 않은지 |
| N6 | Host-Enclave 프로토콜 | protocol.ts의 메시지 타입, 직렬화/역직렬화 안전성 |
| N7 | 재시도 로직 | 정산 실패 시 재시도 횟수, 백오프, 최대 대기 시간 |
| N8 | 시뮬레이션 모드 | `requireEncryption=false` 경로가 프로덕션에서 활성화 불가능한지 |
| N9 | 메모리 관리 | 키 자료(AES/RSA)가 사용 후 메모리에서 적절히 클리어되는지 |

### 3D. 프론트엔드 (React) — 중간 우선순위

**파일**: `frontend/src/`

| # | 점검 항목 | 세부 내용 |
|---|-----------|----------|
| F1 | XSS | 서버/executor 응답이 DOM에 렌더링되는 모든 경로 (AssistantMessage, OnChainReceiptContent, 에러 메시지) |
| F2 | 암호화 키 관리 | tee.ts의 AES 키 Map, chatCrypto.ts의 로컬 암호화 키가 적절히 관리되는지 |
| F3 | 프라이빗 키 노출 | 지갑 프라이빗 키가 콘솔, 네트워크, localStorage 등에 노출되는 경로 |
| F4 | CSRF/요청 위조 | executor 엔드포인트 호출 시 인증/검증 |
| F5 | 상태 관리 일관성 | chatStore.ts(477줄)의 상태 전이 중 불일치 가능성 |
| F6 | 동시성 문제 | 동시 요청 시 코인 버전 충돌, AES 키 덮어쓰기, 상태 경합 |
| F7 | 에러 UI | 에러 메시지가 사용자에게 기술적 내부 정보(주소, 해시 등)를 노출하는지 |
| F8 | 입력 검증 | ChatInput, CreateBudgetModal 등에서 사용자 입력 검증의 충분성 |
| F9 | 코드 복잡도 | 단일 함수가 200줄 이상인 경우 (useCreateRequest의 createRequest 등), 코드 분할 필요성 |
| F10 | 미사용 코드 | import는 있지만 사용되지 않는 변수, 함수, 컴포넌트 |

### 3E. SDK (baram-sdk) — 중간 우선순위

**파일**: `packages/baram-sdk/src/`

| # | 점검 항목 | 세부 내용 |
|---|-----------|----------|
| S1 | 트랜잭션 구성 | PTB(Programmable Transaction Block) 구성의 정확성, 가스 예산 |
| S2 | 코인 관리 | 코인 병합/분할 로직, 잔액 부족 시 에러 핸들링 |
| S3 | 타입 안전성 | 온체인 데이터 파싱에서 as 캐스팅의 안전성 |
| S4 | 에러 처리 | BaramError 클래스 사용 일관성, catch 블록에서 에러 삼킴 |
| S5 | 페이지네이션 | getOwnedBudgets, getAgentBudgets의 페이지네이션 완전성, 무한 루프 방지 |
| S6 | TEE 클라이언트 | SDK 내 TEE 암호화 구현과 프론트엔드 구현의 일관성 |

---

## 4. 보안 집중 조사 영역

### 4A. 자금 플로우 추적

아래 경로에서 NUSDC가 이동하는 전체 플로우를 추적하고, 자금이 stuck되거나 이중 인출되는 경로가 없는지 확인:

```
[사용자 지갑] --create_request--> [에스크로 Balance]
[에스크로 Balance] --submit_proof--> [Executor 지갑] (정상 정산)
[에스크로 Balance] --cancel_request--> [사용자 지갑] (취소/타임아웃)

[사용자 지갑] --create_budget--> [Budget Balance]
[Budget Balance] --create_request_with_budget--> [에스크로 Balance]
[Budget Balance] --withdraw_from_budget--> [사용자 지갑]
[Budget Balance] --deactivate_budget--> [사용자 지갑] (잔액 전액 반환)
```

### 4B. 암호화 플로우 추적

TEE 모드의 E2E 암호화 전체 경로를 추적:

```
[프론트엔드]                      [Host]              [Enclave]
    |                               |                    |
    |-- GET /public-key ----------->|--vsock get_key-->  |
    |<- RSA public key -------------|<- RSA public key --|
    |                               |                    |
    | (AES key 생성, RSA로 AES key 암호화)               |
    | (AES로 prompt 암호화)                               |
    |                               |                    |
    |-- POST /execute (encrypted) ->|--vsock execute --> |
    |                               |   (RSA로 AES key 복호화)
    |                               |   (AES로 prompt 복호화)
    |                               |   (LLM 추론)
    |                               |   (AES로 응답 암호화)
    |<- encrypted response ---------|<- encrypted resp --|
    |                               |                    |
    | (저장된 AES key로 응답 복호화)                       |
```

점검 사항:
- AES 키가 프론트엔드 메모리/sessionStorage 밖으로 노출되는 경로
- RSA 키페어가 enclave 외부로 유출되는 경로
- 중간자(MitM) 공격 가능성 (host가 악의적인 경우)
- AES-GCM nonce 재사용 여부

### 4C. 온체인 데이터 신뢰성

프론트엔드에서 온체인 데이터를 가져와 표시하는 모든 경로에서:
- `as Record<string, unknown>` 타입 캐스팅 후 필드 접근의 안전성
- 악의적인 온체인 데이터(컨트랙트 조작)가 UI에 미치는 영향
- `JSON.parse()` 호출 시 예외 처리

---

## 5. 코드 품질 점검

### 5A. 아키텍처 패턴

| 점검 항목 | 기대치 |
|-----------|--------|
| 관심사 분리 | hooks는 상태 관리, services는 비즈니스 로직, utils는 순수 유틸리티 |
| 단일 책임 | 하나의 함수/파일이 하나의 역할만 담당 |
| 에러 전파 | 에러가 적절히 위로 전파되는지, 아니면 catch에서 삼켜지는지 |
| 상수 관리 | 매직 넘버 없이 명명된 상수 사용 |
| 타입 안전성 | `any`, `as`, `!` 사용 최소화 |

### 5B. 코드 냄새 (Code Smells)

다음 패턴을 발견하면 보고:
- 200줄 이상의 단일 함수
- 3단계 이상의 중첩된 조건문/콜백
- 동일한 코드가 2곳 이상에서 반복 (특히 트랜잭션 구성, 에러 핸들링)
- 미사용 import, 변수, 함수
- `// TODO`, `// FIXME`, `// HACK` 등 미해결 주석
- `console.log`/`console.warn`이 프로덕션 코드에 남아 있는 경우 (디버그용)
- catch 블록이 에러를 삼키는 경우 (`catch { }` 또는 `catch { /* ignore */ }`)

### 5C. 테스트 커버리지 갭

기존 테스트 현황:
- SDK 단위 테스트: `packages/baram-sdk/src/__tests__/` (5개 파일)
- SDK E2E 테스트: `packages/baram-sdk/src/__e2e__/` (5개 파일, 35개 시나리오)
- 프론트엔드/Lambda/Nitro: 테스트 없음

테스트가 없는 critical 경로를 식별:
- Lambda handler의 에러 경로
- TEE 암호화/복호화 유닛 테스트
- 프론트엔드 useCreateRequest의 상태 전이
- chatStore의 상태 일관성

---

## 6. 알려진 이슈 (이미 식별됨)

이미 식별되어 수정 완료 또는 인지된 이슈. **새로운 발견에 집중하기 위해 중복 보고 불필요**:

| # | 이슈 | 상태 |
|---|------|------|
| K1 | Groq API 타임아웃 누락 | 수정됨 (AbortController 60s) |
| K2 | Nitro 시뮬레이션 모드 평문 폴백 | 수정됨 (production guard) |
| K3 | Nitro 버퍼 오버플로우 | 수정됨 (pre-check + rate limit) |
| K4 | 재시도 exponential backoff 부재 | 수정됨 (Lambda + Nitro) |
| K5 | BCS 파라미터 입력 검증 | 수정됨 (hash/address 검증) |
| K6 | 에러 메시지 XSS | 수정됨 (고정 메시지 매핑) |
| K7 | getBalance() 첫 페이지만 조회 | 수정됨 (getBalance API 사용) |
| K8 | fetchBudgetsByOwner 페이지네이션 누락 | 수정됨 (커서 기반 페이지네이션) |
| K9 | TEE AES 키 동시성 문제 (단일 변수) | 수정됨 (Map<requestId, key>) |
| K10 | pendingAesKeys Map 무한 증가 가능 | 인지됨, 미수정 |
| K11 | aerService 50개 이벤트 제한 | 인지됨, 미수정 |
| K12 | Nitro backoff 최대 17분 대기 | 인지됨, 미수정 |
| K13 | fetchBudgetsByOwner 무한 루프 방지 없음 | 인지됨, 미수정 |

---

## 7. 결과물 형식

> **다시 한번 강조: 코드 파일을 수정하지 마라.** Read/검색만 허용된다.
> 아래 형식에 맞춰 발견 사항을 **텍스트로만** 출력하라.

리뷰 결과를 아래 형식으로 정리:

### 7A. 발견 사항 (Findings)

각 발견 사항을:

```
### [SEVERITY-NUMBER] 제목
- **심각도**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **파일**: 파일경로:줄번호
- **카테고리**: Security / Code Quality / Architecture / Performance / Correctness
- **설명**: 무엇이 문제인지 구체적으로
- **영향**: 이 문제가 악용/발생하면 어떤 결과를 초래하는지
- **권고**: 어떻게 수정해야 하는지
- **관련 코드**: 문제 코드 스니펫 (5줄 이내)
```

### 7B. 심각도 기준

| 심각도 | 기준 |
|--------|------|
| CRITICAL | 자금 손실, 암호화 키 노출, 온체인 데이터 조작 가능 |
| HIGH | 서비스 중단, 데이터 무결성 위반, 인증 우회 |
| MEDIUM | 기능 오작동, 에지 케이스 에러, 정보 노출 |
| LOW | 코드 품질, 유지보수성, 성능 비효율 |
| INFO | 개선 제안, 베스트 프랙티스 불일치 |

### 7C. 최종 요약

- 총 발견 사항 수 (심각도별)
- 즉시 수정 필요 항목 (CRITICAL/HIGH)
- 프로덕션 배포 전 필수 수정 항목
- 후속 작업으로 미룰 수 있는 항목

---

## 8. 파일 제공 순서

리뷰 효율을 위해 아래 순서로 파일을 제공한다:

### Phase 1: Move 스마트컨트랙트 (6개 파일, ~3,700줄) — 가장 위험
1. `contracts/sources/baram.move` (533줄)
2. `contracts/sources/budget.move` (453줄)
3. `contracts-executor/sources/executor.move` (1,028줄)
4. `contracts-executor/sources/executor_staking.move` (510줄)
5. `contracts-executor/sources/executor_tier.move` (351줄)
6. `contracts-aer/sources/aer.move` (441줄)

### Phase 2: Backend Executors (8개 파일, ~2,800줄) — 정산 + 암호화
7. `cdk/lambda-src/executor/src/index.ts` (395줄)
8. `cdk/lambda-src/executor/src/services/sui.ts` (513줄)
9. `cdk/lambda-src/executor/src/services/ai.ts` (132줄)
10. `executor-nitro/src/enclave/main.ts` (455줄)
11. `executor-nitro/src/enclave/crypto.ts` (243줄)
12. `executor-nitro/src/host/server.ts` (466줄)
13. `executor-nitro/src/host/sui-client.ts` (663줄)
14. `executor-nitro/src/enclave/inference.ts` (385줄)

### Phase 3: Frontend Critical Path (8개 파일, ~2,200줄) — 사용자 자금 접점
15. `frontend/src/features/request/hooks/useCreateRequest.ts` (274줄)
16. `frontend/src/features/request/hooks/useExecutors.ts` (315줄)
17. `frontend/src/hooks/useBudgets.ts` (243줄)
18. `frontend/src/utils/tee.ts` (119줄)
19. `frontend/src/utils/crypto.ts` (149줄)
20. `frontend/src/services/chatCrypto.ts` (187줄)
21. `frontend/src/stores/chatStore.ts` (477줄)
22. `frontend/src/features/request/services/transactionBuilder.ts` (179줄)

### Phase 4: SDK (7개 파일, ~1,700줄)
23. `packages/baram-sdk/src/client.ts` (678줄)
24. `packages/baram-sdk/src/services/budget.ts` (354줄)
25. `packages/baram-sdk/src/services/executor.ts` (223줄)
26. `packages/baram-sdk/src/services/tee.ts` (192줄)
27. `packages/baram-sdk/src/services/aer.ts` (129줄)
28. `packages/baram-sdk/src/types.ts` (279줄)

### Phase 5: 나머지 프론트엔드 (잔여 ~60개 파일)
29~98. 나머지 컴포넌트, 유틸, 설정 파일들

---

## 9. 참고 사항

- **Nasun Devnet**은 Sui의 fork이다. Sui Move의 모든 표준 기능(shared objects, dynamic fields, Table, Balance 등)을 지원한다.
- **NUSDC**는 6 decimals (1,000,000 = 1 NUSDC). 네이티브 토큰은 NASUN (9 decimals).
- **SUI_CLOCK_ID = `0x6`**: Sui의 시스템 Clock 객체.
- Move에서 `#[allow(unused_const)]`는 의도적인 예약 상수에 사용된다.
- 프론트엔드는 `@nasun/wallet` 패키지의 zkLogin(Google OAuth)을 사용한다.
- CDK 인프라는 AWS Lambda + API Gateway 구조이며, VPC 외부에 있다.
