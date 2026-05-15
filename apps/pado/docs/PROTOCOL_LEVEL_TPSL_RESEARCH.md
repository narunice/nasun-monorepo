# Nasun L1 프로토콜 레벨 조건부 주문 (TP/SL) 구현 리서치 보고서

> **목적**: Pado DEX의 TP/SL 조건부 주문을 Hyperliquid 수준의 밸리데이터 레벨 실행으로 업그레이드하기 위한
> 기술 리서치, 실현 가능성 분석, 구현 경로 설계.
>
> **작성일**: 2026-02-15
> **버전**: v4.2 (외부 기술 타당성 심층 리뷰 반영 — Oracle 우선순위 + Authorized Entry 대안)
> **상태**: v4.2 확정 — 구현 착수 권고 (외부 리뷰어 9.5/10 평가)
> **리뷰 이력**: Claude Opus → Perplexity → ChatGPT → Gemini → ChatGPT v2 → Gemini v2 → Claude Opus v2 → 외부 피드백 2건 → Claude Opus v3 → Perplexity v4 → Claude Opus v4 → AI 리뷰어 v4.1 → Claude Opus v4.1 → 외부 기술 타당성 리뷰 v4.2 → Claude Opus v4.2
> **다음 단계**: Phase 1 Move 모듈 구현 착수

---

## 목차

1. [배경 및 현재 상태](#1-배경-및-현재-상태)
2. [경쟁 플랫폼 TP/SL 구현 사례 분석](#2-경쟁-플랫폼-tpsl-구현-사례-분석)
3. [사용자 선호도 및 시장 데이터](#3-사용자-선호도-및-시장-데이터)
4. [Nasun Sui Fork 구조 분석](#4-nasun-sui-fork-구조-분석)
5. [Sui 프로토콜 업그레이드 메커니즘](#5-sui-프로토콜-업그레이드-메커니즘)
6. [결정론성 보장 원리](#6-결정론성-보장-원리)
7. [구현 경로 분석](#7-구현-경로-분석)
8. [v2 아키텍처 상세 설계](#8-v2-아키텍처-상세-설계)
9. [Upstream 추종 전략 및 리스크](#9-upstream-추종-전략-및-리스크)
10. [권장 접근 방식](#10-권장-접근-방식)
11. [미해결 질문 및 추가 리서치 필요 항목](#11-미해결-질문-및-추가-리서치-필요-항목)
12. [AI 리뷰 로그](#12-ai-리뷰-로그)
13. [참고 자료](#13-참고-자료)

---

## 1. 배경 및 현재 상태

### 1.1 Pado DEX TP/SL 현재 구현

Pado DEX의 TP/SL 시스템은 3계층 하이브리드 구조로 되어 있다.

**계층 1 — 클라이언트 사이드 (브라우저 폴링)**
- 위치: 사용자 브라우저
- 저장소: localStorage (`pado:tpsl:orders`)
- 가격 피드: Oracle API 폴링 (3초 간격)
- 실행: 조건 충족 시 사용자 지갑으로 `placeMarketOrder()` 트랜잭션 직접 발생
- 한계: 탭을 닫으면 실행 불가, 기기 간 동기화 불가

**계층 2 — 서버 사이드 Keeper Bot (위임 모드)**
- 위치: EC2 서버 (PM2, Port 4001)
- 인증: CORS Origin 검증
- 권한: TradeCap 위임 (BalanceManager의 모든 풀 거래 권한)
- 가격 피드: Binance API 폴링 (10초 간격)
- 한계: 단일 서버 장애점 (SPOF), keeper 다운 시 실행 불가

**계층 3 — 프로토콜 레벨 (미구현 — 이 문서의 주제)**

### 1.2 문제 정의

DeepBook V3는 limit/market 주문만 지원한다. TP/SL, Stop-Limit, Trailing Stop 등 조건부 주문은
오프체인 keeper bot 또는 브라우저 폴링에 의존해야 하며, 이는 다음 문제를 야기한다:

1. **신뢰성**: 단일 서버 장애 시 TP/SL 미실행
2. **지연시간**: Keeper 10초 폴링 + 트랜잭션 전파 시간
3. **신뢰 모델**: 사용자가 keeper를 신뢰해야 함 (TradeCap 위임)
4. **UX 격차**: CEX/Hyperliquid 대비 열등한 사용자 경험

### 1.3 목표

Nasun L1 프로토콜 레벨에서 조건부 주문을 지원하여:
- Keeper 의존 제거 (또는 최소화)
- 밸리데이터가 자동으로 조건 평가 및 실행
- 탭을 닫아도, keeper가 다운되어도 TP/SL 실행 보장
- 0.5초 이내 트리거 지연시간

**핵심 제약**: Nasun은 Sui mainnet fork이므로, upstream 업데이트를 지속 추종해야 한다.

---

## 2. 경쟁 플랫폼 TP/SL 구현 사례 분석

### 2.1 Binance / Bybit (CEX) — 매칭 엔진 내장

**구현 방식:**
- 조건부 주문이 거래소 중앙 서버의 매칭 엔진(Matching Engine)에 저장됨
- 매칭 엔진이 실시간 가격을 밀리초 단위로 감시
- 조건 충족 시 즉시 시장가/지정가 주문으로 변환 실행
- 사용자는 브라우저를 닫아도 100% 실행 보장

**신뢰 모델:** 수탁형 (Custodial)
- 사용자 자산이 거래소에 예치되어 있으므로 거래소가 직접 실행 가능
- 거래소를 신뢰해야 함 (해킹, 서버 다운, 의도적 조작 리스크)

**기술적 특징:**
- 지연시간: 밀리초 단위
- 슬리피지: 최소 (깊은 유동성)
- 추가 비용: 없음
- 주문 저장: 중앙 데이터베이스

**Pado와의 관련성:**
- UX 기준점: Pado 경쟁분석에서 Bybit 91점, Binance 90점 (Pado 86점)
- 가격 피드 소스: Pado LP Bot과 Oracle이 Binance API에서 가격 소싱
- 아키텍처 차이: Pado는 비수탁형(Non-custodial) DEX이므로 이 방식 직접 적용 불가

### 2.2 Hyperliquid — 밸리데이터 합의 기반 온체인 실행

**아키텍처 개요:**
- 자체 L1 블록체인 (upstream fork가 아닌 독자 구축)
- HyperBFT 합의 메커니즘 (HotStuff 알고리즘 기반 커스텀 BFT)
- HyperCore: 거래 전용 실행 환경 (Rust 기반 VM)
- HyperEVM: 스마트컨트랙트 실행 환경 (EVM 호환)
- 두 환경이 동일한 HyperBFT 합의 아래에서 상태 공유

**조건부 주문 구현:**
- 모든 주문(limit, market, conditional 포함)이 **온체인 오더북**에 기록
- 오프체인 요소 없음 — 모든 것이 체인에 기록됨
- 밸리데이터들이 매 블록마다 deterministic price-time priority 매칭 로직 실행
- 조건부 주문은 "Untriggered" 상태로 오더북에 저장
- Mark Price가 트리거 가격에 도달하면 "Open" 상태로 전환
- 전환된 주문은 일반 limit/market 주문처럼 매칭

**지원 주문 타입:**
- Stop Market: 트리거 가격 도달 시 시장가 주문 (10% 슬리피지 허용)
- Stop Limit: 트리거 가격 도달 시 지정가 주문 (사용자가 슬리피지 제어)
- Take Profit: 이익 실현 주문
- TP/SL 연계: 진입 주문에 exit orders 묶기

**성능 지표:**
- 처리량: 초당 200,000 주문
- 지연시간: 중간값 0.1초, 99퍼센타일 0.5초 이내
- Finality: 서브초 (~0.2초)

**결정론적 실행 보장:**
- 모든 밸리데이터가 동일한 온체인 오더북 상태를 공유
- 같은 입력(오더북 상태 + 새 주문)에서 같은 매칭 결과 도출
- HyperBFT가 트랜잭션 순서에 합의 → 모든 밸리데이터가 같은 순서로 실행

**밸리데이터 요구사항:**
- Jailing 방지를 위해 1/3 이상 밸리데이터에 200ms 양방향 레이턴시 달성 권장

**신뢰 모델:** 탈중앙 (Trustless)
- 단일 서버 의존 없음
- 여러 밸리데이터가 검증하므로 조작 어려움

**Pado와의 관련성:**
- **아키텍처 유사성 높음**: 둘 다 CLOB (Central Limit Order Book) 기반
- Hyperliquid가 자체 L1을 처음부터 만들었기 때문에 upstream 추종 문제 없음
- Pado/Nasun은 Sui fork이므로 이 부분에서 근본적 차이

### 2.3 dYdX v4 — 밸리데이터 메모리 + 온체인 정산

**아키텍처 개요:**
- Cosmos SDK 기반 자체 앱체인 (dYdX Chain)
- 밸리데이터가 두 가지 역할 동시 수행:
  1. 오더북을 메모리(RAM)에 저장 및 유지
  2. 매칭 엔진 운영 및 거래 제안

**조건부 주문 구현:**
- 조건부 주문은 "stateful order"로 분류됨
- **블록체인 state에 저장** (메모리가 아닌 온체인)
- 밸리데이터가 재시작하면 블록체인 state에서 전체 오더북 재구성 가능
- 기술적 뉘앙스: 블록 N에서 제출된 stateful order는 **블록 N+1**에서 매칭 엔진에 진입 (1블록 지연)

**트리거 메커니즘:**
- Stop Limit: Oracle Price 또는 Last Traded Price가 Trigger Price를 교차할 때 발동
- Take Profit Market: Oracle Price 또는 Last Traded Price가 트리거 가격 교차 시 포지션 청산
- 트리거 후 동작: "Untriggered" → "Open" 상태 전환, 이후 일반 limit order처럼 매칭

**오프체인 매칭 흐름:**
1. 현재 proposer 노드가 오프체인 오더북에서 매칭 로직 실행
2. Buyer와 Seller를 매칭 (off-chain)
3. 매칭 결과(trades)를 다음 블록에 포함하여 제안
4. 합의를 통해 결과가 온체인에 확정

**신뢰 모델:** 탈중앙 (Trustless)
- 밸리데이터 합의로 매칭 결과 검증
- 2025년 10월 체인 정지(chain halt) 사건 이후 oracle sidecar 이슈 있었음

**Pado와의 관련성:**
- CLOB 기반이라는 점에서 아키텍처 유사
- Cosmos SDK 기반이므로 Sui/Move 환경에 직접 적용 어려움
- "온체인 저장 + 오프체인 매칭" 하이브리드 개념은 참고 가능

### 2.4 GMX v2 (Arbitrum) — Keeper 네트워크

**아키텍처 개요:**
- Arbitrum L2 위의 AMM 기반 DEX (오더북 없음)
- 유동성 풀(GM Pools) 기반 가격 결정
- 비동기 실행 모델: 사용자 주문 생성 → Keeper가 나중에 실행

**조건부 주문 구현:**
- 주문이 스마트컨트랙트(온체인)에 저장
- 사용자는 주문 생성 시 실행 수수료(Execution Fee)를 ETH로 예치
- Keeper(외부 봇 운영자)들이 블록체인 감시
- 조건 충족 시 Keeper가 `executeOrder()` 트랜잭션 전송
- Keeper는 실행 대가로 예치된 수수료 수령, 잔여 수수료 사용자에게 반환

**스마트컨트랙트 구조:**
- Router: 사용자 인터페이스 (주문 생성 진입점)
- ExchangeRouter: GM 유동성 풀 상호작용 진입점
- Handler: Keeper 인터페이스 (주문 실행 진입점)
- Vault: 비동기 실행 흐름에서 자산 임시 보관
- Data Storage: 주문/포지션 데이터

**알려진 문제점:**
- 슬리피지: 기본 1%, ADL(Auto-Deleveraging) 상황에서 무제한 슬리피지 발생 사례
- "오더북이 없으므로 limit order가 CEX와 다르게 작동" — 트리거 가격 도달 시 가장 가까운 oracle 가격에서 실행 시도
- Keeper 지연: 수초~수십초 (Keeper 반응 속도 의존)

**신뢰 모델:** 반탈중앙 (Semi-trustless)
- 누구나 Keeper가 될 수 있어 탈중앙화 요소 있음
- 하지만 Keeper가 없으면 주문 미실행 리스크

**Pado와의 관련성:**
- **아키텍처 불일치**: GMX는 AMM 기반, Pado는 CLOB 기반 — 근본적으로 다른 구조
- Crank 패턴 자체는 Pado에서 이미 사용 중 (Lottery 추첨, Lending 청산)
- 실행 수수료 모델은 Pado에 적용 가능하나, UX 열등

### 2.5 Sei Network (Cosmos SDK) — 프로토콜 내장 CLOB + EndBlocker

**아키텍처 개요:**
- Cosmos SDK + Tendermint(CometBFT) 기반 L1
- 프로토콜 레벨에 CLOB/DLOB 모듈 내장
- 독립적 마켓의 주문은 병렬 처리, 같은 마켓 내 주문은 순차 처리

**조건부 주문 구현 — EndBlocker 패턴:**
- Cosmos SDK의 `EndBlocker` hook 활용
- 각 블록 끝에서 registered hooks 실행:
  - BeginBlock: 주문 사전 준비
  - EndBlock: 매칭/정산 후 사후 로직
- `Module manager`의 `SetOrderEndBlockers()`로 실행 순서 명시적 설정
- 전체 네트워크의 모든 밸리데이터가 동일한 순서로 실행

**Oracle 가격 결정:**
- 밸리데이터들이 voting period(1블록 가능)에 환율(exchange rate) 제안
- EndBlock에서 stake-weighted median 계산
- 모든 밸리데이터가 같은 투표 데이터 → 같은 median 값 → 결정론적

**Pado와의 관련성:**
- Sui에는 Cosmos SDK의 EndBlocker에 직접 대응하는 메커니즘이 없음
- 하지만 Sui의 `ConsensusCommitPrologue` 시스템 트랜잭션이 유사한 역할 가능
- "프로토콜 레벨 CLOB"이라는 개념은 Pado/DeepBook과 유사

### 2.6 Injective Protocol — 프로토콜 레벨 Exchange Module

**아키텍처 개요:**
- Cosmos SDK 기반
- 프로토콜 레벨에 Exchange Module 내장 (spot/derivative 거래 담당)
- Auction, Insurance, Oracle, Peggy 모듈과 긴밀히 통합

**조건부 주문 트리거 메커니즘:**
- `TAKE_SELL` 주문 타입: oracle price가 trigger price 이하로 떨어지면 자동 sell 실행
- Pyth Oracle 통합: 200+ price feeds, permissionless 접근
- Pull oracle 모델: 필요 시 온체인으로 price update pull

**Pado와의 관련성:**
- Exchange Module이 온체인 오더북 + 조건부 주문을 통합 관리하는 모델
- Oracle module이 조건부 주문 트리거의 reference source 역할
- Pado의 `pado_oracle`이 이미 유사한 역할 수행 중

---

## 3. 사용자 선호도 및 시장 데이터

### 3.1 Perp DEX 시장 점유율 (2025-2026)

- **Hyperliquid**: 피크 80% (2025년 8월) → 현재 약 38% (경쟁 심화)
- 2025년 10월 기준 $299B 거래량, DEX-CEX spot 거래 점유율 22%
- Aster DEX 등 인센티브 기반 경쟁자 등장으로 점유율 하락 중

### 3.2 트레이더 선호도 비교

**Hyperliquid가 선호되는 이유:**
1. 실행 품질 및 속도: 서브초 결제, 0.01% 미만 슬리피지 ($10K-$50K 거래)
2. 수수료: 가장 저렴 (maker 0.01%, taker 0.035%)
   - $1M/월 거래량 기준: Hyperliquid $350 vs GMX $1,000+
3. 고급 주문 타입: TWAP, limit, market, stop, take-profit
4. "CEX 같은 느낌의 DEX" — 가장 높은 찬사
5. 커스터마이저블 인터페이스, 전용 모바일 앱

**커뮤니티 평가 (2026년 1월 기준 티어 리스트):**
- S-tier: Hyperliquid, edgeX
- A-tier: Lighter, variational, extendedapp, dYdX
- B-tier: pacifica, reya, GMX
- C-tier: hibachi, Aster
- D-tier: OfficialApeX

**GMX에 대한 평가:**
- "AMM 기반이라 프로 트레이더에게는 부족"
- "Keeper 실행 지연과 슬리피지가 문제"
- "심플한 인터페이스로 소매 거래자에게는 적합"

**dYdX에 대한 평가:**
- "프로 트레이더 도구"
- "MEV 방지 아키텍처가 장점"
- "2025년 10월 체인 정지 사건 이후 운영 안정성에 의문"

### 3.3 Pado 포지셔닝과의 시사점

- Pado 경쟁분석 문서에서 Pado 86/100점 (Bybit 91, Binance 90, Hyperliquid 75, dYdX 72, Jupiter 54)
- **전략 방향**: 기능 엔진 경쟁이 아닌 "Finance-First Social" 차별화
- 하지만 TP/SL 실행 품질은 기본 기대치(table stakes)에 해당 — 이것이 부족하면 다른 차별화가 무의미

---

## 4. Nasun Sui Fork 구조 분석

### 4.1 저장소 개요

- 경로: `/home/naru/my_apps/nasun-devnet/`
- 원본(upstream): `upstream/MystenLabs/sui.git`
- Nasun 저장소: `origin/main` (narunice/nasun-devnet)
- Fork 기반: Sui mainnet **v1.63.3**
- 현재 upstream 대비 갭: ~4-5 patch 버전 (v1.64.0+)

### 4.2 Nasun의 현재 커스터마이제이션 수준

**핵심 사실: Nasun은 현재 "vanilla Sui fork"이다.**

- 모든 커밋이 `docs:` 또는 `chore:` prefix — Sui 코어 코드 수정 **제로**
- 커스터마이즈된 항목:
  - Genesis config (밸리데이터 세트, 토큰 공급량, 에포크 기간)
  - Chain ID: `272218f1`
  - 배포 스크립트 및 운영 문서
- Sui 프로토콜 코드, 합의 로직, 실행 엔진은 **일절 수정되지 않음**

### 4.3 Sui 핵심 아키텍처 (Nasun이 상속한 구조)

```
nasun-devnet/sui/
├── consensus/                        # Mysticeti 합의 엔진
│   ├── core/                         #   핵심 합의 로직
│   ├── config/                       #   합의 설정
│   └── types/                        #   합의 타입
├── crates/
│   ├── sui-core/                     # 권한(Authority) 노드 구현
│   │   └── src/
│   │       ├── authority.rs          #   권한 상태 (271KB, 매우 큰 파일)
│   │       ├── consensus_handler.rs  #   합의 출력 처리 (3,400+ 줄)
│   │       ├── consensus_adapter.rs  #   합의 통신 (1,970+ 줄)
│   │       ├── execution_scheduler/  #   트랜잭션 실행 스케줄링
│   │       │   ├── execution_scheduler_impl.rs  (700+ 줄)
│   │       │   └── funds_withdraw_scheduler/
│   │       └── transaction_driver/   #   트랜잭션 제출/재시도
│   ├── sui-types/                    # 핵심 타입 정의
│   │   └── src/
│   │       ├── messages_consensus.rs #   ConsensusTransactionKind enum
│   │       ├── transaction.rs        #   트랜잭션 타입
│   │       └── base_types.rs         #   기본 타입
│   ├── sui-protocol-config/          # 프로토콜 버전 및 기능 플래그
│   │   └── src/lib.rs                #   ProtocolConfig 정의
│   ├── sui-node/                     # 밸리데이터 노드 구현
│   ├── sui-execution/                # 실행 엔진
│   ├── sui-framework/                # Move 프레임워크
│   │   └── packages/
│   │       ├── sui-framework/        #   핵심 프레임워크
│   │       ├── sui-system/           #   시스템 패키지
│   │       ├── move-stdlib/          #   Move 표준 라이브러리
│   │       ├── deepbook/             #   DeepBook (CLOB)
│   │       └── bridge/               #   브릿지
│   └── [100+ 다른 크레이트들]
```

### 4.4 트랜잭션 처리 파이프라인

Sui에서 트랜잭션이 처리되는 전체 경로:

```
Step 1: TRANSACTION SUBMISSION
  Client → TransactionDriver (sui-core/src/transaction_driver/)
    ├── transaction_submitter.rs: TX 검증 + 권한 전파
    ├── effects_certifier.rs: 인증서 생성
    └── request_retrier.rs: 재시도 로직

Step 2: CONSENSUS ORDERING
  Authority → ConsensusAdapter (sui-core/src/consensus_adapter.rs)
    ├── TX가 Mysticeti 합의 레이어로 전송
    └── 모든 밸리데이터가 TX 순서에 동의

Step 3: CONSENSUS HANDLER  ★ 조건부 주문 삽입 후보 지점 ★
  ConsensusHandler::handle_consensus_output()
  (sui-core/src/consensus_handler.rs)
    ├── Input: CertifiedBlocksOutput (합의로부터)
    ├── Process:
    │   ├── 합의 블록에서 트랜잭션 파싱
    │   ├── 필터링 및 격리 (공유 객체 처리)
    │   ├── 공유 객체 버전 할당
    │   ├── ConsensusCommitPrologue 시스템 TX 생성  ★ 참고 패턴 ★
    │   └── ExecutionScheduler로 큐잉
    └── 특성: 모든 밸리데이터가 동일하게 실행 (결정론적)

Step 4: EXECUTION SCHEDULER  ★ 조건부 주문 삽입 후보 지점 ★
  ExecutionScheduler::schedule_transaction()
  (sui-core/src/execution_scheduler/execution_scheduler_impl.rs)
    ├── Input: 큐된 트랜잭션들
    ├── 의존성 검사 (객체 잠금)
    ├── 비충돌 TX 병렬 실행
    └── Ready certificate를 execution_cache로 전송

Step 5: EXECUTION (Move VM)
  ExecutionCache::commit_transactions()
    ├── Move 코드 실행
    ├── 상태 업데이트
    ├── 이벤트 발행
    └── 스토리지 기록

Step 6: FINALIZATION
  체크포인트 완료 → State root 커밋 → RPC 인덱싱
```

### 4.5 ConsensusTransactionKind 전체 목록

파일: `sui-types/src/messages_consensus.rs`

```rust
pub enum ConsensusTransactionKind {
    CertifiedTransaction(Box<CertifiedTransaction>),
    CheckpointSignature(Box<CheckpointSignatureMessage>),
    EndOfPublish(AuthorityName),
    CapabilityNotification(AuthorityCapabilitiesV1),
    NewJWKFetched(AuthorityName, JwkId, JWK),
    RandomnessStateUpdate(u64, Vec<u8>),          // deprecated
    RandomnessDkgMessage(AuthorityName, Vec<u8>),
    RandomnessDkgConfirmation(AuthorityName, Vec<u8>),
    CapabilityNotificationV2(AuthorityCapabilitiesV2),
    UserTransaction(Box<Transaction>),
    ExecutionTimeObservation(ExecutionTimeObservation),
    CheckpointSignatureV2(Box<CheckpointSignatureMessage>),
    UserTransactionV2(Box<PlainTransactionWithClaims>),
}
```

이 enum에 새 variant를 추가하는 것은 append-only 패턴으로 충돌 리스크가 낮다.

### 4.6 DeepBook의 위치

**DeepBook은 프로토콜 레벨이 아닌 Move 프레임워크 패키지**로만 존재:

```
sui-framework/packages/deepbook/sources/
├── clob.move           # v1 (레거시)
├── clob_v2.move        # v2 (현재 사용)
├── custodian.move      # v1
├── custodian_v2.move   # v2
├── critbit.move        # Red-Black Tree CLOB 인덱스
├── math.move
└── order_query.move
```

- 밸리데이터/합의 레이어와 직접 상호작용하는 코드 없음
- 모든 DeepBook 로직은 Move VM을 통한 간접 실행
- DeepBook V3는 별도 저장소(`MystenLabs/deepbookv3`)에서 개발

### 4.7 기존 시스템 트랜잭션 패턴 (참고용)

Sui가 이미 사용하는 시스템 TX 패턴들:

1. **ConsensusCommitPrologue**: 매 합의 커밋마다 자동 생성. 타임스탬프, 합의 상태 기록.
2. **AuthenticatorStateUpdate**: 인증 상태 변경 시 자동 생성.
3. **RandomnessDkgMessage/Confirmation**: 랜덤 비콘 관련 시스템 TX.

이들은 모두 `consensus_handler.rs`에서 생성되어 실행 파이프라인에 주입된다.
**같은 패턴으로 `ConditionalOrderEvaluation` 시스템 TX를 추가하는 것이 기술적으로 가능하다.**

### 4.8 Mysticeti 합의 레이턴시 진화

Nasun이 상속한 Sui의 합의 알고리즘은 Narwhal/Bullshark에서 Mysticeti로 진화하며
확정 지연시간(finality latency)을 획기적으로 단축했다. 이는 TP/SL 트리거 지연시간 목표(0.5초)의
기술적 실현 가능성을 뒷받침하는 핵심 근거이다.

| 합의 프로토콜 | 주요 메커니즘 | 확정 지연시간 | 성능적 의의 |
|--------------|-------------|-------------|-----------|
| **Narwhal & Bullshark** | 멤풀-합의 분리 | 1,500ms ~ 2,000ms | 높은 처리량 확보, 하지만 지연시간 높음 |
| **Mysticeti-C** | 비인증 DAG 블록 + 신규 커밋 규칙 | 390ms ~ 600ms | 서브초 확정성 달성 (3회 메시징 라운드) |
| **Mysticeti-FPC** | 자산 전송용 패스트 커밋 패스 | < 300ms | 단독 소유 객체 전송 시 극저지연 |

**TP/SL 지연시간 분석:**
- 조건부 주문 시스템 TX는 공유 객체(ShardRegistry)를 사용하므로 Mysticeti-C 경로를 따름
- Oracle 업데이트(~30초) → 다음 합의 커밋(~0.5초) → 시스템 TX 실행(~0.1초)
- **합의 레이턴시 관점**: Oracle 업데이트 직후 ~0.5초 이내에 트리거 가능 — Hyperliquid의 0.1~0.5초에 근접
- **실질 사용자 체감 반응성**: Oracle 업데이트 주기(Phase 1: ~30초, Phase 2: 3초)가 상한을 결정.
  합의 레이턴시가 아무리 빨라도 Oracle이 갱신되지 않으면 트리거가 발생하지 않으므로,
  사용자 관점의 반응 시간은 Oracle 주기에 수렴한다.
- Phase 2에서 Fast Oracle(3초 간격)을 도입하면 실질 반응 시간은 **최대 ~3.5초** (Oracle 3초 + 합의 0.5초)

---

## 5. Sui 프로토콜 업그레이드 메커니즘

### 5.1 ProtocolVersion 및 ProtocolConfig

**ProtocolVersion:**
```rust
pub struct ProtocolVersion(u64);
const MIN_PROTOCOL_VERSION: u64 = 1;
const MAX_PROTOCOL_VERSION: u64 = 107;  // nasun-devnet 기준
```

- 단순 u64 래퍼, 순차 증가
- 각 버전마다 어떤 기능이 활성화되는지 명시

**ProtocolConfig:**
```rust
pub struct ProtocolConfig {
    pub version: ProtocolVersion,
    feature_flags: FeatureFlags,
    // Transaction limits, Move VM parameters, Gas costs, Core protocol settings ...
}
```

- 프로토콜의 모든 동작을 제어하는 중앙 설정
- Feature flags로 기능 활성화/비활성화
- 버전별로 다른 설정값 적용

### 5.2 Breaking Changes 관리 — Option<T> 패턴

Sui가 새 프로토콜 버전에서 필드를 추가할 때:
1. 새 필드를 `Option<T>`로 선언
2. 이전 버전에서는 `None`, 새 버전에서는 `Some(value)`
3. 매크로 기반 getter 메서드 자동 생성

이 패턴 덕분에 **새 설정 필드 추가가 기존 코드를 깨뜨리지 않는다.**
Nasun이 여기에 커스텀 필드를 추가해도 upstream rebase 시 충돌 리스크가 낮다.

### 5.3 밸리데이터 업그레이드 프로세스 (4단계)

1. **소프트웨어 업데이트**: 새 바이너리 다운로드, 이전 ProtocolConfig 유지
2. **투표**: 새 프로토콜 버전 전환 준비 신호 전송
3. **임계값 달성**: 2/3 이상 스테이크가 투표
4. **Epoch 경계 활성화**: ChangeEpoch TX에서 새 버전 기록, 모든 노드 동시 활성화

**Nasun 시사점:**
- Nasun devnet은 단일 밸리데이터이므로 투표/임계값 과정이 단순
- ProtocolVersion을 Nasun 전용으로 올려서 커스텀 기능 활성화 가능
- Epoch 경계에서 활성화되므로 deterministic 보장

### 5.4 최근 주요 프로토콜 변경 (2025년)

- **Mysticeti v2** (2025년 11월): TX 처리 35% 향상, 합의 내 TX 검증 통합
- **Passkey 지원**: Password-less FIDO2 인증
- **공유 객체 삭제**: Per-command granular deletion
- **합의 가비지 컬렉션**: Zstandard 압축
- **밸리데이터 보안**: 필수 TLS for gRPC

이러한 변경들이 2-3주마다 발생하며, `consensus_handler.rs` 등 핵심 파일을 수정한다.

---

## 6. 결정론성 보장 원리

### 6.1 핵심 원칙

프로토콜 레벨 조건부 주문이 합의를 깨뜨리지 않으려면:

> **모든 밸리데이터가 같은 입력을 받고, 같은 로직을 실행하여, 같은 결과를 도출해야 한다.**

이것은 State Machine Replication (SMR) 이론의 직접 적용이다.

### 6.2 각 프로토콜의 결정론적 보장 전략

**전략 1: 온체인 데이터만 참조 (Hyperliquid, Sei, Injective)**
- 모든 밸리데이터가 접근 가능한 블록체인 state만 사용
- 외부 API, 시간, 난수 참조 금지
- 예: 온체인 오더북 가격, 합의된 oracle 가격

**전략 2: 결정론적 실행 순서 (Cosmos SDK EndBlocker)**
- `SetOrderEndBlockers()`로 실행 순서 명시적 지정
- 모든 밸리데이터가 같은 순서로 실행 → 같은 결과
- 각 EndBlocker는 side-effect 없는 순수 함수처럼 구현

**전략 3: Oracle 합의 (Sei, Injective)**
- Oracle 가격 자체가 합의 프로토콜
- 밸리데이터 투표 → stake-weighted median → 결정론적 최종값

### 6.3 Nasun/Pado에서의 적용

**Oracle 가격 결정론성:**
- Pado의 `pado_oracle`은 온체인 shared object
- `price_updater` 봇이 주기적으로 Binance/CoinGecko에서 가격 가져와 온체인 업데이트 (별도 TX)
- 조건부 주문 평가 시점에 **온체인에 저장된 가격만 읽음**
- 모든 밸리데이터가 같은 온체인 state → 같은 가격 → 같은 평가 결과

**비결정론적 요소 방지:**
- ❌ 외부 HTTP 호출로 가격 조회 (밸리데이터마다 다른 응답 가능)
- ❌ 로컬 캐시 가격 사용 (오래된 데이터)
- ❌ 시스템 시간 참조 (밸리데이터 시계 차이)
- ✅ 온체인 `pado_oracle` 값만 사용

### 6.4 스마트컨트랙트 보안 고려사항

프로토콜 레벨 조건부 주문은 사용자 자산을 직접 다루는 코드이므로, 보안은 결정론성과 동등한
중요도를 갖는다.

**Move 선형 자원(Linear Resource) 모델의 보안 이점:**
- Move에서 자산은 `resource` 타입으로 정의되며, **복사(copy) 불가, 암시적 삭제(drop) 불가**
- 이 선형 자원 개념이 재진입 공격(Reentrancy Attack)과 자산 복제를 원천 차단
- `conditional_orders` 모듈의 에스크로 잠금도 이 보호를 자동으로 상속
- 에스크로에 잠긴 `Balance<NUSDC>`는 Move VM이 이중 사용을 원천적으로 방지

**Cetus DEX $223M 익스플로잇 사례 (2025년):**
- Sui 생태계 최대 DEX인 Cetus에서 `checked_shlw` 함수의 integer overflow 취약점 발생
- Move 언어 자체의 안전성에도 불구하고, **스마트컨트랙트 로직의 수학적 오류**가 대규모 자산 피해 유발
- 원인: 오픈소스 라이브러리(`integer-mate`)의 비트 시프트 함수에서 오버플로우 검증 누락
- 교훈: 바이트코드 검증기(Bytecode Verifier)는 자원 안전성만 보장하며, 비즈니스 로직 오류는 잡지 못함

**conditional_orders 모듈 보안 요구사항:**
1. **코드 감사**: 배포 전 에스크로 잠금/해제/정산 로직의 외부 감사 필수
2. **수학적 검증**: 가격 비교, 버킷 인덱스 계산 등에서 integer overflow/underflow 방지
3. **형식 검증(Formal Verification)**: Move Prover를 활용한 핵심 불변 조건 검증 검토
4. **의존성 관리**: 외부 라이브러리 사용 최소화, 사용 시 전수 코드 리뷰

---

## 7. 구현 경로 분석

### 7.1 경로 A: Move 모듈만 (Permissionless Crank)

**설명:** DeepBook 위에 `conditional_orders` Move 모듈을 추가. 외부 cranker가 `evaluate_orders()` 함수를 호출하여 조건부 주문 실행.

**Rust 수정:** 0줄
**Move 수정:** 새 패키지 생성 (`apps/pado/contracts-conditional-orders/`)

**동작 흐름:**
```
사용자 → register_conditional_order(pool, trigger_price, side, size)
  → OrderRegistry shared object에 저장

Cranker (누구나 가능) → evaluate_orders(oracle)
  → pado_oracle 온체인 가격 읽기
  → 조건 충족 주문 필터링
  → DeepBook place_market_order() 호출
  → Cranker에게 가스비 보상 지급
```

**장점:**
- 프로토콜 수정 없음 → Upstream 충돌 제로
- 즉시 구현 가능 (Move 패키지 배포만)
- 이미 Lottery/Lending에서 검증된 패턴

**단점:**
- Cranker 의존 (누군가 함수를 호출해줘야 함)
- 지연시간: Cranker 폴링 주기 + TX 실행 시간 (수초)
- Cranker 인센티브 설계 필요
- Hyperliquid 대비 UX 열등

**Upstream 추종 영향:** 없음

### 7.2 경로 B+: System Transaction + Move 하이브리드 v2 (권장)

> v1에서 Multi-AI 리뷰(Perplexity, Gemini, ChatGPT)를 거쳐 v2로 진화한 설계.
> v1 대비 9개 핵심 개선사항이 반영되었다. 상세 설계는 Section 8 참조.

**설명:** Sui의 기존 시스템 TX 패턴을 활용하되, **이벤트 기반 트리거**, **가격 버킷 샤딩**,
**에스크로 잠금**, **Prologue+EndBlock 이중 TX**, **플러그인 아키텍처**를 결합한 설계.

**Rust 수정:** ~150줄, `nasun-extension` crate 1개 + Sui 코어 삽입점 1줄
**Move 수정:** `conditional_orders` 패키지 (샤딩 + 에스크로 + 평가/실행 분리)

**v1 대비 핵심 변경점:**

| 영역 | v1 | v2 | 변경 이유 |
|------|----|----|----------|
| 트리거 조건 | 매 합의 커밋마다 폴링 | Oracle 가격 변경 시에만 | 불필요한 시스템 TX 제거 (Perplexity) |
| 주문 저장 | 단일 OrderRegistry shared object | 가격 버킷별 ShardRegistry | 공유 객체 경합 해소 (Perplexity) |
| 가격 범위 | 현재 가격만 체크 | `(last_price, current_price]` 범위 전체 | 가격 점프 시 누락 방지 (Gemini) |
| 실행 큐 | 단일 글로벌 큐 | 샤드별 독립 실행 큐 | 병렬 처리 가능 (Gemini) |
| 자산 보장 | 실행 시점 잔고 확인 | 주문 생성 시 에스크로 잠금 | 실행 실패 방지 (Gemini) |
| 시스템 TX | 단일 (평가+실행) | Prologue(평가) + EndBlock(실행) | 가격 기준점 고정 + 최신 상태 사용 (ChatGPT) |
| 실패 처리 | 없음 | 3회 실패 시 보증금 몰수 + 파기 | 좀비 주문 방지 (Gemini) |
| 코드 구조 | Sui 코어 직접 수정 3파일 | `nasun-extension` crate + Hook 1줄 | Rebase 생존율 극대화 (Gemini) |
| DoS 방지 | 없음 | 보증금 + 가스 예치 + 스토리지 펀드 | 스팸 공격 방지 (Perplexity) |

**동작 흐름 (v2):**
```
[주문 등록]
사용자 TX → conditional_orders::register_order()
  → 에스크로 잠금 (collateral + execution_deposit)
  → ShardRegistry[market_id, price_bucket]에 주문 삽입

[Oracle 업데이트]
price_updater TX → pado_oracle::update_price()
  → oracle_version 증가
  → 온체인 이벤트 발행

[Prologue 시스템 TX] (Oracle 버전 변경 시에만)
nasun-extension → ConditionalOrderPrologue 시스템 TX 생성
  → Move VM: conditional_orders::system_evaluate()
  → (last_price, current_price] 범위의 모든 shard 스캔
  → 조건 충족 주문을 shard.pending_execution으로 이동

[EndBlock 시스템 TX]
nasun-extension → ConditionalOrderEndBlock 시스템 TX 생성
  → Move VM: conditional_orders::system_execute()
  → pending_execution 주문들을 DeepBook으로 실행
  → 에스크로 해제 + 결과 이벤트 발행
  → 실패 시 failure_count 증가, MAX_FAILURES 초과 시 파기
```

**장점 (v2 추가):**
- Cranker 의존 완전 제거
- 밸리데이터 자동 실행 → Oracle 업데이트 즉시 트리거
- Hyperliquid에 근접한 UX
- 가격 점프 시에도 모든 주문 포착 (range-based)
- 에스크로로 실행 실패 원천 차단
- 플러그인 구조로 upstream rebase 생존율 극대화
- DoS/스팸 방지 내장

**단점:**
- v1 대비 Move 모듈 복잡도 증가 (샤딩 + 에스크로)
- 이중 시스템 TX로 블록 처리 비용 증가
- 플러그인 crate 유지보수 필요
- 에스크로 잠금으로 사용자 자본 효율성 감소

**Upstream 추종 영향:**
- Sui 코어: **1줄 삽입** (Hook 호출) → 충돌 리스크 최소
- `nasun-extension` crate: upstream과 완전 독립
- ProtocolConfig: Option<T> 패턴 → 충돌 리스크 낮음

### 7.3 경로 C: Consensus Handler 직접 수정

**설명:** `consensus_handler.rs`의 `handle_consensus_output()` 핵심 로직에 조건부 주문 평가를 직접 삽입.

**Rust 수정:** 수백 줄, 핵심 파일 다수
**장점:** 최저 지연시간 (합의 직후 평가)
**단점:** Upstream rebase 시 높은 충돌 리스크, 2인 팀 유지 어려움
**Upstream 추종 영향:** 높음 — `consensus_handler.rs`는 MystenLabs가 가장 활발히 수정하는 파일

### 7.4 경로 D: Matching Engine 내장 (Hyperliquid급)

**설명:** 밸리데이터에 전용 매칭 엔진을 내장하여 모든 주문을 프로토콜 레벨에서 처리.

**Rust 수정:** 수천 줄, 새 모듈 다수
**장점:** Hyperliquid와 동등한 성능
**단점:** 구현 규모가 거대하고, upstream과의 차이가 너무 커져 사실상 독립 프로젝트
**Upstream 추종 영향:** 매우 높음 — 실질적으로 upstream 추종 포기에 가까움

### 7.5 경로 비교 종합

| 경로 | Rust 수정 | 충돌 리스크 | 지연시간 | Cranker 필요 | DoS 방지 | 에스크로 | 2인 팀 | UX 수준 |
|------|----------|------------|---------|-------------|---------|---------|--------|---------|
| A. Move + Crank | 0줄 | 없음 | 수초 | O | X | X | 가능 | 중간 |
| **B+. System TX v2** | **~150줄** | **최소** | **~0.5초** | **X** | **O** | **O** | **가능** | **높음** |
| C. Handler 수정 | 수백줄 | 높음 | ~0.3초 | X | ? | ? | 어려움 | 높음 |
| D. Engine 내장 | 수천줄 | 매우 높음 | ~0.1초 | X | O | O | 불가능 | 최고 |

---

## 8. v2 아키텍처 상세 설계

> 이 섹션은 경로 B+의 핵심 서브시스템을 상세히 기술한다.
> Multi-AI 리뷰(Perplexity, ChatGPT, Gemini)에서 도출된 9개 개선사항이 모두 반영되었다.

### 8.1 시스템 전체 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Validator Node                       │
│                                                              │
│  ┌─────────────┐    ┌──────────────────────────────────┐    │
│  │  Mysticeti   │    │      nasun-extension crate        │    │
│  │  Consensus   │───>│  ┌─────────────────────────┐     │    │
│  │  Engine      │    │  │ NasunHook::on_consensus  │     │    │
│  └─────────────┘    │  │ _commit()                 │     │    │
│                      │  │                           │     │    │
│                      │  │ 1. Oracle version check   │     │    │
│                      │  │ 2. Shard dedup check      │     │    │
│                      │  │ 3. Generate Prologue TX   │     │    │
│                      │  │ 4. Generate EndBlock TX   │     │    │
│                      │  └─────────────────────────┘     │    │
│                      └──────────────────────────────────┘    │
│                               │                              │
│                      ┌────────▼─────────┐                    │
│                      │   Move VM         │                    │
│                      │                   │                    │
│                      │  Prologue TX:     │                    │
│                      │  system_evaluate()│                    │
│                      │    ↓              │                    │
│                      │  EndBlock TX:     │                    │
│                      │  system_execute() │                    │
│                      └───────────────────┘                    │
│                               │                              │
│   ┌───────────────────────────▼──────────────────────────┐   │
│   │              Move Shared Objects                      │   │
│   │                                                       │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │   │
│   │  │ ShardRegistry│  │ ShardRegistry│  │  pado     │  │   │
│   │  │ BTC [50000,  │  │ BTC [50100,  │  │  _oracle  │  │   │
│   │  │      50100)  │  │      50200)  │  │           │  │   │
│   │  └──────────────┘  └──────────────┘  └───────────┘  │   │
│   │                                                       │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │   │
│   │  │ Escrow Vault │  │ Config       │  │ DeepBook  │  │   │
│   │  │ (locked      │  │ (bucket_size,│  │ V3 Pool   │  │   │
│   │  │  collateral) │  │  max_orders) │  │           │  │   │
│   │  └──────────────┘  └──────────────┘  └───────────┘  │   │
│   └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 이벤트 기반 트리거 모델

> **v1 문제 (Perplexity 지적)**: 매 합의 커밋(~0.5초)마다 시스템 TX를 생성하면,
> Oracle 가격이 변하지 않았을 때도 불필요한 평가가 실행되어 네트워크 자원 낭비.

**v2 해결:**

```rust
// nasun-extension/src/lib.rs (pseudo-code)
fn on_consensus_commit(&self, ctx: &ConsensusContext) -> Vec<SystemTx> {
    let current_oracle_version = ctx.read_oracle_version();
    let last_processed = ctx.read_last_processed_oracle_version();

    // Oracle이 업데이트되지 않았으면 시스템 TX 생성 안 함
    if current_oracle_version == last_processed {
        return vec![];
    }

    // Oracle이 업데이트되었을 때만 평가 + 실행 TX 생성
    vec![
        SystemTx::ConditionalOrderPrologue { oracle_version: current_oracle_version },
        SystemTx::ConditionalOrderEndBlock { oracle_version: current_oracle_version },
    ]
}
```

**결정론성 보장:**
- `oracle_version`은 온체인 state (모든 밸리데이터 동일)
- `last_processed_oracle_version`도 온체인 state
- 외부 입력 없이 온체인 값만으로 "시스템 TX 생성 여부" 결정
- 모든 밸리데이터가 같은 판단 → 합의 유지

**성능 영향:**
- Oracle 업데이트 주기(현재 30초)에 따라 시스템 TX 빈도 결정
- 30초 간격이면 블록 60개 중 1개만 시스템 TX 포함 → 오버헤드 최소

### 8.3 가격 버킷 샤딩 (ShardRegistry)

> **v1 문제 (Perplexity 지적)**: 단일 `OrderRegistry` shared object는 모든 주문
> 등록/평가 TX가 경합하는 "hot object" 병목.

**v2 해결 — 가격 버킷 기반 분산:**

```move
// conditional_orders/sources/shard.move
module conditional_orders::shard {
    /// Shard key = (market_id, price_bucket_index)
    /// bucket_index = floor(trigger_price / bucket_size)
    struct ShardRegistry has key {
        id: UID,
        market_id: u64,
        bucket_index: u64,
        orders: vector<ConditionalOrder>,
        pending_execution: vector<ConditionalOrder>,  // v2: 샤드별 실행 큐
    }

    /// Global config (Admin 전용)
    struct ShardConfig has key {
        id: UID,
        bucket_size: u64,            // e.g., 100 (= $100 단위)
        max_orders_per_shard: u64,   // e.g., 1000
        max_shards_per_block: u64,   // e.g., 50 (DoS 방지)
    }
}
```

**샤드 키 계산 예시:**
- BTC 가격 $50,250에 TP 설정 → `bucket_index = floor(50250 / 100) = 502`
- 해당 주문은 `ShardRegistry(market=BTC, bucket=502)`에 저장
- $50,100~$50,200 범위의 주문은 `bucket=501`에 저장

**장점:**
- 서로 다른 가격대의 주문은 다른 shared object → 경합 없음
- 평가 시 현재 가격 근처 샤드만 스캔 → 효율적
- 각 샤드가 독립적이므로 병렬 처리 가능

**고려사항:**
- `bucket_size` 설정: 너무 작으면 샤드가 과도하게 많아지고, 너무 크면 불필요한 주문 스캔
- 동적 생성: 해당 가격대에 첫 주문이 등록될 때 ShardRegistry 생성
- 빈 샤드 정리: 주문이 모두 실행/취소되면 삭제하여 스토리지 절약

**Sui 네이티브 혼잡 제어와의 시너지:**
Sui는 공유 객체에 대한 트랜잭션이 과도하게 집중될 때를 대비한 네이티브 혼잡 제어(Congestion Control)
메커니즘을 이미 갖추고 있다. Consensus Handler 레벨에서 공유 객체별 트랜잭션 큐를 관리하며,
과부하 시 **지연(defer)** 또는 **취소(cancel)** 정책을 적용하여 네트워크 안정성을 보호한다.
가격 버킷 샤딩은 이 메커니즘과 결합하여 이중 보호를 제공한다:
- **1차 보호 (설계)**: 샤딩으로 단일 공유 객체에 트랜잭션이 집중되는 것을 원천 방지
- **2차 보호 (런타임)**: 특정 샤드에 트랜잭션이 몰리더라도 Sui의 혼잡 제어가 자동 완화
- 이를 통해 `max_shards_per_block` 제한과 함께 시스템 안정성이 삼중으로 보장됨

**혼잡 제어의 잠재적 리스크 (v4 추가):**
시스템 TX 자체는 consensus handler에서 직접 주입되므로 사용자 TX와 달리 defer/cancel 대상이
아닐 가능성이 높다. 그러나 시스템 TX가 접근하는 shared object(ShardRegistry, Pool 등)에 대한
경합은 여전히 발생할 수 있다.

- **시나리오**: EndBlock 시스템 TX가 접근하는 ShardRegistry와 동일 shared object를 다수의
  사용자 주문 TX가 동시에 접근하면, Sui 혼잡 제어가 사용자 TX를 defer할 수 있음.
  이 경우 시스템 TX 자체는 실행되지만, 같은 블록의 사용자 DeepBook 주문이 밀릴 수 있음.
- **`pending_execution` 이월 위험**: 만약 시스템 TX 자체도 defer 대상이 된다면,
  `pending_execution` 상태의 주문이 다음 블록으로 이월됨.
  이월 시 반드시 지켜야 할 불변 조건: "pending_execution 주문은 다음 Oracle 업데이트 전에 실행 완료".
  Oracle이 다시 갱신되면 새 가격으로 재평가가 시작되므로, 이전 가격 기준의 pending 주문이
  부정확한 가격에 실행될 위험이 있다.
- **분류**: Phase 2 검증 필수 항목 (11.2.1절 참조)

### 8.4 레인지 기반 트리거 엔진

> **v1 문제 (Gemini 지적)**: Oracle 가격이 $50,000 → $50,500으로 점프하면
> 중간 가격대($50,100~$50,400)의 주문이 누락됨.

**v2 해결 — (last_price, current_price] 범위 전체 스캔:**

```move
// conditional_orders/sources/evaluator.move
module conditional_orders::evaluator {
    /// System TX에 의해 호출. last_price와 current_price 사이의 모든 샤드를 스캔.
    public(friend) fun system_evaluate(
        oracle: &PadoOracle,
        eval_state: &mut EvaluationState,
        // ... ShardRegistry references
    ) {
        let current_price = oracle::get_price(oracle);
        let last_price = eval_state.last_processed_price;

        // 가격 방향에 따라 스캔 범위 결정
        let (low, high) = if current_price > last_price {
            (last_price, current_price)  // 상승: TP 주문 스캔
        } else {
            (current_price, last_price)  // 하락: SL 주문 스캔
        };

        // (low, high] 범위의 모든 shard 인덱스 계산
        let start_bucket = low / config.bucket_size;
        let end_bucket = high / config.bucket_size;

        // 각 shard에서 조건 충족 주문을 pending_execution으로 이동
        let mut bucket = start_bucket;
        while (bucket <= end_bucket) {
            evaluate_shard(market_id, bucket, current_price, direction);
            bucket = bucket + 1;
        };

        // 상태 업데이트
        eval_state.last_processed_price = current_price;
        eval_state.last_oracle_version = oracle::get_version(oracle);
    }
}
```

**트리거 조건 판정:**
- Take Profit (Long): `trigger_price <= current_price` AND `trigger_price > last_price`
- Stop Loss (Long): `trigger_price >= current_price` AND `trigger_price < last_price`
- Take Profit (Short): `trigger_price >= current_price` AND `trigger_price < last_price`
- Stop Loss (Short): `trigger_price <= current_price` AND `trigger_price > last_price`

**결정론성:** `last_processed_price`는 온체인 state → 모든 밸리데이터 동일한 범위 스캔.

**블록 간 샤드 이월(Carry-over) 상태 기계 (v4 추가):**

`max_shards_per_block` 제한으로 한 블록에서 모든 샤드를 처리하지 못할 때,
나머지 샤드를 다음 블록에서 이어서 처리하기 위한 상태 기계:

```move
// EvaluationState에 추가
struct EvaluationState has key, store {
    last_processed_price: u64,
    last_oracle_version: u64,
    // v4: carry-over cursor
    pending_shard_cursor: Option<u64>,  // None = 이월 없음, Some(n) = n번째 샤드부터 재개
}
```

**상태 전이 규칙:**

1. `pending_shard_cursor == None`: 정상 상태. Oracle 업데이트 시 전체 범위 스캔 시작.
2. 스캔 도중 `max_shards_per_block`에 도달 → `pending_shard_cursor = Some(중단된_shard_index)`.
3. 다음 합의 커밋에서 cursor가 `Some`이면 새 시스템 TX가 중단점부터 재개.
4. Oracle이 다시 업데이트되면(새 가격 도착): cursor 리셋(`None`) → 새 범위로 전체 재스캔.
   이전 pending_execution 주문은 그대로 실행 큐에 유지.

**결정론성:** `pending_shard_cursor`는 온체인 state이므로 모든 밸리데이터가 동일한
중단점에서 동일한 순서로 재개한다.

### 8.5 에스크로 잠금 모델

> **v1 문제 (Gemini 지적)**: 주문 등록 시점과 실행 시점 사이에 사용자가 자산을
> 이동/사용할 수 있어 실행 실패 가능.

**v2 해결 — 주문 생성 시 담보 사전 잠금:**

```move
module conditional_orders::escrow {
    struct EscrowVault has key {
        id: UID,
        // order_id -> locked collateral
        locked: Table<u64, LockedCollateral>,
    }

    struct LockedCollateral has store {
        owner: address,
        collateral: Balance<NUSDC>,      // 거래 담보
        execution_deposit: Balance<NASUN>, // 실행 가스 보증금
        anti_spam_fee: u64,               // 스팸 방지 수수료 (비환불)
        created_at: u64,                  // 생성 시각 (스토리지 펀드 계산용)
    }

    /// 주문 등록 시 담보 잠금
    public fun lock_collateral(
        vault: &mut EscrowVault,
        order_id: u64,
        collateral: Coin<NUSDC>,
        deposit: Coin<NASUN>,
        ctx: &TxContext,
    ) {
        // 1. anti_spam_fee 차감 (비환불)
        // 2. collateral + execution_deposit를 vault에 잠금
        // 3. 주문과 연결
    }

    /// 주문 취소 시 담보 반환
    public fun unlock_collateral(
        vault: &mut EscrowVault,
        order_id: u64,
        ctx: &TxContext,
    ): (Coin<NUSDC>, Coin<NASUN>) {
        // anti_spam_fee는 반환하지 않음
        // collateral + execution_deposit 반환
    }

    /// 실행 완료 후 정산
    public(friend) fun settle(
        vault: &mut EscrowVault,
        order_id: u64,
    ): Balance<NUSDC> {
        // collateral을 DeepBook 주문 실행에 사용
        // execution_deposit는 밸리데이터 가스로 사용 (또는 반환)
    }
}
```

**자본 효율성 vs 실행 보장 트레이드오프:**
- 에스크로 잠금은 사용자 자본을 묶지만, 실행 100% 보장
- CEX도 조건부 주문에 대해 마진을 동결하므로, 사용자에게 익숙한 모델
- 향후 "margin-based escrow" (포지션 마진과 통합)로 자본 효율성 개선 가능

### 8.6 Prologue + EndBlock 이중 시스템 TX

> **v1 문제**: 단일 시스템 TX에서 "가격 읽기 + 조건 평가 + 주문 실행"을 모두 처리하면,
> 같은 블록 내 다른 TX가 Oracle이나 Pool 상태를 변경했을 때 비결정론적 결과 가능.

**v2 해결 — 평가와 실행을 분리:**

```
블록 N 처리 흐름:

  ┌─ ConditionalOrderPrologue (블록 시작) ─────────────────────┐
  │  1. Oracle 가격 읽기 → 이 시점의 가격으로 고정                │
  │  2. (last_price, current_price] 범위 샤드 스캔               │
  │  3. 조건 충족 주문을 pending_execution으로 이동               │
  │  4. 결과: "무엇을 실행할지" 결정                              │
  └──────────────────────────────────────────────────────────────┘
           ↓
  ┌─ User Transactions (블록 중간) ──────────────────────────────┐
  │  - 새 주문 등록/취소                                          │
  │  - DeepBook 거래                                              │
  │  - Oracle 가격 업데이트 (다음 블록에서 반영)                   │
  └──────────────────────────────────────────────────────────────┘
           ↓
  ┌─ ConditionalOrderEndBlock (블록 끝) ─────────────────────────┐
  │  1. pending_execution 큐에서 주문 가져오기                     │
  │  2. 에스크로에서 담보 인출                                     │
  │  3. DeepBook place_market_order() 실행                        │
  │  4. 성공: 에스크로 정산 + 이벤트 발행                          │
  │  5. 실패: failure_count++ → MAX_FAILURES 시 보증금 몰수        │
  └──────────────────────────────────────────────────────────────┘
```

**왜 분리하는가:**
1. **가격 기준점 고정**: Prologue에서 Oracle 가격을 읽고 고정. 블록 중간에 가격이 변해도 평가 결과 불변.
2. **최신 상태 사용**: EndBlock에서 실행할 때는 블록 내 모든 TX가 반영된 최종 상태 사용.
3. **결정론성 강화**: 평가 시점과 실행 시점을 명확히 분리하여 모든 밸리데이터가 동일한 결과.

**Sui 시스템 TX 매핑:**
- Prologue → `ConsensusCommitPrologue`과 같은 위치에 삽입 (합의 핸들러 시작)
- EndBlock → 별도 시스템 TX로 실행 스케줄러 큐 끝에 배치

### 8.7 실행 실패 백오프

> **v1 문제 (Gemini 지적)**: 실행이 반복 실패하는 "좀비 주문"이 영구적으로
> 시스템 자원을 소비.

**v2 해결 — failure_count 기반 백오프:**

```move
struct ConditionalOrder has store, drop {
    // ... 기존 필드
    failure_count: u8,       // 실행 실패 횟수
    last_failure_reason: u8, // 마지막 실패 사유 코드
}

const MAX_FAILURES: u8 = 3;

// 실행 실패 시
fun handle_execution_failure(order: &mut ConditionalOrder, reason: u8) {
    order.failure_count = order.failure_count + 1;
    order.last_failure_reason = reason;

    if (order.failure_count >= MAX_FAILURES) {
        // 1. 보증금(execution_deposit) 몰수 → 밸리데이터 보상 풀로
        // 2. 담보(collateral)는 사용자에게 반환
        // 3. 주문 파기 + 이벤트 발행
        destroy_order_with_slash(order);
    }
    // MAX_FAILURES 미만: 다음 Oracle 업데이트에서 재시도
}
```

**실패 사유 코드:**
- `1`: 유동성 부족 (DeepBook 풀에 충분한 호가 없음)
- `2`: 슬리피지 초과 (가격 급변)
- `3`: Move VM 실행 에러 (예상치 못한 오류)

**사용자 UX:**
- 실패 이벤트 발행 → 프론트엔드에서 알림 표시
- 사용자가 주문을 취소하고 재등록할 기회 제공
- 3회 실패 전 취소 시 담보 + 잔여 보증금 전액 반환

### 8.8 플러그인 아키텍처 (nasun-extension)

> **v1 문제 (Gemini 지적)**: Sui 코어 파일(`consensus_handler.rs`, `messages_consensus.rs`,
> `protocol_config.rs`) 3곳을 직접 수정하면, MystenLabs의 2-3주 주기 업데이트마다
> rebase 충돌 발생.

**v2 해결 — Trait 기반 플러그인 패턴:**

```
nasun-devnet/sui/
├── crates/
│   ├── sui-core/
│   │   └── src/
│   │       └── consensus_handler.rs
│   │           └── handle_consensus_output()
│   │               └── // === NASUN HOOK (1줄) ===
│   │                   nasun_extension::on_consensus_commit(&ctx);
│   │
│   ├── nasun-extension/              ★ 새 crate (Nasun 전용) ★
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs               # NasunHook trait + 구현
│   │       ├── conditional_orders.rs # 조건부 주문 로직
│   │       ├── dedup.rs             # 중복 방지 레이어
│   │       └── config.rs            # Nasun 전용 설정
│   │
│   └── [나머지 Sui crates - 수정 없음]
```

**핵심 구조:**

```rust
// nasun-extension/src/lib.rs
pub trait NasunHook {
    fn on_consensus_commit(
        &self,
        ctx: &ConsensusContext,
    ) -> Vec<NasunSystemTx>;
}

pub struct NasunExtension {
    enabled: bool,
    processed_shards: HashSet<ShardId>,  // 중복 방지
}

impl NasunHook for NasunExtension {
    fn on_consensus_commit(&self, ctx: &ConsensusContext) -> Vec<NasunSystemTx> {
        if !self.enabled {
            return vec![];
        }

        let oracle_version = ctx.read_oracle_version();
        if oracle_version == ctx.last_processed_oracle_version() {
            return vec![];  // Oracle 변경 없으면 skip
        }

        // 중복 방지: 이미 처리한 shard는 skip
        let affected_shards = self.compute_affected_shards(ctx);
        let new_shards: Vec<ShardId> = affected_shards
            .into_iter()
            .filter(|s| !self.processed_shards.contains(s))
            .collect();

        if new_shards.is_empty() {
            return vec![];
        }

        vec![
            NasunSystemTx::ConditionalOrderPrologue {
                oracle_version,
                shard_ids: new_shards.clone(),
            },
            NasunSystemTx::ConditionalOrderEndBlock {
                oracle_version,
                shard_ids: new_shards,
            },
        ]
    }
}
```

**Sui 코어 수정 (consensus_handler.rs) — 단 1줄:**

```rust
// consensus_handler.rs의 handle_consensus_output() 내부
// 기존 ConsensusCommitPrologue 생성 코드 바로 아래:

// === NASUN CUSTOMIZATION ===
let nasun_txs = nasun_extension::on_consensus_commit(&consensus_ctx);
for tx in nasun_txs {
    batch.push(tx.into_system_transaction());
}
// === END NASUN CUSTOMIZATION ===
```

**Rebase 충돌 시나리오 분석:**
- MystenLabs가 `consensus_handler.rs`를 리팩터링 → Nasun의 1줄 삽입점만 재확인
- `ConsensusCommitPrologue` 생성 패턴이 바뀌면 → 같은 위치에 Nasun 훅 재삽입
- `nasun-extension` crate 자체는 upstream과 완전 독립 → 충돌 불가능

### 8.9 가스/보증금 및 스토리지 펀드

> **v1 문제 (Perplexity 지적)**: DoS 방지 메커니즘 부재. 공격자가 대량의 조건부 주문을
> 등록하여 네트워크 자원 소비.

**v2 해결 — 3층 비용 구조:**

```
주문 생성 시 사용자가 지불하는 비용:

┌─────────────────────────────────────────────────┐
│  1. Anti-Spam Fee (비환불)                        │
│     - 고정 금액: e.g., 0.01 NASUN                 │
│     - 주문 등록 시 즉시 차감                       │
│     - 취소해도 반환 안 됨                          │
│     - 목적: 주문 스팸 공격 억제                    │
├─────────────────────────────────────────────────┤
│  2. Execution Gas Reserve (조건부 환불)            │
│     - 시스템 TX 실행에 필요한 가스 예치             │
│     - 성공 실행: 실제 사용 가스 차감, 잔여분 반환   │
│     - 취소: 전액 반환                              │
│     - 3회 실패 파기: 전액 몰수                     │
├─────────────────────────────────────────────────┤
│  3. Storage Fund Deposit (시간 비례)               │
│     - 온체인 스토리지 점유 비용                     │
│     - 기본 보증금 + 시간 비례 추가분                │
│     - 계산: base_deposit + (duration_epochs *       │
│             per_epoch_rate)                        │
│     - 주문 완료/취소 시 반환 (사용 기간분 차감)     │
│     - 장기 방치 주문의 스토리지 비용 회수           │
└─────────────────────────────────────────────────┘
```

**Storage Fund 통합:**
```move
struct StorageConfig has store {
    base_deposit: u64,         // e.g., 0.1 NASUN
    per_epoch_rate: u64,       // e.g., 0.001 NASUN/epoch
    max_lifetime_epochs: u64,  // e.g., 2880 (약 30일)
}

/// 주문 생존 기간이 max_lifetime_epochs를 초과하면 자동 만료
/// (system_evaluate에서 체크)
fun check_order_expiry(order: &ConditionalOrder, current_epoch: u64): bool {
    current_epoch - order.created_epoch > config.max_lifetime_epochs
}
```

### 8.10 Oracle 업그레이드 방안

> **v1 미해결 (질문 #5, #6)**: `pado_oracle`의 30초 업데이트 간격은 TP/SL 정밀도에
> 불충분할 수 있음. 단일 `price_updater` 봇은 SPOF.

**3가지 Oracle 개선 경로:**

**경로 O1: Last Traded Price (LTP) 기반 (단기)**
- DeepBook 풀의 최종 체결가를 Oracle 대체/보완으로 사용
- 장점: 이미 온체인에 존재, 추가 인프라 불필요
- 단점: 유동성이 낮은 풀에서는 조작 가능
- 구현: `system_evaluate()`에서 `pool.get_last_traded_price()` 추가 참조

**경로 O2: Fast Oracle Feed (중기)**
- `price_updater`의 업데이트 간격을 30초 → 3초로 단축
- 별도의 "Fast Oracle" shared object 생성 (기존 `pado_oracle` 유지)
- 장점: 기존 인프라 재활용
- 단점: TX 수 10배 증가, 가스 비용 증가

**경로 O3: 밸리데이터 Oracle Sidecar (장기)**
- 밸리데이터가 직접 가격 피드를 제출 (Sei 모델)
- Stake-weighted median으로 결정론적 가격 산출
- 장점: 탈중앙화, SPOF 제거, 가장 높은 신뢰성
- 단점: 밸리데이터 소프트웨어 수정 필요, 다중 밸리데이터 환경에서만 의미

**권장: Phase 1에서 O1(LTP) 사용, Phase 2에서 O2(Fast Feed) 추가, 메인넷에서 O3 검토.**

**Oracle 업데이트 주기가 실질 반응 시간의 상한을 결정한다 (v4.2 강조):**

L1 프로토콜이 합의 커밋마다(~0.5초) 조건을 체크하더라도, `pado_oracle`이 30초마다
업데이트된다면 실제 TP/SL 트리거는 30초마다 일어난다. 합의 레이턴시(0.5초)는 Oracle
업데이트 직후의 반응 속도만 결정할 뿐, 전체 사이클의 반응성은 Oracle 주기에 수렴한다.

따라서 **O1(LTP 기반)의 우선 적용이 아키텍처적으로 필수**이다. DeepBook 풀의 최종
체결가(Last Traded Price)를 트리거 소스로 사용하면, Oracle 업데이트와 무관하게 거래가
발생할 때마다 즉시 조건 평가가 가능해진다. Phase 1에서 LTP를 기본 트리거로 확정하고,
`pado_oracle`은 LTP가 없는 비활성 마켓의 fallback으로만 사용하는 것이 올바른 우선순위이다.

### 8.11 중복 방지 레이어 (Deduplication)

> **문제**: 하나의 합의 라운드에서 같은 shard에 대해 시스템 TX가 중복 생성될 수 있음.

**v2 해결:**

```rust
// nasun-extension/src/dedup.rs
pub struct DeduplicationLayer {
    processed_shards: HashSet<ShardId>,
    current_consensus_round: u64,
}

impl DeduplicationLayer {
    pub fn should_process(&mut self, shard_id: ShardId, round: u64) -> bool {
        // 새 합의 라운드면 캐시 초기화
        if round != self.current_consensus_round {
            self.processed_shards.clear();
            self.current_consensus_round = round;
        }

        // 이미 처리한 shard면 skip
        if self.processed_shards.contains(&shard_id) {
            return false;
        }

        self.processed_shards.insert(shard_id);
        true
    }
}
```

**결정론성:** `consensus_round`는 합의 출력에 포함된 결정론적 값.
모든 밸리데이터가 같은 `round` 값 → 같은 dedup 결과.

### 8.12 설계 요소별 Trade-off 요약

v2 아키텍처의 각 설계 요소는 명확한 이점과 비용을 수반한다.
아래 테이블은 의사결정자가 각 요소의 가치를 한눈에 평가할 수 있도록 정리한 것이다.

| 설계 요소 | 이점 | 비용 | 대안/완화 |
|----------|------|------|----------|
| **가격 버킷 샤딩** | 공유 객체 경합 제거, 병렬 처리 가능 | 구현 복잡도 증가, bucket_size 튜닝 필요 | Phase 1에서 $1,000 coarse bucket으로 시작, 점진적 세분화 |
| **에스크로 잠금** | 실행 100% 보장, 자금 부족 실패 원천 차단 | 사용자 자본 효율성 감소 (자금 동결) | 향후 margin-based escrow로 포지션 마진과 통합 |
| **Prologue + EndBlock 이중 TX** | 가격 기준점 고정, 결정론성 강화 | 블록당 시스템 TX 2개 추가, VM 비용 증가 | Phase 1에서는 단일 evaluate_and_execute()로 단순화 |
| **이벤트 기반 트리거** | 불필요한 평가 제거 (60블록 중 1개만) | Oracle 업데이트 주기에 트리거 빈도 종속 | Fast Oracle(3초)로 반응성 개선 가능 |
| **플러그인 아키텍처** | Sui 코어 수정 1줄, rebase 생존율 극대화 | 별도 crate 유지보수, Cargo workspace 관리 | upstream과 완전 독립된 코드이므로 충돌 불가 |
| **실패 백오프 (3회 파기)** | 좀비 주문 방지, 시스템 자원 보호 | 사용자 보증금 몰수 리스크 | 실패 이벤트로 프론트엔드 알림, 취소 기회 제공 |
| **3층 비용 구조** | DoS/스팸 공격 방어 | 사용자 진입 장벽 (수수료) | anti_spam_fee를 최소화하여 UX 영향 최소화 |

### 8.13 DeepBook BalanceManager 통합 (에스크로 ↔ BM 어댑터) (v4 추가)

**문제 정의:**
DeepBook V3는 `BalanceManager` + `TradeProof`를 통해서만 주문 실행이 가능하다.
에스크로에 잠긴 자산을 DeepBook에 전달하려면 두 시스템을 연결하는 어댑터가 필요하다.

**Perplexity 제안("임시 BalanceManager")이 불가한 이유:**

`BalanceManager`는 `key, store` ability를 가진 일반 object이다 (`balance_manager.move:42`).
Shared object로의 전환은 caller가 `public_share_object()`를 호출하는 **선택**이지,
hot potato처럼 강제되는 것이 아니다. 따라서 owned object로도 유지할 수 있다.

그러나 "임시로 생성하고 사용 후 삭제"하는 패턴은 다음 두 가지 이유로 불가하다:

1. **DeepBook V3 API에 destroy 엔드포인트 부재**: `BalanceManager`를 by-value로 소비하여
   삭제하는 함수가 DeepBook V3 모듈에 존재하지 않는다. Sui 플랫폼 자체는 ephemeral shared objects를
   통해 shared object 삭제를 지원하지만, DeepBook V3가 해당 경로를 열어주지 않는다.
2. **`key` ability object의 PTB 제약**: `key` ability를 가진 object는 PTB(Programmable
   Transaction Block) 종료 시 반드시 transfer/share/freeze 중 하나를 수행해야 한다.
   따라서 생성→사용→삭제의 임시 패턴은 불가하며, 미사용 BM object가 남게 된다.

코드 근거:

```move
// deepbookv3/packages/deepbook/sources/balance_manager.move:42
public struct BalanceManager has key, store {
    id: UID,
    owner: address,
    balances: Bag,
    allow_listed: VecSet<ID>,
}
```

```typescript
// apps/pado/bots/lib/balance-manager.ts:98-106
// sharing은 caller의 선택 (hot potato 아님)
const balanceManager = tx.moveCall({
  target: `${DEEPBOOK_PACKAGE}::balance_manager::new`,
  arguments: [],
});
tx.moveCall({
  target: '0x2::transfer::public_share_object',
  typeArguments: [BALANCE_MANAGER_TYPE],
  arguments: [balanceManager],
});
```

**해법: Protocol-Owned Persistent BalanceManager**

마켓별 1개의 프로토콜 소유 BM을 생성하고 영구적으로 재사용한다.

**Phase별 소유권 모델:**

| Phase | BM Owner | TradeProof 생성 방식 | 비고 |
| ----- | -------- | ------------------- | ---- |
| Phase 1 (Crank) | Cranker bot 주소 | `generate_proof_as_owner()` | Cranker가 BM을 직접 생성하고 소유 |
| Phase 2 (System TX) | 미정 (0x0?) | 미해결 질문 | System TX sender(0x0)가 BM owner가 될 수 있는지 검증 필요 |

**Phase 1 Cap 관리:** Cranker가 BM owner이므로 DeepBook V3의 Cap 객체(TradeCap, DepositCap,
WithdrawCap)는 불필요하다. `generate_proof_as_owner()`는 `ctx.sender() == balance_manager.owner`만
검증하므로 (`balance_manager.move:626-628`), owner 경로로 deposit/withdraw/trade 모두 직접 수행 가능.

**에스크로 실행 티켓 (Hot Potato 패턴) (v4.1 추가)**

Cranker가 BM owner로서 에스크로 자금에 접근할 때, "인출만 하고 도주"하는 공격을
**프로토콜 레벨에서** 차단하기 위해 hot potato 패턴을 적용한다.

핵심 타입 — ability 없음(drop/copy/store/key 모두 없음) = hot potato:

```move
// conditional_orders/sources/executor.move (pseudo-code)

// Hot potato: 능력(ability) 없음 → PTB 내에서 반드시 소비해야 함
struct ExecutionTicket<phantom BASE, phantom QUOTE> {
    order_id: u64,
    creator: address,    // 정산 대상 (변경 불가)
    bm_id: ID,           // 바인딩된 BalanceManager
    pool_id: ID,         // 바인딩된 Pool
}
```

3단계 실행 흐름:

```move
// Step 1: 에스크로에서 인출 + 티켓 발행
// 주문 상태를 Executing으로 전이 (중복 인출 방지)
public fun withdraw_for_execution<BASE, QUOTE>(
    vault: &mut EscrowVault,
    order_id: u64,
    bm_id: ID,
    pool_id: ID,
    ctx: &mut TxContext,
): (Coin<QUOTE>, ExecutionTicket<BASE, QUOTE>) {
    // ... order status → Executing, emit ticket
}

// Step 2: DeepBook 실행 + 티켓 소비 (unpack)
// ticket의 bm_id/pool_id와 실제 object ID 일치 검증
public fun execute_with_ticket<BASE, QUOTE>(
    pool: &mut Pool<BASE, QUOTE>,
    bm: &mut BalanceManager,
    coin_in: Coin<QUOTE>,
    ticket: ExecutionTicket<BASE, QUOTE>,
    ctx: &mut TxContext,
): (Coin<BASE>, Coin<QUOTE>, address) {
    let ExecutionTicket { order_id, creator, bm_id, pool_id } = ticket;
    assert!(bm_id == object::id(bm));
    assert!(pool_id == object::id(pool));
    // deposit → generate_proof_as_owner → place_market_order → withdraw
    // return (base_out, quote_change, creator)
}

// Step 3: 정산 — 결과를 creator에게 전송
public fun finalize_execution<BASE, QUOTE>(
    vault: &mut EscrowVault,
    order_id: u64,
    creator: address,
    base_out: Coin<BASE>,
    quote_change: Coin<QUOTE>,
    ctx: &mut TxContext,
) {
    // order status → Filled/Failed
    transfer::public_transfer(base_out, creator);
    transfer::public_transfer(quote_change, creator);
}
```

**불변조건 (hot potato + 런타임 검증의 결합):**

- **(No fund residency)** `ExecutionTicket`은 drop ability가 없으므로, 소비하지 않으면
  PTB 자체가 abort된다. 이로써 "인출만 된 상태"를 트랜잭션 레벨에서 차단한다.
  이것은 운영 불변조건이 아닌 **구조적 불변조건**이다.
- **(Binding)** ticket은 특정 `order_id`, `creator`, `bm_id`, `pool_id`에 바인딩되어
  다른 주문/풀/BM으로 재사용할 수 없다. 이는 `execute_with_ticket()` 내에서 런타임 검증.
- **(Replay safety)** `withdraw_for_execution()`은 주문 상태를 `Executing`으로 전이한다.
  `Executing` 상태의 주문은 재차 인출이 불가하며, `finalize_execution()`만이
  `Filled`/`Failed`로 전이할 수 있다.

**미해결 질문 (11.2절로 이관):**
Phase 2에서 시스템 TX sender 주소(0x0)가 BalanceManager의 소유권을 가질 수 있는지.
`generate_proof_as_owner()`는 `tx_context::sender(ctx)`가 BM 생성자와 일치하는지
검증하므로, system TX의 sender가 0x0이라면 이 검증을 통과하지 못할 수 있다.
Phase 2에서 TradeCap delegation을 사용한다면 cap 행사 규칙(재사용/남용 방지,
reorg 시 재시도 안전성, 혼잡 defer 시 ExecutionTicket 불변식 유지 여부)이 설계 중심이 된다.

**대안 설계: Authorized Entry via Module-Held TradeCap (v4.2 추가, 외부 리뷰 제안):**

0x0 주소가 소유권 검증을 통과하지 못할 경우, `conditional_orders` 모듈이 특정 TradeCap을
영구적으로 보유하고 시스템 TX가 이 Cap을 빌려 쓰는 "Authorized Entry" 방식이 유력한 대안이다.

```move
// conditional_orders/sources/system_cap.move (pseudo-code)
module conditional_orders::system_cap {
    /// 모듈이 영구 보유하는 TradeCap wrapper
    struct SystemTradeCap has key {
        id: UID,
        trade_cap: TradeCap,       // DeepBook V3 TradeCap
        market_id: u64,            // 바인딩된 마켓
    }

    /// 초기화 시 Admin이 TradeCap을 모듈에 이관 (1회)
    public fun deposit_trade_cap(
        _admin: &AdminCap,
        trade_cap: TradeCap,
        market_id: u64,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(SystemTradeCap {
            id: object::new(ctx),
            trade_cap,
            market_id,
        });
    }

    /// 시스템 TX 전용 진입점: TradeCap을 빌려서 TradeProof 생성
    public(friend) fun borrow_for_system_execution(
        cap: &SystemTradeCap,
        bm: &mut BalanceManager,
    ): TradeProof {
        balance_manager::generate_proof_as_trader(&cap.trade_cap, bm)
    }
}
```

이 패턴의 핵심은 `generate_proof_as_trader()`가 Cap 보유 여부만 검증하고 sender 주소를
검증하지 않으므로, 시스템 TX의 sender가 0x0이어도 문제없다는 점이다. Phase 2 PoC에서
0x0 소유권 검증(11.2.1절 항목 #5)이 실패할 경우 이 설계로 전환한다.

**확장성 고려사항: BM Contention (v4.1 추가)**

마켓별 1개 BM이 기본 설계이나, 급격한 가격 변동으로 다수의 TP/SL이 동시 트리거되면
단일 BM이 shared object 경합 병목이 될 수 있다. ShardRegistry와 비교하면 BM은
주문 실행 시에만 접근(매 블록 스캔하지 않음)하므로 평균 contention은 낮지만,
DeepBook 문서가 BM을 "대부분의 DeepBook 상호작용에 필요한 shared object"로 정의하는 만큼
worst case 시나리오 대비가 필요하다.

설계 대안: BM 샤딩 (시장 × 샤드그룹 K개)으로 동시 트리거된 주문을 여러 BM에 분산하여
병렬 실행. Phase 2 이후 실측 데이터를 기반으로 검토. (11.2.1절 Phase 2 검증 항목 참조)

---

## 9. Upstream 추종 전략 및 리스크

### 9.1 현재 Fork 유지보수 현황

- Nasun은 현재 코드 수정 제로 → rebase가 trivial
- v2 플러그인 아키텍처 도입 후에도 Sui 코어 수정은 **1줄**

### 9.2 Sui 업데이트 주기 및 패턴

- **릴리스 주기**: 2-3주마다 프로토콜 버전 업그레이드
- **변경 범위**: ProtocolConfig 새 필드, 합의 최적화, Move VM 업데이트
- **핵심 파일 변경 빈도**:
  - `consensus_handler.rs`: 자주 (Mysticeti 최적화 관련)
  - `messages_consensus.rs`: 간헐적 (새 TX 타입 추가 시)
  - `ProtocolConfig`: 매 릴리스 (새 feature flag 추가)

### 9.3 v2 플러그인 아키텍처의 Rebase 전략

**v1 vs v2 Rebase 비교:**

| 항목 | v1 (직접 수정) | v2 (플러그인) |
|------|---------------|---------------|
| Sui 코어 수정 파일 | 3개 | **1줄** (consensus_handler.rs) |
| 수정 규모 | ~100줄 분산 | 1줄 삽입 |
| Rebase 시 충돌 확률 | 중간 | **최소** |
| 충돌 해결 난이도 | 중간 (맥락 파악 필요) | **쉬움** (삽입점만 재확인) |
| 커스텀 코드 위치 | Sui crate 내부 | `nasun-extension` 독립 crate |

**Rebase 절차 (v2):**

```bash
cd nasun-devnet/sui
git fetch upstream
git rebase upstream/main nasun-main

# 예상 충돌: consensus_handler.rs의 1줄 삽입점만
# 해결: ConsensusCommitPrologue 생성 코드 아래에 Nasun 훅 재삽입

# nasun-extension crate는 충돌 불가능 (upstream에 없는 파일)

git push origin nasun-main --force-with-lease
```

### 9.4 충돌 최소화 전략

1. **Sui 코어에 1줄만 삽입 — 나머지는 모두 `nasun-extension`에**
   - `consensus_handler.rs`에 삽입하는 1줄은 명확한 주석으로 표시
   - `nasun-extension` crate는 Cargo.toml에 의존성으로 추가

2. **ProtocolConfig 수정 회피 (v2 변경)**
   - v1에서는 ProtocolConfig에 feature flag를 추가했으나
   - v2에서는 `nasun-extension`에 자체 config 파일 사용
   - Sui의 ProtocolConfig은 수정하지 않음 → 충돌 0

3. **ConsensusTransactionKind enum variant 추가 수용 (v4 변경)**
   - v2에서는 `UserTransaction` 래핑으로 enum 수정을 회피하려 했으나,
     UserTransaction은 서명·가스 지불자·사용자 인증이 필요하여 시스템 TX를 래핑할 수 없음 (v4 검증 결과)
   - enum 끝에 2개 variant 추가: `NasunConditionalOrderPrologue`, `NasunConditionalOrderEndBlock`
   - Section 4.5에서 분석한 대로 `ConsensusTransactionKind`는 append-only 패턴이므로
     기존 variant의 순서를 변경하지 않는 한 rebase 충돌 리스크는 낮음
   - Sui upstream에서 같은 위치에 variant를 추가하는 경우에만 충돌 발생 (확률 낮음)

4. **핵심 로직은 Move에**
   - Rust는 "시스템 TX를 생성하고 Move 함수를 호출하는 것"만 담당
   - 실제 조건 평가, Oracle 읽기, 주문 실행은 전부 Move 모듈
   - Move 코드는 upstream과 충돌하지 않음 (별도 패키지)

### 9.5 Breaking Change 대응 체크리스트

매 Sui 릴리스마다:
1. MystenLabs 릴리스 노트 확인
2. `consensus_handler.rs`에서 Nasun 훅 삽입점 근처 변경 여부 확인
3. `Cargo.toml` workspace 멤버 목록 변경 여부 확인
4. Move VM 바이트코드 포맷 변경 여부 확인
5. Rebase 시도 → 충돌 해결 (1줄만) → 빌드 테스트 → devnet 검증

### 9.6 리스크 시나리오 및 완화

| 시나리오 | 확률 | 영향 | 완화 |
|---------|------|------|------|
| `consensus_handler.rs` 대규모 리팩터링 | 중간 | 훅 삽입점 재확인 | 1줄이므로 재삽입 용이 |
| Cargo workspace 구조 변경 | 낮음 | `nasun-extension` 경로 수정 | workspace 멤버 재추가 |
| 시스템 TX 생성 패턴 변경 | 낮음 | 훅 인터페이스 수정 | `NasunHook` trait 업데이트 |
| Mysticeti 합의 엔진 교체 | 매우 낮음 | 대규모 수정 필요 | 불가항력, 전면 재작업 |
| Move VM 메이저 버전 변경 | 낮음 | Move 모듈 마이그레이션 | Framework 패키지 표준 따름 |
| 시스템 TX 블록 처리 시간 과도 증가 | 중간 | 네트워크 성능 저하 | `max_shards_per_block` 제한 |
| `ConsensusTransactionKind` enum variant 충돌 (v4) | 낮음 | enum 끝 위치 재조정 | append-only 패턴, 끝에 추가하므로 기존 variant와 무관 |

---

## 10. 권장 접근 방식

### 10.1 결론

**경로 B+ (System Transaction + Move 하이브리드 v2)**가 Nasun/Pado에 가장 적합하다.

이유:
1. **최소 침습**: Sui 코어 **1줄** 수정으로 Hyperliquid에 근접한 UX 달성
2. **유지보수 가능**: 2인 팀이 2-3주 주기 rebase를 관리할 수 있는 수준
3. **검증된 패턴**: Sui 자체의 시스템 TX 패턴을 그대로 따름
4. **핵심 로직 분리**: Move 모듈에 로직을 두어 Rust 변경 최소화
5. **차별화 스토리**: "L1 프로토콜에 조건부 주문 내장" — 투자자/커뮤니티 설득력
6. **Multi-AI 검증**: Perplexity, ChatGPT, Gemini의 3라운드 리뷰를 거쳐 개선된 설계
7. **DoS 방지 내장**: 보증금 + 에스크로 + 스토리지 펀드로 스팸 공격 방어
8. **가격 점프 안전**: Range-based 트리거로 급변 시에도 모든 주문 포착
9. **(v4.2) 외부 기술 타당성 검증 통과**: 9.5/10 평가와 함께 "구현 착수 권고" 결론.
   1줄 훅 전략(매우 타당), System TX 패턴(매우 타당), 가격 버킷 샤딩(필수적),
   에스크로 잠금(합리적), ExecutionTicket(탁월)으로 평가됨

### 10.2 단계적 실행 제안

**Phase 1: Move 모듈 + Crank (프로토콜 수정 없음) — MVP 프로토타입**
- `conditional_orders` Move 패키지 구현 (단순화된 MVP 범위)
  - `shard.move`: ShardRegistry + 가격 버킷 (coarse $1,000 단위)
  - `escrow.move`: 에스크로 잠금/해제/정산
  - `evaluator.move`: 트리거 엔진 (LTP 기반)
  - `config.move`: ShardConfig (단순화)
- **MVP 단순화 원칙:**
  - 단일 마켓만 지원 (BTC-PERP)
  - 단일 공개 함수 `evaluate_and_execute()`로 평가+실행 통합 (Prologue/EndBlock 분리는 Phase 2)
  - LTP(Last Traded Price)를 기본 트리거 참조로 사용 (Oracle 의존 최소화)
  - 실패 처리는 단순 취소 (backoff/슬래싱은 Phase 2)
  - DoS 방지 수수료 생략 (devnet 환경이므로)
- **devnet 합의 튜닝**: 2-node 소규모 밸리데이터 세트에서 Mysticeti 파라미터(commit timeout, leader rotation 등) 최적화. 안정적 합의 확보가 Phase 2 시스템 TX의 전제 조건
- Crank 패턴으로 기능 검증 (외부 봇 또는 UI 버튼이 `evaluate_and_execute()` 호출)
- DeepBook 주문 실행 e2e 검증
- **이 단계에서 에스크로 잠금 + 샤딩 + 트리거의 핵심 로직을 검증**
- 프로토타입 데모에 충분한 수준 ("프로토콜 레벨 구현 로드맵" 문서와 함께 투자자 설득 가능)

**Phase 2: System TX + nasun-extension (최소 프로토콜 수정)**
- `nasun-extension` Rust crate 생성
  - `NasunHook` trait + 구현
  - 이벤트 기반 트리거 (Oracle 버전 체크)
  - 중복 방지 레이어
- `consensus_handler.rs`에 훅 1줄 삽입
- Move 모듈에 `system_evaluate()` + `system_execute()` 진입점 추가
- Prologue + EndBlock 이중 시스템 TX 구현
- Crank 의존 제거, 밸리데이터 자동 실행

**Phase 3: Oracle 업그레이드 + 최적화 (팀 확장 후)**
- Fast Oracle Feed (3초 간격) 추가
- 시스템 TX 실행 빈도 최적화
- 주문 평가 배치 처리 + 가스 최적화
- 모니터링 및 알림 인프라
- 밸리데이터 Oracle Sidecar 검토 (메인넷 대비)
- DEX 전용 시스템 객체 검토: 유동성 풀/오더북 객체에 시스템 레벨 트랜잭션 우선순위 부여 가능성 평가

### 10.3 GMX v2 Crank 방식이 최종 답이 아닌 이유

1. **아키텍처 불일치**: GMX는 AMM, Pado는 CLOB — 근본적으로 다른 구조
2. **UX 열등**: Keeper 지연 + 실행 수수료 → 트레이더들이 이미 낮게 평가
3. **Nasun의 핵심 자산 미활용**: Sui fork L1이라는 프로토콜 수정 능력을 사용하지 않음
4. **차별화 실패**: "누구나 만들 수 있는 Crank 봇"은 투자 pitch로 약함

### 10.4 Hyperliquid 방식(경로 D)이 현실적이지 않은 이유

1. **Upstream 추종 불가**: 수천 줄 수정으로 사실상 독립 프로젝트화
2. **팀 규모 부족**: Hyperliquid는 전용 엔지니어링 팀 보유
3. **구현 기간**: 프로토타입 일정에 맞지 않음
4. **하지만**: 경로 B+로 시작해서 팀 확장 후 경로 D로 진화하는 경로는 열려 있음

---

## 11. 미해결 질문 및 추가 리서치 필요 항목

### 11.1 v2에서 해결된 질문 (v1 → v2)

| # | v1 질문 | v2 해결 |
|---|--------|---------|
| 1 | System TX의 Move 함수 호출 메커니즘 | `ConsensusCommitPrologue`가 이미 Move 시스템 함수를 호출하는 검증된 패턴 존재. 같은 경로로 `system_evaluate()` 호출 가능. |
| 2 | 시스템 TX의 가스 비용 | 사용자가 `execution_gas_reserve`를 사전 예치. 시스템 TX 가스는 이 예치금에서 차감. |
| 3 | 공유 객체 경합 | 가격 버킷 샤딩으로 해소. 서로 다른 가격대의 주문은 서로 다른 shared object에 저장. |
| 4 | 평가 주문 수 제한 | `max_shards_per_block` 설정으로 블록당 처리 샤드 수 제한. 각 샤드 내 `max_orders_per_shard` 제한. |
| 5 | Oracle 가격 신선도 | Phase 1: LTP(Last Traded Price) 보완, Phase 2: Fast Oracle(3초), 메인넷: Oracle Sidecar. |
| 6 | Oracle 업그레이드 | 8.10절에 3단계 경로 제시 (O1→O2→O3). |
| 7 | Multi-market 지원 | 샤드 키가 `(market_id, bucket_index)`이므로 마켓별 독립 처리. |
| 8 | PTB 활용 | Prologue+EndBlock 이중 시스템 TX가 PTB의 atomic 실행과 동등한 효과. |

### 11.2 새로 발생한 기술적 질문

1. **`nasun-extension` crate의 Cargo workspace 통합**: Sui의 Cargo workspace에 커스텀 crate를 추가할 때 빌드 설정 충돌 여부. `Cargo.toml` workspace members 배열에 추가하는 것이 rebase에 미치는 영향.

2. ~~**시스템 TX의 `UserTransaction` 래핑**~~ → **v4에서 해결**: UserTransaction은 서명·가스·인증이 필요하므로 시스템 TX를 래핑할 수 없음. `ConsensusTransactionKind` enum에 2개 variant(`NasunConditionalOrderPrologue`, `NasunConditionalOrderEndBlock`)를 추가하는 방식으로 확정. append-only 패턴이므로 rebase 충돌 리스크 낮음. (Section 9.4 #3 참조)

3. ~~**에스크로와 BalanceManager 통합**~~ → **v4에서 해결 (Phase 1)**: Protocol-Owned Persistent BalanceManager 패턴으로 해결. 마켓별 1개 BM을 cranker가 소유하고 에스크로에서 자산을 이전하여 DeepBook 주문 실행. Phase 2에서 시스템 TX sender(0x0)의 BM 소유권 문제는 미해결. (Section 8.13 참조)

4. **블록당 시스템 TX 개수 제한**: 가격이 급변하여 100개 이상의 샤드를 스캔해야 할 때, `max_shards_per_block`에 의해 일부 샤드가 다음 블록으로 밀리는 문제. 우선순위 결정 로직 필요.

5. **Prologue/EndBlock TX의 실행 순서 보장**: Sui의 실행 스케줄러가 시스템 TX의 실행 순서를 어떻게 보장하는지. Prologue가 반드시 EndBlock보다 먼저 실행되어야 함.

6. **(v4 추가, v4.1 확장, v4.2 대안 추가) Phase 2에서 시스템 TX sender(0x0)의 BalanceManager 소유권 및 Cap 행사 규칙**: `generate_proof_as_owner()`는 `tx_context::sender(ctx)`가 BM 생성자와 일치하는지 검증. 시스템 TX sender가 0x0이라면 이 검증을 통과하지 못할 수 있음. **v4.2 대안 (외부 리뷰 제안)**: 0x0이 소유권 검증을 통과하지 못할 경우, `conditional_orders` 모듈이 TradeCap을 영구적으로 보유하고 시스템 TX가 `generate_proof_as_trader()`로 TradeProof를 생성하는 "Authorized Entry" 패턴 적용 (Section 8.13 참조). 이 경우 Cap 행사 규칙이 설계 중심이 됨 — 재사용/남용 방지, reorg 시 재시도 안전성, 혼잡 defer 시 ExecutionTicket 불변식 유지 여부를 검증해야 함. **이 PoC가 Phase 2 최우선 검증 항목**이다.

#### 11.2.1 Phase 2 시작 전 필수 검증 항목 (v4 추가, Perplexity 제안)

| # | 항목 | 분류 | 측정 지표 | 실패 판정 기준 |
| - | ---- | ---- | --------- | -------------- |
| 1 | 혼잡 제어 시뮬레이션 | 필수 | defer/cancel 시 `pending_execution` 주문의 상태 보존 여부 | pending 주문이 다음 Oracle 업데이트 이후까지 미실행 상태로 남는 경우 |
| 2 | 실행 순서 실험 | 필수 | CommitPrologue → NasunPrologue → NasunEndBlock 순서 보장 여부 | NasunEndBlock이 NasunPrologue보다 먼저 실행되는 경우 |
| 3 | 가스/권한 PoC | 필수 | `execution_gas_reserve`로 시스템 TX 가스 충당 가능 여부 | 시스템 TX 실행 시 가스 부족 오류 발생 |
| 4 | LTP 조작 가능성 | 권장 | wash trading으로 LTP를 $X 이상 이동 가능한지 시뮬레이션 | `bucket_size` 이상의 가격 조작이 경제적으로 합리적인 경우 |
| 5 | BM 소유권 (0x0) | 필수 | 시스템 TX sender 주소로 `generate_proof_as_owner()` 호출 가능 여부 | 소유권 검증 실패 시 대안 설계 필요 |
| 6 | BM contention under mass trigger (v4.1) | 권장 | 100+ TP/SL 동시 트리거 시 단일 BM의 shared object 경합으로 인한 defer 비율 | defer 비율 > 10%이면 BM 샤딩(시장×K) 설계 전환 검토 |

### 11.3 비즈니스 질문

6. **프로토타입 범위**: Phase 1(Crank)만으로 프로토타입 데모에 충분. "프로토콜 레벨 구현 로드맵"을 문서로 보여주고, Move 모듈의 기능을 시연하면 투자자 설득 가능.

7. **에스크로 자본 효율성**: 에스크로 잠금이 트레이더의 자본 효율성을 크게 저하시키는지. CEX 비교: Binance도 조건부 주문에 대해 마진을 동결하므로 사용자에게 익숙한 모델. 장기적으로 에스크로 유휴 담보를 렌딩/스테이킹 프로토콜에 자동 배분하는 Superfluid 모델로 자본 효율성 개선 가능성 검토 필요.

---

## 12. AI 리뷰 로그

> 이 문서는 Multi-AI 리뷰 프로세스를 거쳐 v1 → v2 → v3 → v4로 진화했다.
> 각 AI의 기여를 투명하게 기록한다.

### 12.1 리뷰 프로세스 타임라인

```
Claude Opus (v1 초안 작성)
  ↓ 리서치 문서 + 4경로 분석 + 권장안
Perplexity (v1 비판적 리뷰)
  ↓ 3개 치명적 이슈 발견
ChatGPT (v1 → v2 설계)
  ↓ Perplexity 이슈 해결 + 7개 섹션 설계
Gemini (v2 1차 리뷰)
  ↓ 5개 개선점 제안
ChatGPT (v2 개선)
  ↓ Gemini 피드백 반영
Gemini (v2 2차 리뷰)
  ↓ 5개 추가 개선점 제안
ChatGPT (v2 최종)
  ↓ 모든 피드백 통합
Claude Opus (v2 문서 통합)
  → v2 리서치 문서 완성
외부 피드백 문서 2건 (v2 → v3)
  ↓ "Architecture Feasibility and Soundness" + "기술 타당성 및 로드맵 제안"
Claude Opus (v3 개선)
  → Mysticeti 레이턴시, 보안 섹션, 혼잡 제어, Trade-off 테이블, Phase 1 MVP 구체화 반영
Perplexity (v3 비판적 리뷰)
  ↓ 3개 고위험 검증 항목 + BM 통합 문제 제기
Claude Opus (v4 개선)
  → enum 확정, BM 어댑터, 혼잡 제어 리스크, 샤드 이월, Phase 2 체크리스트, 톤 조정
AI 리뷰어 (v4 2차 피드백)
  ↓ ExecutionTicket hot-potato 제안, BM ability 정밀화, 타입시스템 표현 교정
Claude Opus (v4.1 개선)
  → BM 논거 정밀화, ExecutionTicket 패턴 도입, BM 샤딩 대안, Phase 2 질문 확장
외부 기술 타당성 심층 리뷰 (v4.2)
  ↓ 9.5/10 평가, Oracle 주기 불일치 경고, Authorized Entry 대안 제안, 구현 착수 권고
Claude Opus (v4.2 개선)
  → Oracle 우선순위 강조, TradeCap Authorized Entry 대안 추가, 리뷰 검증 결과 반영
```

### 12.2 각 AI의 핵심 기여

**Perplexity — 치명적 결함 발견 (3건)**
1. 이벤트 기반 vs 폴링: 매 블록 폴링의 낭비 지적 → 이벤트 기반 트리거로 전환
2. 공유 객체 경합: 단일 OrderRegistry의 병목 지적 → 가격 버킷 샤딩 도입
3. DoS/가스 모델 부재: 스팸 공격 취약점 지적 → 보증금 + 스토리지 펀드 도입

**ChatGPT — 아키텍처 설계 (v2 본체)**
- 7개 섹션의 초기 v2 설계
- ShardRegistry 데이터 구조
- ConditionalOrderPrologue + EndBlock 이중 TX 패턴
- Rust pseudo-code 작성

**Gemini — 엣지 케이스 발견 + 구조 개선 (10건)**
- 1차: Range-based 트리거 (가격 점프 누락), 에스크로 모델, 중복 방지, 플러그인 아키텍처, 스토리지 펀드
- 2차: 샤드별 독립 실행 큐, 실행 실패 백오프, Oracle 병목 해결 경로, 에스크로 세분화, 블록당 샤드 제한

**Claude Opus — 기반 리서치 + 최종 통합**
- v1: 6개 경쟁 플랫폼 분석, Nasun Sui Fork 구조 분석, 4경로 비교, 결정론성 분석
- v2: Multi-AI 피드백을 단일 리서치 문서로 통합, 일관성 검증, 미해결 질문 정리

**Perplexity — v3 비판적 리뷰 (v4 반영)**
1. 혼잡 제어 부정 시나리오: 시스템 TX의 shared object 경합 위험 지적 → Section 8.3 확장
2. 실행 순서 보장: CommitPrologue → Custom Prologue → EndBlock 순서 검증 필요 제기 → Phase 2 체크리스트
3. UserTransaction 래핑 불가 판정: 서명/가스/권한 문제로 enum variant 추가 확정 → Section 9.4 변경
4. BalanceManager 통합 문제 제기: 에스크로 ↔ DeepBook 연결고리 부재 지적 → Section 8.13 신설
   (단, Perplexity의 "임시 BM" 해법은 Sui shared object 모델과 충돌하여 불채택. Protocol-Owned Persistent BM으로 대체)

**외부 기술 타당성 심층 리뷰 — v4.2 반영 (9.5/10 평가)**
1. Oracle 업데이트 주기 불일치 경고: 합의 0.5초여도 Oracle 30초면 실질 실행은 30초. O1(LTP) 우선 적용을 "아키텍처적 필수"로 격상 → Section 8.10 강화
2. BalanceManager 0x0 소유권 해법 구체화: `conditional_orders` 모듈이 TradeCap을 영구 보유하고 `generate_proof_as_trader()`로 TradeProof 생성하는 "Authorized Entry" 패턴 제안 → Section 8.13 + 11.2 확장
3. 아키텍처 전반 검증: 1줄 훅 + nasun-extension 전략(매우 타당), System TX 패턴(매우 타당), 가격 버킷 샤딩(필수적), 에스크로 잠금(합리적), ExecutionTicket hot-potato(탁월) 평가
4. 전략적 합리성 확인: 3계층→프로토콜 전환(필수적), Phase 1→Phase 2 단계적 접근(적합), "구현 착수 권고" 결론

**AI 리뷰어 — v4 2차 피드백 (v4.1 반영)**
1. ExecutionTicket hot-potato 패턴 제안: cranker 커스터디 리스크를 운영 불변조건에서 프로토콜 레벨 구조적 불변조건으로 격상 → Section 8.13 확장
2. BM ability 정밀화: "Sui shared object 삭제 불가" 일반론을 "DeepBook V3 API에 destroy 엔드포인트 부재"로 교정 → Section 8.13 수정
3. "Move 타입시스템이 컴파일 타임에 강제" 표현의 부정확성 지적 → 런타임 검증 + hot potato 결합으로 정정
4. BM 샤딩 설계 대안 제시: mass trigger 시 단일 BM 병목 대비 → Section 8.13 + 11.2.1 확장

---

## 13. 참고 자료

### CEX/DEX 구현 사례
- [Hyperliquid TP/SL Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl)
- [Hyperliquid Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)
- [How Hyperliquid Works: Technical Deep Dive](https://rocknblock.io/blog/how-does-hyperliquid-work-a-technical-deep-dive)
- [Inside Hyperliquid's Technical Architecture (Blockhead)](https://www.blockhead.co/2025/06/05/inside-hyperliquids-technical-architecture/)
- [Hyperliquid On-Chain Order Book (Medium)](https://medium.com/@gwrx2005/hyperliquid-on-chain-order-book-6df27cbce416)
- [HyperBFT Wiki](https://hyperliquid-co.gitbook.io/wiki/architecture/hyperbft)
- [dYdX v4 Technical Architecture Overview](https://www.dydx.xyz/blog/v4-technical-architecture-overview)
- [dYdX Orders Documentation](https://docs.dydx.xyz/concepts/trading/orders)
- [dYdX Order Execution Options](https://docs.dydx.exchange/api_integration-trading/order_types)
- [Decentralized Order Book Design in dYdX v4 (Medium)](https://medium.com/@gwrx2005/decentralized-order-book-design-in-dydx-v4-625ac0152e80)
- [GMX V2 Trading Documentation](https://docs.gmx.io/docs/trading/v2/)
- [GMX V2 Contracts](https://docs.gmx.io/docs/api/contracts-v2/)
- [GMX Contract Architecture (Cyfrin)](https://updraft.cyfrin.io/courses/gmx-perpetuals-trading/foundation/gmx-contract-architecture)

### Sui 프로토콜 아키텍처
- [Protocol Upgrades | Sui Documentation](https://docs.sui.io/concepts/sui-architecture/protocol-upgrades)
- [Updating a Full Node | Sui Documentation](https://docs.sui.io/guides/operator/updates)
- [Sui Consensus Architecture](https://docs.sui.io/concepts/sui-architecture/consensus)
- [Mysticeti v2: Faster Transaction Processing](https://blog.sui.io/mysticeti-v2-sui-consensus/)
- [Mysticeti Upgrade Demystified (Chainflow)](https://chainflow.io/sui-mysticeti-upgrade-demystified/)
- [2025 in Review: How The Sui Stack Came Together](https://blog.sui.io/2025-sui-stack-developments/)
- [Sui Shared Object Congestion Control](https://blog.sui.io/shared-object-congestion-control/)
- [Sui Object Model Documentation](https://docs.sui.io/guides/developer/objects/object-model)
- [Sui Research Papers](https://docs.sui.io/concepts/research-papers)
- [Sui Blockchain 101 (Hacken.io)](https://hacken.io/discover/sui-blockchain/)
- [Built for Scale: Why Sui Stands Out (Grayscale)](https://research.grayscale.com/reports/why-sui-stands-out)
- [Validator Deployment Config | Sui Docs](https://docs.sui.io/guides/operator/validator/validator-config)
- [Sui Framework Architecture (DeepWiki)](https://deepwiki.com/MystenLabs/sui/7.1-framework-architecture)
- [sui-protocol-config source](https://github.com/MystenLabs/sui/blob/main/crates/sui-protocol-config/src/lib.rs)

### 보안

- [Cetus $223M Exploit — The Block](https://www.theblock.co/post/355795/sui-dex-cetus-open-source-library-flaw-smart-contract-223-million-usd-exploit)

### DeepBook
- [DeepBook V3 Documentation](https://docs.sui.io/standards/deepbook)
- [MystenLabs/deepbookv3 Repository](https://github.com/MystenLabs/deepbookv3)

### Oracle 및 DEX 비교
- [Sei Network Oracle System](https://docs.sei.io/learn/oracles)
- [Sei Orderbook-Focused L1 Guide](https://medium.com/coinmonks/a-guide-to-understanding-sei-network-the-first-order-book-focused-l1-blockchain-9cac7317ba54)
- [Injective Exchange Module](https://docs.injective.network/developers/modules/injective/exchange)
- [Injective Order Types](https://docs.trading.injective.network/learn/basics/order-types)
- [Pyth Oracle on Injective](https://www.pyth.network/blog/pyth-launches-price-oracles-on-injective)
- [Cosmos SDK BeginBlocker/EndBlocker](https://docs.cosmos.network/sdk/v0.50/build/building-modules/beginblock-endblock)

### 결정론성 및 합의
- [Determinism in Blockchain (Nervos)](https://www.nervos.org/knowledge-base/What_Does_Determinism_Mean_in_Blockchain_(explainCKBot))
- [Consensus for State Machine Replication](https://decentralizedthoughts.github.io/2019-10-15-consensus-for-state-machine-replication/)
- [Blockchain Oracle Problem (Chainlink)](https://chain.link/education-hub/oracle-problem)

### DEX 비교 및 시장 데이터
- [Hyperliquid vs Binance vs dYdX vs GMX (CoinCodeCap, Jan 2026)](https://coincodecap.com/hyperliquid-vs-binance-vs-dydx-vs-gmx)
- [dYdX vs GMX vs Hyperliquid vs Vertex (CoinSpot)](https://coinspot.io/en/analysis/dydx-gmx-hyperliquid-and-vertex-protocol-compared-a-trader-focused-rundown-for-picking-your-dex/)
- [Perpetual DEX Comparison: GMX vs dYdX vs Hyperliquid (Thrive)](https://thrive.fi/blog/defi/perp-dex-comparison-guide)
- [Best Perp DEX 2026 (CryptoTicker)](https://cryptoticker.io/en/comparison/best-perp-dex/)
- [Perpetual DEXs in 2025 (Atomic Wallet)](https://atomicwallet.io/academy/articles/perpetual-dexs-2025)
- [Perp DEX Tier List (Stacy Muur, X/Twitter)](https://x.com/stacy_muur/status/1992586960536527039)

### Fork 유지보수
- [Git Tricks for Maintaining a Long-Lived Fork](https://die-antwort.eu/techblog/2016-08-git-tricks-for-maintaining-a-long-lived-fork/)

### Nasun 내부 문서
- [PADO_NEXT_STEPS.md](apps/pado/docs/PADO_NEXT_STEPS.md) — 프로토콜 레벨 로드맵
- [COMPETITIVE_ANALYSIS.md](apps/pado/docs/COMPETITIVE_ANALYSIS.md) — 경쟁 분석
- [Handoff: TP/SL Architecture](.claude/handoffs/2026-02-15-tpsl-architecture.md) — 이전 세션 컨텍스트
