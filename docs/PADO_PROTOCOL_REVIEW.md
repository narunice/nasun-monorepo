# Pado Protocol Review: Architecture + Security

> 작성일: 2026-01-05
> 대상: Unified Margin v0 + DevOracle
> 상태: Devnet 배포 완료

---

# Part 1: Protocol Architecture Review

## 1. 설계 의도 대비 적절성 평가

### ✅ 적절한 결정들

| 설계 결정 | 평가 | 이유 |
|-----------|------|------|
| **MarginAccount = Owned Object** | 적절 | Sui의 ownership 모델 활용, 병렬 트랜잭션 가능, 사용자별 격리 |
| **MarginRegistry = Shared Object** | 적절 | TVL 추적에만 사용, 경합 최소화 (읽기 위주) |
| **단일 NUSDC 담보** | 적절 (v0) | 복잡도 제한, 스테이블코인 = 가치 변동 없음 → Oracle 불필요 |
| **DevOracle의 AdminCap 패턴** | 적절 | Devnet에서 간단한 권한 관리, Mainnet에서 교체 예정 명시됨 |
| **가격 freshness 체크 함수** | 적절 | Risk Engine 연동 시 stale price 방지 인프라 미리 확보 |

### ⚠️ 잠재적 우려 (v0에서는 괜찮음)

| 항목 | 현재 상태 | 우려 |
|------|-----------|------|
| **lock/unlock 메커니즘 미구현** | 주석으로만 존재 | Cross-product 마진 시 필수, v1에서 필요 |
| **Oracle-Margin 연동 미구현** | 분리됨 | v0.5에서 통합 시 인터페이스 설계 필요 |

---

## 2. v0 스코프 준수 판단

**판단: v0 스코프를 정확히 준수함.**

```
의도된 v0 범위:
├── NUSDC 입출금 ──────────── ✅ 구현됨
├── 계정 생성/조회 ─────────── ✅ 구현됨
├── Oracle 연동 ────────────── ❌ 의도적 미구현 (v0.5 예정)
├── Risk Engine 연동 ────────── ❌ 의도적 미구현 (v1 예정)
└── Cross-margin ──────────── ❌ 의도적 미구현 (v1 예정)
```

"Devnet에서 UX + 리스크 엔진 구조 검증"이라는 목적에 맞게:
- UX: Wallet → Margin 입출금 플로우 검증 가능
- 구조 검증: `MarginAccount` + `MarginRegistry` 구조가 v1 확장에 적합한지 테스트 가능

---

## 3. v1 확장 가능성 분석

### 🟢 자연스럽게 이어지는 부분

| v1 요구사항 | 현재 구조의 확장성 |
|-------------|-------------------|
| **Pyth Oracle 전환** | `DevOracle`의 `get_price()` 시그니처가 Pyth와 호환 가능. 별도 어댑터 모듈로 래핑하면 됨 |
| **다중 자산 지원** | `MarginAccount`에 `nbtc_balance`, `nasun_balance` 필드 추가 가능 (단, 업그레이드 필요) |
| **TVL 추적** | `MarginRegistry`가 이미 글로벌 통계 담당 → 자산별 TVL로 확장 가능 |

### 🟡 조건부 확장 가능

| v1 요구사항 | 현재 한계 | 해결 방법 |
|-------------|-----------|-----------|
| **Cross-margin (Trade/Predict/Perp 공유)** | `use_margin()`/`lock_margin()` 미구현 | v1에서 `IntegrationAuth` 패턴 도입 (주석에 이미 설계됨) |
| **담보 가치 평가** | Oracle 미연동 | `OracleRegistry` 참조를 `MarginAccount` view 함수에 추가 |
| **청산 로직** | 없음 | 별도 `RiskEngine` 모듈 생성, `MarginAccount`의 friend 권한 부여 |

### 🔴 구조 변경 필요

| v1 요구사항 | 문제 | 권장 해결책 |
|-------------|------|-------------|
| **다중 자산 Balance** | 현재 `nusdc_balance: Balance<NUSDC>`로 하드코딩 | **v1 전에 반드시 변경 필요** |

---

## 4. v1 전에 반드시 바꿔야 할 설계 결정

### 🔴 Critical: MarginAccount의 자산 구조

```move
// 현재 (v0) - 단일 자산 하드코딩
public struct MarginAccount has key, store {
    nusdc_balance: Balance<NUSDC>,  // ❌ 확장 불가
}

// 권장 (v1) - 다중 자산 지원
public struct MarginAccount has key, store {
    balances: Bag,  // 또는 Table<TypeName, Balance>
    // 또는
    nusdc_balance: Balance<NUSDC>,
    nbtc_balance: Balance<NBTC>,
    nasun_balance: Balance<NASUN>,
}
```

**이유:** Move에서 struct 필드는 업그레이드 시 추가 불가 (Sui의 upgrade 제약). v0에서 이 구조로 Mainnet 배포 시, 다중 자산 지원을 위해 완전히 새 컨트랙트 필요.

**권장 시점:** v0.5 또는 Mainnet 배포 전

---

### 🟡 Important: Oracle Interface 추상화

```
현재:
DevOracle.get_price(registry, symbol) → (u128, u128, u64)

권장:
trait IOracleAdapter:
  get_price(symbol) → PriceData

DevOracleAdapter implements IOracleAdapter
PythOracleAdapter implements IOracleAdapter
```

**이유:** Mainnet 전환 시 Pyth로 교체해야 함. 현재 DevOracle 직접 호출 시 모든 호출부 수정 필요.

**권장 시점:** v0.5 (Oracle 연동 시점)

---

### 🟡 Important: Cross-module Authorization

```move
// 현재 - 없음
// 권장 - Capability 기반 권한
public struct TradeAuth has key { ... }  // Trading module용
public struct PredictAuth has key { ... }  // Prediction module용

public fun use_margin(
    account: &mut MarginAccount,
    amount: u64,
    _auth: &TradeAuth,  // 권한 증명
): Balance<NUSDC> { ... }
```

**이유:** Cross-product 마진 시, 아무 모듈이나 `use_margin()` 호출하면 안 됨.

**권장 시점:** v1 (Cross-margin 구현 시점)

---

## 5. 끝까지 유지해도 좋은 핵심 설계 포인트

### ✅ Keep: MarginAccount as Owned Object

```
장점:
1. 병렬 트랜잭션 처리 (사용자별 독립)
2. 소유권 기반 접근 제어 (Sui 네이티브)
3. 가스 효율 (shared object 경합 없음)

대안 고려 X: Shared MarginPool은 확장성 저하
```

### ✅ Keep: MarginRegistry for Global Stats Only

```
장점:
1. 경합 최소화 (TVL 업데이트만)
2. 단일 진실 공급원 (total_accounts, total_tvl)
3. 관리자 대시보드용 데이터 제공

유지 이유: 개별 계정 데이터는 MarginAccount에, 집계는 Registry에 → 책임 분리 명확
```

### ✅ Keep: Event-based Audit Trail

```move
event::emit(Deposited { account_id, owner, amount, new_balance });
```

```
장점:
1. 모든 자금 이동 추적 가능
2. 오프체인 인덱싱 용이
3. 규정 준수 (Mainnet 대비)

유지 이유: 금융 프로토콜의 필수 요소
```

### ✅ Keep: DevOracle의 Pyth-compatible 시그니처

```move
get_price(registry, symbol) → (price: u128, confidence: u128, timestamp: u64)
```

```
장점:
1. Pyth 형식과 동일 (price, confidence, publish_time)
2. 8 decimals = Pyth 표준
3. 전환 시 어댑터만 교체하면 됨

유지 이유: Mainnet 전환 비용 최소화
```

---

## 6. 종합 평가

| 평가 항목 | 점수 | 코멘트 |
|-----------|------|--------|
| **v0 스코프 준수** | ⭐⭐⭐⭐⭐ | 의도적 단순화가 잘 지켜짐 |
| **책임 분리** | ⭐⭐⭐⭐ | Account/Registry 분리 적절, Oracle은 독립 모듈 |
| **v1 확장 가능성** | ⭐⭐⭐ | 대부분 확장 가능하나, 다중 자산 구조 변경 필요 |
| **Sui 네이티브 활용** | ⭐⭐⭐⭐⭐ | Owned/Shared 패턴, Capability 인증 적절 활용 |

---

# Part 2: Security Review

## 1. 권한/소유권/상태 불변식 분석

### 1.1 권한 (Authorization)

#### DevOracle

| 함수 | 권한 체크 | 취약점 |
|------|-----------|--------|
| `update_price()` | `&AdminCap` 소유 확인 | ✅ 안전 (Capability 패턴) |
| `batch_update()` | `&AdminCap` 소유 확인 | ✅ 안전 |
| `get_price()` | 없음 (public view) | ✅ 적절 (읽기 전용) |

**잠재적 이슈:**
```
⚠️ AdminCap 단일 장애점
- AdminCap을 분실하면 가격 업데이트 불가
- AdminCap이 탈취되면 임의 가격 조작 가능
- Devnet 허용 범위 ✅ / Mainnet에서 해결 필요 🔴
```

#### Unified Margin

| 함수 | 권한 체크 | 취약점 |
|------|-----------|--------|
| `create_account()` | 없음 (누구나 가능) | ✅ 적절 |
| `deposit()` | `account.owner == sender` | ✅ 안전 |
| `withdraw()` | `account.owner == sender` | ✅ 안전 |
| `withdraw_all()` | `withdraw()` 위임 | ✅ 안전 |

**잠재적 이슈:**
```
⚠️ 중복 계정 생성 가능
- 동일 주소가 여러 MarginAccount 생성 가능
- 프로토콜 의도: 1 user = 1 account
- 실제 영향: 자금 분산으로 UX 혼란, 보안 이슈는 아님
- Devnet 허용 범위 ✅ / v1에서 제한 권장
```

### 1.2 자산 소유권 (Asset Ownership)

```move
// MarginAccount 구조
public struct MarginAccount has key, store {
    nusdc_balance: Balance<NUSDC>,  // 잔액은 Account 내부에 저장
}
```

**분석:**
| 항목 | 상태 | 설명 |
|------|------|------|
| Balance 격리 | ✅ 안전 | 각 계정이 독립적 Balance 소유 |
| 출금 시 소유권 | ✅ 안전 | `transfer::public_transfer(coin, sender)` |
| 입금 시 검증 | ⚠️ 확인 필요 | Coin 소유자 검증 없음 (아래 상세) |

**입금 검증 이슈:**
```move
public fun deposit(
    account: &mut MarginAccount,
    registry: &mut MarginRegistry,
    payment: Coin<NUSDC>,  // ← 누가 보낸 Coin인지 체크 안 함
    ctx: &mut TxContext
) {
    let sender = tx_context::sender(ctx);
    assert!(account.owner == sender, ENotOwner);  // Account 소유자만 체크
    // payment 소유자 체크 없음
}
```

**결론:** Sui의 ownership 모델상, `Coin` 객체는 트랜잭션에 포함된 시점에서 이미 소유권이 증명됨 → **실제 취약점 아님** ✅

### 1.3 상태 불변식 (Invariants)

#### 검증된 불변식

| 불변식 | 구현 | 상태 |
|--------|------|------|
| `balance >= 0` | `Balance<T>` 타입 보장 | ✅ 언어 수준 보장 |
| `withdraw <= balance` | `assert!(balance >= amount)` | ✅ 명시적 체크 |
| `amount > 0` | `assert!(amount > 0, EZeroAmount)` | ✅ 명시적 체크 |

#### 미검증 불변식 (잠재적 이슈)

```
⚠️ TVL 일관성
MarginRegistry.total_tvl = Σ(모든 MarginAccount.nusdc_balance)

문제 시나리오:
1. deposit() 중간에 실패하면?
   → Sui의 트랜잭션 원자성으로 롤백됨 ✅

2. withdraw()에서 TVL 감소 순서
   account.total_withdrawn += amount;  // 통계 먼저
   registry.total_tvl -= amount;       // TVL 감소
   transfer::public_transfer(coin);    // 코인 전송
   → 모두 같은 트랜잭션 내 → 원자적 ✅
```

**결론:** Sui 트랜잭션 원자성으로 TVL 불일치 위험 없음 ✅

---

## 2. 리스크 분류

### 🟡 Devnet 허용 가능한 리스크

| 리스크 | 이유 | Mainnet 해결 필요 |
|--------|------|-------------------|
| AdminCap 단일 소유 | Devnet = 테스트 환경, 관리자 1명 | ✅ Multi-sig 도입 |
| 중복 계정 생성 | 자금 손실 없음, UX만 혼란 | ✅ 1 user = 1 account 제한 |
| Oracle 가격 조작 | AdminCap 소유자 = 프로토콜 운영자 | ✅ Pyth 전환 |
| 가격 freshness 미체크 | Risk Engine 미연동 상태 | ✅ v0.5에서 연동 |

### 🔴 Devnet에서도 수정 필요한 리스크

| 리스크 | 심각도 | 설명 | 권장 조치 |
|--------|--------|------|-----------|
| **없음** | - | 현재 구현에서 즉시 수정 필요한 보안 이슈 없음 | - |

---

## 3. Admin/Bot/Oracle 실패 시나리오

### 3.1 Admin 키 관련

| 시나리오 | 영향 | 복구 방법 |
|----------|------|-----------|
| AdminCap 분실 | 가격 업데이트 불가 | 새 패키지 배포 필요 |
| AdminCap 탈취 | 임의 가격 조작 가능 | 새 패키지 배포, 사용자 알림 |
| Admin 오프라인 | 가격 업데이트 중단 | 자동화 봇 필요 |

### 3.2 Price Update Bot

| 시나리오 | 영향 | 완화 방법 |
|----------|------|-----------|
| Bot 다운타임 | 가격 stale | `is_fresh()` 체크로 stale 가격 거부 |
| Bot 중복 업데이트 | 가스 낭비 (보안 이슈 아님) | 업데이트 간격 제어 |
| Bot 악의적 가격 전송 | 가격 조작 | AdminCap 권한 분리 (Multi-sig) |

### 3.3 Oracle 구조

| 시나리오 | 영향 | 현재 대응 |
|----------|------|-----------|
| 가격 피드 누락 | 거래 불가 | `E_FEED_NOT_FOUND` 에러 |
| Stale 가격 | 잘못된 청산 | `is_fresh()` 함수 제공 (미사용) |
| Integer overflow | 비정상 가격 | `u128` 사용으로 충분한 범위 |

---

## 4. v1 (Mainnet) 전 보안 TODO 체크리스트

### 🔴 Critical (배포 전 필수)

- [ ] **Multi-sig AdminCap**
  - 단일 키 → N-of-M 다중서명
  - 또는 Pyth 전환으로 Admin 제거

- [ ] **Oracle 전환**
  - DevOracle → Pyth Oracle
  - 가격 조작 위험 제거

- [ ] **Freshness 강제**
  ```move
  // 현재: 선택적
  public fun is_fresh(...): bool

  // 권장: 필수
  public fun get_price_checked(...): (u128, u128) {
      assert!(is_fresh(...), E_PRICE_STALE);
  }
  ```

### 🟡 Important (v1 안정화 단계)

- [ ] **계정 중복 방지**
  ```move
  // 권장: Registry에서 추적
  public struct MarginRegistry {
      accounts: Table<address, ID>,  // 1 user = 1 account
  }
  ```

- [ ] **Rate Limiting**
  - 빠른 연속 출금 방지
  - 대규모 출금 시 딜레이

- [ ] **Emergency Pause**
  ```move
  public struct MarginRegistry {
      paused: bool,
  }

  public fun deposit(...) {
      assert!(!registry.paused, E_PROTOCOL_PAUSED);
  }
  ```

### 🟢 Nice to Have (장기)

- [ ] **Audit Trail 강화**
  - 모든 Admin 작업 이벤트 로깅
  - 가격 변경 히스토리

- [ ] **Upgrade Timelock**
  - 패키지 업그레이드 시 24h 딜레이
  - 커뮤니티 검토 시간 확보

---

## 5. 종합 보안 평가

| 영역 | Devnet 점수 | Mainnet 준비도 |
|------|-------------|----------------|
| 권한 관리 | ⭐⭐⭐⭐ | 🟡 Multi-sig 필요 |
| 자산 안전 | ⭐⭐⭐⭐⭐ | ✅ 준비됨 |
| 상태 일관성 | ⭐⭐⭐⭐⭐ | ✅ 준비됨 |
| Oracle 신뢰성 | ⭐⭐⭐ | 🔴 Pyth 전환 필수 |
| 비상 대응 | ⭐⭐ | 🔴 Pause 기능 필요 |

---

## 최종 결론

### 권장 사항 요약

```
즉시 필요 없음 (v0 유지):
✓ 현재 구조로 Devnet UX/구조 검증 충분

v0.5 전에 검토:
⚠️ Oracle 어댑터 인터페이스 정의
⚠️ 다중 자산 Balance 구조 결정

v1 (Mainnet) 전에 필수:
🔴 MarginAccount 자산 구조 마이그레이션
🔴 Cross-module Authorization 구현
🔴 Pyth Oracle 어댑터 구현
🔴 Multi-sig AdminCap 또는 Admin 제거
🔴 Emergency Pause 기능
```

**최종 결론:**
- Devnet: ✅ 현재 상태로 테스트 진행 가능
- Mainnet: 🟡 5개 Critical 항목 해결 후 배포

---

# Part 3: UX Review (PM 관점)

## 1. "사용자가 머릿속으로 이해할 수 있는가?"

### 현재 구현된 개념 구조

```
사용자의 머릿속 예상:
"내 지갑에 돈이 있으면 거래할 수 있다"

실제 Pado 구조:
┌─────────────────────────────────────────────────────────────┐
│  Wallet (지갑)                                               │
│  └── NUSDC: 1,000 ← 직접 사용 가능 (Trade, Predict)          │
│                                                              │
│  Unified Margin (별도 계정)                                   │
│  └── NUSDC: 500 ← Deposit 해야 생김, 아직 미사용            │
└─────────────────────────────────────────────────────────────┘

Gap: 사용자는 "왜 두 군데에 돈이 있지?"라고 느낌
```

### 이해도 평가

| 개념 | 이해 가능성 | 문제점 |
|------|-------------|--------|
| "Unified Margin" | 🟡 낮음 | "Margin"은 레버리지/담보를 연상. "통합"의 의미 불분명 |
| "Create Account" | 🟡 중간 | 지갑 계정 vs Margin 계정 혼동 |
| "Deposit/Withdraw" | 🟢 높음 | 익숙한 용어 |
| "Wallet vs Margin" 선택 | 🔴 낮음 | 둘 다 내 돈인데 왜 선택? |

---

## 2. 사용자가 헷갈릴 가능성이 높은 포인트

### 2.1 용어 혼란

| 현재 용어 | 사용자 예상 | 실제 의미 | 권장 변경 |
|-----------|-------------|-----------|-----------|
| **"Unified Margin"** | 레버리지 거래? | 통합 자금 풀 | **"Trading Balance"** 또는 **"Pado Balance"** |
| **"Create Account"** | 새 지갑 만들기? | Margin 계정 활성화 | **"Activate Trading"** 또는 **"Enable"** |
| **"Deposit"** | 외부에서 입금 | 내 지갑 → Margin 이동 | **"Move to Trading"** 또는 **"Fund"** |
| **"Wallet Balance"** | 전체 잔액 | 지갑에 남은 잔액 | **"Direct Balance"** |

### 2.2 화면 혼란

| 화면 | 혼란 요소 | 사용자 반응 |
|------|-----------|-------------|
| **Wallet 페이지 상단 MarginAccountCard** | 갑자기 "Create Account" 버튼 등장 | "지갑은 이미 만들었는데?" |
| **Predict 페이지 Funding Source** | Wallet/Margin 토글 | "둘 다 내 돈인데 왜 고르지?" |
| **Margin 잠금 아이콘 (🔒)** | 왜 잠겨있는지 설명 없음 | "뭘 해야 열리지?" |

### 2.3 상태 혼란

```
시나리오: 사용자가 Predict 페이지 방문

현재 상태 표시:
┌────────────────────────┐
│ Wallet: 1,000 NUSDC    │  ← "이건 사용 가능"
│ Margin: 🔒             │  ← "이건 뭐지? 왜 잠김?"
└────────────────────────┘

사용자 혼란:
- "내 돈이 1,000인데 왜 Margin은 0이지?"
- "🔒가 뭘 의미하지?"
- "어디서 풀지?"
```

---

## 3. 실수로 손해 볼 수 있는 UX 포인트

### 🔴 Critical Risk

| 시나리오 | 손해 | 현재 대응 | 권장 대응 |
|----------|------|-----------|-----------|
| **MAX로 전액 Deposit** | 가스비 부족으로 다른 거래 불가 | ❌ 없음 | "Keep 0.1 NASUN for gas" 경고 |
| **Margin 선택 후 주문 → 실제론 Wallet 사용** | 예상과 다른 잔액 차감 | ❌ fundingSource 미사용 | fundingSource 실제 적용 |
| **Withdraw 중 네트워크 오류** | 자금 상태 불명확 | ❌ 없음 | Pending 상태 표시 + 재시도 안내 |

### 🟡 Medium Risk

| 시나리오 | 손해 | 현재 대응 |
|----------|------|-----------|
| 중복 Margin 계정 생성 | 자금 분산, 혼란 | ❌ 없음 |
| Margin에 자금 넣고 Wallet으로 거래 시도 | 잔액 부족 에러 | 일반 에러 메시지 |
| 거래 성공 후 잔액 미갱신 | 잔액 혼란 | 1.5초 대기 후 refetch |

---

## 4. v0에서 반드시 있어야 할 UX 피드백

### 4.1 필수 Warning (즉시 추가)

```
1. MAX Deposit 시:
   ⚠️ "Depositing all NUSDC. Keep at least 0.1 NASUN for transaction fees."
   [Keep 0.1 NASUN] [Deposit All Anyway]

2. Margin 잠금 상태:
   🔒 "Create a Margin Account to use funds across all Pado features"
   [Go to Wallet → Create Account]

3. Withdraw 시 잔액 부족:
   ⚠️ "Cannot withdraw more than available balance: {balance} NUSDC"
```

### 4.2 필수 Hint (즉시 추가)

```
1. Margin Account 생성 화면:
   ℹ️ "Unified Margin lets you use one balance for Trading, Predictions, and more.
       Think of it as your 'trading wallet' within Pado."

2. Funding Source 선택:
   ℹ️ "Wallet: Use tokens directly from your wallet
       Margin: Use your Pado trading balance (faster, lower fees)"

3. 첫 Deposit 시:
   ℹ️ "Moving NUSDC to your Margin Account. You can withdraw anytime."
```

### 4.3 필수 State 표시

| 상태 | 현재 | 권장 |
|------|------|------|
| 트랜잭션 진행 중 | "Creating..." | "Creating account... (10s)" |
| 성공 | 간단한 메시지 | ✅ + 요약 + 잔액 변화 |
| 실패 | 에러 메시지만 | ❌ + 원인 + 재시도 버튼 |
| 블록체인 동기화 | "Syncing..." | "Confirming on blockchain... (5s)" |

---

## 5. v1까지 미뤄도 되는 UX 개선

### 🟢 v1에서 해도 됨

| 개선 | 이유 |
|------|------|
| **잔액 변화 애니메이션** | 이해도에 영향 없음 |
| **상세 거래 히스토리** | 기본 기능에 집중 |
| **P&L (손익) 표시** | 복잡도 증가 |
| **자동 가스 예약** | 고급 기능 |
| **Margin <-> Wallet 원클릭 이동** | 편의 기능 |
| **예상 체결 시간 표시** | 예측 어려움 |
| **거래 알림 (Push)** | 인프라 필요 |

### 🟡 v0.5에서 고려

| 개선 | 이유 |
|------|------|
| **온보딩 플로우** | 첫 사용자 이탈 방지 |
| **Margin 통합 사용** | 핵심 가치 구현 |
| **에러 복구 안내** | 사용자 신뢰 |

---

## 6. 권장 UX 개선 우선순위

### 즉시 (v0 완성 전)

```
Priority 1 - 손해 방지:
□ MAX Deposit 가스비 경고
□ fundingSource 실제 적용 (현재 UI만 있음)
□ Pending 상태 명확한 표시

Priority 2 - 이해도 향상:
□ "Unified Margin" → "Trading Balance" 용어 변경
□ 🔒 상태에 "어디서 해제" 안내 추가
□ Margin 생성 화면에 "왜 필요한지" 한 줄 설명
```

### 단기 (v0.5)

```
□ 온보딩 튜토리얼 (첫 방문 시)
□ Margin ↔ Wallet 통합 잔액 표시
□ 거래 결과 상세 피드백
```

### 중기 (v1)

```
□ 상세 히스토리
□ P&L 대시보드
□ 알림 시스템
```

---

## 7. 핵심 UX 메트릭 (추적 권장)

| 메트릭 | 측정 방법 | 목표 |
|--------|-----------|------|
| **Margin 생성 전환율** | 버튼 노출 → 생성 완료 | > 50% |
| **첫 Deposit 완료율** | 계정 생성 → 첫 Deposit | > 70% |
| **Funding Source 혼란율** | Margin 선택 → Wallet 사용 시도 | < 10% |
| **에러 후 이탈율** | 에러 발생 → 세션 종료 | < 20% |

---

## 8. 종합 UX 평가

| 영역 | 현재 점수 | 주요 문제 |
|------|-----------|-----------|
| **개념 이해도** | ⭐⭐ | "Unified Margin" 용어가 직관적이지 않음 |
| **에러 방지** | ⭐⭐ | MAX Deposit 가스비 문제, fundingSource 미적용 |
| **피드백 명확성** | ⭐⭐⭐ | 성공/실패는 있으나 상태 전환 불명확 |
| **회복 가능성** | ⭐⭐ | 에러 후 다음 행동 안내 부족 |
| **학습 용이성** | ⭐⭐ | 왜 필요한지 설명 부족 |

**종합: ⭐⭐ (개선 필요)**

---

## 최종 UX 권장사항

### Devnet v0에서 반드시 수정

1. **fundingSource 실제 동작** - 현재 UI만 있고 실제 Margin에서 자금 사용 안 됨
2. **가스비 경고** - MAX Deposit 시 최소 가스비 예약 안내
3. **용어 정리** - "Unified Margin" → "Trading Balance" 또는 "Pado Balance"

### 권장 용어 변경

| 현재 | 권장 |
|------|------|
| Unified Margin | **Trading Balance** |
| Create Account | **Enable Trading Balance** |
| Deposit | **Add Funds** 또는 **Transfer In** |
| Withdraw | **Transfer Out** |
| Wallet Balance | **Wallet** |
| Margin Balance | **Trading Balance** |

---

*Last updated: 2026-01-05*
