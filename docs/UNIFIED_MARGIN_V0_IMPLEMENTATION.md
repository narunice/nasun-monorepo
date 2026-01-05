# Unified Margin v0 Implementation Report

> 작성일: 2026-01-04
> 버전: v0.1.0
> 상태: **Devnet 배포 완료**

---

## 1. Executive Summary

### 목적

**"One Account, One Margin Pool, Every Asset Works Harder"**

기존 Pado의 잔고 이원화 문제를 해결하기 위한 Unified Margin 시스템 v0 구현.

### 문제 정의

```
AS-IS (문제):
┌─────────────────┐      ┌─────────────────┐
│ BalanceManager  │      │   Wallet 잔고    │
│   (DeepBook)    │      │   (직접 사용)    │
└─────────────────┘      └─────────────────┘
        ↓                        ↓
   Spot Trading           Predict/Earn/Wallet

   → 자금 분산, UX 혼란, 자본 효율성 저하

TO-BE (해결):
┌─────────────────────────────────────────┐
│         Unified Margin Account          │
│            (NUSDC 단일 풀)              │
└─────────────────────────────────────────┘
                    ↓
        모든 상품에서 공유 가능
```

### 구현 범위 (v0)

| 기능 | v0 | v0.5 (예정) | v1 (예정) |
|------|:--:|:-----------:|:---------:|
| NUSDC 입출금 | ✅ | ✅ | ✅ |
| 계정 생성/조회 | ✅ | ✅ | ✅ |
| Oracle 연동 | ❌ | ✅ | ✅ |
| 담보 평가 | ❌ | ✅ | ✅ |
| Risk Engine 연동 | ❌ | ❌ | ✅ |
| Cross-margin | ❌ | ❌ | ✅ |

---

## 2. Architecture

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  WalletPage.tsx                                              │
│  └── MarginAccountCard.tsx                                   │
│       └── useMarginAccount.ts (React Hook)                   │
│            └── unified-margin.ts (Client Library)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Devnet (Sui)                        │
├─────────────────────────────────────────────────────────────┤
│  unified_margin.move                                         │
│  ├── MarginAccount (user-owned)                              │
│  └── MarginRegistry (shared)                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
User Action          Frontend                 On-chain
───────────────────────────────────────────────────────────────
Create Account  →  buildCreateAccountTx()  →  create_account()
                                               ├── MarginAccount 생성
                                               └── MarginRegistry 업데이트

Deposit NUSDC   →  buildDepositWithSplitTx() → deposit()
                   (NUSDC 코인 split)          ├── Balance 증가
                                               └── TVL 증가

Withdraw NUSDC  →  buildWithdrawTx()        →  withdraw()
                                               ├── Balance 감소
                                               └── TVL 감소
```

---

## 3. Smart Contract

### 3.1 파일 구조

```
apps/pado/contracts-margin/
├── Move.toml
└── sources/
    └── unified_margin.move
```

### 3.2 핵심 데이터 구조

```move
/// User's unified margin account (Owned Object)
public struct MarginAccount has key, store {
    id: UID,
    owner: address,
    nusdc_balance: Balance<NUSDC>,
    total_deposited: u64,
    total_withdrawn: u64,
    created_at: u64,
    last_updated: u64,
}

/// Global registry for TVL tracking (Shared Object)
public struct MarginRegistry has key {
    id: UID,
    total_accounts: u64,
    total_tvl: u64,
}
```

### 3.3 주요 함수

| 함수 | 설명 | 접근 제어 |
|------|------|----------|
| `create_account()` | 새 MarginAccount 생성 | Public |
| `deposit()` | NUSDC 입금 | Owner only |
| `withdraw()` | 지정 금액 출금 | Owner only |
| `withdraw_all()` | 전액 출금 | Owner only |
| `get_available_margin()` | 사용 가능 잔액 조회 | View |

### 3.4 이벤트

```move
public struct AccountCreated has copy, drop {
    account_id: ID,
    owner: address,
    timestamp: u64,
}

public struct Deposited has copy, drop {
    account_id: ID,
    owner: address,
    amount: u64,
    new_balance: u64,
}

public struct Withdrawn has copy, drop {
    account_id: ID,
    owner: address,
    amount: u64,
    new_balance: u64,
}
```

### 3.5 에러 코드

| 코드 | 이름 | 설명 |
|------|------|------|
| 0 | `EInsufficientBalance` | 잔액 부족 |
| 1 | `EZeroAmount` | 0 금액 시도 |
| 2 | `ENotOwner` | 소유자 아님 |

---

## 4. Frontend Implementation

### 4.1 파일 구조

```
apps/pado/frontend/src/
├── lib/
│   └── unified-margin.ts           # Client library
├── features/core/unified-margin/
│   ├── index.ts                    # Exports
│   ├── useMarginAccount.ts         # React Hook
│   ├── useUnifiedMargin.ts         # Balance unification hook
│   └── MarginAccountCard.tsx       # UI Component
└── pages/
    └── WalletPage.tsx              # Integration point
```

### 4.2 Client Library (`unified-margin.ts`)

```typescript
// Constants
export const UNIFIED_MARGIN_PACKAGE = '0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7';
export const MARGIN_REGISTRY_ID = '0x57979cb0f06a61c65f0f26a41cb3c53461e4c5638bed6740797a80bbb8fe3914';

// Transaction Builders
export function buildCreateAccountTx(): Transaction;
export function buildDepositWithSplitTx(accountId: string, coinId: string, amount: bigint): Transaction;
export function buildWithdrawTx(accountId: string, amount: bigint): Transaction;
export function buildWithdrawAllTx(accountId: string): Transaction;

// Query Functions
export async function getMarginAccount(accountId: string): Promise<MarginAccountData | null>;
export async function findUserMarginAccount(userAddress: string): Promise<string | null>;
export async function getMarginRegistryStats(): Promise<{ totalAccounts: number; totalTvl: bigint }>;

// LocalStorage helpers
export function getStoredMarginAccountId(): string | null;
export function storeMarginAccountId(id: string): void;
```

### 4.3 React Hook (`useMarginAccount.ts`)

```typescript
interface UseMarginAccountResult {
  // Account state
  account: MarginAccountData | null;
  accountId: string | null;
  isLoading: boolean;
  error: Error | null;
  hasAccount: boolean;

  // Actions
  createAccount: () => Promise<void>;
  deposit: (nusdcCoinId: string, amount: bigint) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  withdrawAll: () => Promise<void>;

  // Loading states
  isCreating: boolean;
  isDepositing: boolean;
  isWithdrawing: boolean;

  // Utilities
  refetch: () => void;
}

export function useMarginAccount(): UseMarginAccountResult;
```

**특징:**
- `@tanstack/react-query`로 상태 관리
- LocalStorage에 accountId 캐싱 (빠른 재접속)
- 자동 account discovery (on-chain 검색)
- 트랜잭션 후 자동 refetch

### 4.4 UI Component (`MarginAccountCard.tsx`)

**상태별 UI:**

| 상태 | UI |
|------|-----|
| 지갑 미연결 | "Connect wallet to manage Unified Margin" |
| 로딩 중 | Skeleton loading |
| 계정 없음 | "Create Account" 버튼 |
| 계정 있음 | 잔액 + Deposit/Withdraw 버튼 |

**기능:**
- 실시간 NUSDC 잔액 표시
- Total Deposited / Total Withdrawn 통계
- Deposit Modal (MAX 버튼, 잔액 표시)
- Withdraw Modal (MAX 버튼, 사용 가능 잔액 표시)
- 에러 핸들링

---

## 5. Deployment Information

### 5.1 On-chain Addresses

| 항목 | 주소 |
|------|------|
| **Package** | `0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7` |
| **MarginRegistry** | `0x57979cb0f06a61c65f0f26a41cb3c53461e4c5638bed6740797a80bbb8fe3914` |
| **pado_tokens (NUSDC)** | `0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489` |

### 5.2 의존성

```toml
[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "...", rev = "framework/testnet" }
pado_tokens = { local = "../contracts" }  # NUSDC 타입 참조
```

---

## 6. Security Considerations

### 6.1 현재 구현된 보안

| 항목 | 구현 |
|------|------|
| Owner 검증 | `assert!(account.owner == sender, ENotOwner)` |
| Zero amount 방지 | `assert!(amount > 0, EZeroAmount)` |
| Insufficient balance 방지 | `assert!(balance >= amount, EInsufficientBalance)` |
| Object ownership | Sui의 owned object 모델 활용 |

### 6.2 v0 한계 (향후 개선 필요)

| 항목 | 현재 | 향후 계획 |
|------|------|----------|
| 담보 평가 | 없음 (1:1 NUSDC) | Oracle 연동 |
| 청산 로직 | 없음 | Risk Engine 연동 |
| 다중 자산 | NUSDC only | NBTC, NASUN 추가 |
| Cross-product 마진 | 미구현 | v1에서 구현 |

---

## 7. Testing

### 7.1 수동 테스트 완료

```bash
# 1. Account 생성 테스트
sui client call --package $PACKAGE --module unified_margin --function create_account ...
# ✅ MarginAccount 생성 확인

# 2. Deposit 테스트 (프론트엔드에서)
# ✅ NUSDC 입금 후 잔액 증가 확인

# 3. Withdraw 테스트 (프론트엔드에서)
# ✅ NUSDC 출금 후 잔액 감소 확인
```

### 7.2 Unit Test (TODO)

```move
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}

// TODO: Add comprehensive tests
// - test_create_account
// - test_deposit
// - test_withdraw
// - test_withdraw_all
// - test_insufficient_balance
// - test_not_owner
```

---

## 8. Integration Points

### 8.1 현재 통합

| 위치 | 컴포넌트 | 설명 |
|------|----------|------|
| `/wallet` | MarginAccountCard | Wallet 페이지 상단에 표시 |

### 8.2 향후 통합 계획

```
Phase 1 (v0.5):
├── TradePage → Unified Margin 잔액으로 거래
├── PredictPage → Unified Margin에서 베팅
└── EarnPage → Unified Margin에서 스테이킹

Phase 2 (v1):
├── HomePage Dashboard → Net Worth에 Margin 잔액 포함
├── Risk Engine → 담보 가치 평가
└── Perp Market → Cross-margin 지원
```

---

## 9. File Summary

| 파일 | 라인 | 설명 |
|------|------|------|
| `unified_margin.move` | ~250 | Smart contract |
| `unified-margin.ts` | ~180 | Client library |
| `useMarginAccount.ts` | ~245 | React hook |
| `MarginAccountCard.tsx` | ~340 | UI component |
| `index.ts` | ~12 | Exports |

**총 구현량: ~1,030 lines**

---

## 10. Known Issues & Limitations

### v0 한계

1. **단일 자산**: NUSDC만 지원 (NBTC, NASUN 미지원)
2. **Oracle 미연동**: 담보 가치 = 입금액 (1:1)
3. **Risk 관리 없음**: 청산 로직 없음
4. **Cross-product 없음**: 각 상품이 독립적으로 잔액 사용

### 알려진 버그

- 없음 (발견 시 업데이트)

---

## 11. Next Steps

### 즉시 (이번 주)

1. [ ] Spot Trading에서 Unified Margin 잔액 사용 옵션 추가
2. [ ] HomePage Net Worth에 Margin 잔액 포함
3. [ ] Unit test 작성

### 단기 (v0.5)

1. [ ] Oracle 연동 (DevOracle)
2. [ ] 담보 가치 평가 (NUSDC × Oracle Price)
3. [ ] Prediction Market에서 Unified Margin 사용

### 중기 (v1)

1. [ ] Risk Engine 연동
2. [ ] 다중 자산 지원 (NBTC, NASUN)
3. [ ] Cross-margin for Perp

---

## 12. Review Questions for AI

퍼플렉시티/ChatGPT 검토 요청사항:

1. **보안**: Owner 검증만으로 충분한가? 추가 필요한 검증은?

2. **확장성**: v1에서 다중 자산 지원 시 현재 구조 변경이 필요한가?

3. **가스 최적화**: deposit/withdraw 함수의 가스 효율성은?

4. **UX**: LocalStorage에 accountId 캐싱하는 방식의 장단점?

5. **테스트**: 어떤 edge case 테스트가 필요한가?

---

*이 문서는 Unified Margin v0 구현 완료 시점의 스냅샷입니다.*
*Last updated: 2026-01-04*
