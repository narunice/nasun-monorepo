# Pado Lottery (Phase 17)

> 배포일: 2026-01-09 (v2 Multi-Tier)

## 1. Overview

### 1.1 Product Definition
- **Name**: Pado Lottery v2
- **Positioning**: Pado 금융앱 내 "저위험 소액 엔터테인먼트" 상품
- **Core Value**: 주간 롤오버로 잭팟이 커지는 단순한 온체인 로또

### 1.2 Design Principles
1. **Prediction Market 패턴 재사용**: Round 관리, NFT 티켓, claim 정산
2. **회계적 독립**: Unified Margin과 분리된 담보 시스템
3. **검증 가능한 난수**: Sui Random 모듈 활용
4. **Multi-Tier Prizes**: Jackpot (5 match), 2nd (4 match), 3rd (3 match)
5. **Permissionless Keeper**: 시간 기반 자동화 지원

---

## 2. Game Rules

### 2.1 Basic Specs
| Spec | Value |
|------|-------|
| Draw Cycle | Weekly (Wednesday 21:00 KST) |
| Number Range | 1-32 |
| Numbers to Pick | 5 |
| Total Combinations | 201,376 (32C5) |
| Ticket Price | 1 NUSDC |
| Max Tickets per Address | 100 |

### 2.2 Prize Distribution
```
Total Sales 100%
├── 70% → Prize Pool
│   ├── 60% → Tier 1: Jackpot (5 numbers match)
│   ├── 25% → Tier 2: 2nd Prize (4 numbers match)
│   └── 15% → Tier 3: 3rd Prize (3 numbers match)
├── 20% → Rollover (Next Round)
└── 10% → Treasury (Operations)

No Winners in a Tier:
  Unclaimed tier share → Rollover
```

### 2.3 Winning Conditions (v2 Multi-Tier)
| Tier | Match | Prize Share (of 70% pool) | Example |
|------|-------|--------------------------|---------|
| Tier 1 (Jackpot) | 5/5 numbers | 60% | All 5 match |
| Tier 2 | 4/5 numbers | 25% | 4 of 5 match |
| Tier 3 | 3/5 numbers | 15% | 3 of 5 match |

- Order-independent matching (numbers sorted)
- Multiple winners within a tier: equal split

---

## 3. Smart Contract

### 3.1 Deployed Addresses (Nasun Devnet V7)
| Item | Address |
|------|---------|
| Package | `0xd56f405af7127a15e30a5104ec91574a7483699e5ac1d74383ed5478aee43900` |
| LotteryRegistry | `0xe08f1d01bb02b4d2832fb5583adf9a84298cd1b541781635c07b0231d2795305` |
| AdminCap | `0x458103338d5ec829dadc9df48ae359f8499639db7df56b648f9dcc75466fb339` |
| UpgradeCap | `0x96e881562f99afeefb41e3ce2b403e5f84e5639875ebc1e326488b5085c27ee0` |

### 3.2 Module Structure
```
apps/pado/contracts-lottery/
├── Move.toml
└── sources/
    └── lottery.move
```

### 3.3 Core Structs

```move
/// Admin capability
public struct AdminCap has key, store { id: UID }

/// Global registry (shared)
public struct LotteryRegistry has key {
    id: UID,
    current_round: u64,
    treasury_balance: Balance<NUSDC>,
    treasury_address: address,
    next_ticket_id: u64,
}

/// Lottery round (shared)
public struct LotteryRound has key {
    id: UID,
    round_number: u64,
    status: u8,                    // 0=OPEN, 1=CLOSED, 2=DRAWN, 3=SETTLED
    start_time: u64,
    close_time: u64,
    draw_time: u64,
    prize_pool: Balance<NUSDC>,
    rollover_in: u64,
    drawn_numbers: Option<vector<u8>>,
    ticket_count: u64,
    total_sales: u64,
    jackpot_winners: u64,
    jackpot_payout_per_winner: u64,
    tickets_by_address: Table<address, u64>,
}

/// Ticket NFT (owned)
public struct Ticket has key, store {
    id: UID,
    ticket_id: u64,
    round_id: ID,
    round_number: u64,
    owner: address,
    numbers: vector<u8>,           // Sorted 5 numbers
    purchase_time: u64,
    is_claimed: bool,
}
```

### 3.4 Entry Functions

| Function | Permission | Description |
|----------|------------|-------------|
| `create_round` | Admin | Create new lottery round |
| `buy_ticket` | User | Buy ticket with 5 selected numbers |
| `close_round` | Admin | Close ticket sales |
| `draw_numbers` | Admin | Draw winning numbers using Sui Random |
| `settle_round` | Admin | Settle round (distribute rollover/treasury) |
| `claim_prize` | User | Claim winning prize |
| `burn_ticket` | User | Burn non-winning ticket |
| `withdraw_treasury` | Admin | Withdraw treasury balance |

### 3.5 Round Status Flow
```
OPEN (0) → CLOSED (1) → DRAWN (2) → SETTLED (3)
   │           │            │            │
   │           │            │            └── Rollover distributed
   │           │            └── Winning numbers revealed
   │           └── Ticket sales ended
   └── Ticket sales active
```

### 3.6 Random Number Generation (Sui Random)
```move
fun draw_lottery_numbers(r: &Random, ctx: &mut TxContext): vector<u8> {
    let mut g = random::new_generator(r, ctx);
    let mut numbers: vector<u8> = vector::empty();
    let mut drawn: vector<bool> = vector::empty();
    // ... draw 5 unique numbers from 1-32
    sort_numbers(&mut numbers);
    numbers
}
```

---

## 4. Frontend Module

### 4.1 Module Structure
```
apps/pado/frontend/src/features/lottery/
├── index.ts                  # Main exports
├── constants.ts              # Package ID, Object IDs, Game constants
├── types.ts                  # TypeScript types
├── transactions.ts           # Transaction builders
├── lib/
│   └── lottery-client.ts     # On-chain data fetching
├── hooks/
│   ├── useLotteries.ts       # Registry & round list
│   ├── useLotteryRound.ts    # Round details
│   ├── useMyTickets.ts       # User's tickets
│   └── useLotteryActions.ts  # Buy/Claim actions
└── components/
    ├── LotteryRoundCard.tsx  # Round info card
    ├── TicketPurchaseForm.tsx # Number selection UI
    ├── MyTicketList.tsx      # User's ticket list
    ├── WinningNumbers.tsx    # Winning numbers display
    └── LotteryCountdown.tsx  # Countdown timer
```

### 4.2 Pages
| Route | Component | Description |
|-------|-----------|-------------|
| `/lottery` | LotteryPage | Main lottery page with purchase form |
| `/lottery/:roundId` | LotteryRoundPage | Round details & ticket list |

### 4.3 Key Components

**TicketPurchaseForm**:
- 1-32 number grid with selection highlighting
- Selected numbers display (sorted)
- Quick Pick button (frontend Math.random)
- Price display + Purchase button

**LotteryRoundCard**:
- Round number, status badge
- Current prize pool (including rollover)
- Countdown to draw
- Winning numbers (after draw)

**MyTicketList**:
- List of user's tickets for the round
- Match count display
- Claim Prize / Burn Ticket buttons

---

## 5. Transaction Builders

```typescript
// Buy ticket
function buildBuyTicket(
  roundId: string,
  nusdcCoinId: string,
  numbers: number[]  // 5 numbers, 1-32
): Transaction

// Claim prize (winner)
function buildClaimPrize(
  roundId: string,
  ticketId: string
): Transaction

// Burn ticket (non-winner)
function buildBurnTicket(
  roundId: string,
  ticketId: string
): Transaction

// Admin: Create round
function buildCreateRound(
  closeTime: number,
  drawTime: number,
  rolloverAmount: bigint,
  adminCapId: string
): Transaction

// Admin: Draw numbers
function buildDrawNumbers(
  roundId: string,
  adminCapId: string
): Transaction
```

---

## 6. Security Considerations

### 6.1 MEV/Front-running Defense
- Ticket purchase blocked after `close_time`
- `draw_numbers` only callable after `close_time`
- Sui Random determined at transaction execution time

### 6.2 Mass Ticket Purchase Attack

**Definition**: Attacker purchases all (or nearly all) number combinations to turn "probability game" into "guaranteed profit game"

**Numbers in this Structure**:
- Total combinations: 32C5 = 201,376
- Cost to cover all: ~201,376 NUSDC
- Pool distribution: 70% (+ rollover)
- Attacker guaranteed jackpot → absorbs other participants' funds

**v1 Mitigation: Ticket Limit (100 per address)**
- Effect: Requires minimum 2,014 addresses to cover all combinations → reduced ROI, increased automation complexity
- Limitation: Cannot fully prevent Sybil attack
- Goal: **Cost increase device, not complete defense**

**Structural Limitation Acknowledgment (Important)**:
> Due to low ticket price and limited combinations, this lottery has structural
> limitations where sufficient capital and account distribution can artificially
> improve expected value. v1 mitigates this with ticket limits but does not
> aim for complete defense.

**Future Options (v2+)**:
- Dynamic ticket limit adjustment
- KYC/regional restrictions
- Rollover cap for EV control

### 6.3 Regulatory Positioning
- "Entertainment" positioning (not investment product)
- Tickets non-transferable (v1)
- Regional restrictions under consideration

---

## 7. Admin Operations

### 7.1 Round Lifecycle

```bash
# 1. Create new round
nasun client call \
  --package $LOTTERY_PACKAGE \
  --module lottery \
  --function create_round \
  --args $ADMIN_CAP $REGISTRY $CLOSE_TIME $DRAW_TIME $ROLLOVER 0x6

# 2. Close round (after close_time)
nasun client call \
  --package $LOTTERY_PACKAGE \
  --module lottery \
  --function close_round \
  --args $ADMIN_CAP $ROUND_ID 0x6

# 3. Draw numbers (after close_time)
nasun client call \
  --package $LOTTERY_PACKAGE \
  --module lottery \
  --function draw_numbers \
  --args $ADMIN_CAP $ROUND_ID 0x8 0x6

# 4. Settle round (after draw)
nasun client call \
  --package $LOTTERY_PACKAGE \
  --module lottery \
  --function settle_round \
  --args $ADMIN_CAP $ROUND_ID $REGISTRY $JACKPOT_WINNERS_COUNT
```

### 7.2 Treasury Management

```bash
# Withdraw treasury
nasun client call \
  --package $LOTTERY_PACKAGE \
  --module lottery \
  --function withdraw_treasury \
  --args $ADMIN_CAP $REGISTRY $AMOUNT
```

---

## 8. Future Roadmap

> Multi-tier prizes (5-match, 4-match, 3-match) are already implemented in v2.

1. **NFT Tickets**: Tradeable NFT tickets on secondary market
2. **Pado XP Integration**: Lottery participation earns XP
3. **Automated Keeper**: Auto-execute draw/settlement
4. **Unified Margin Integration**: Purchase directly from margin account

---

## 9. Constants Reference

```typescript
// Game constants (must match Move contract)
export const NUMBERS_COUNT = 5;
export const MAX_NUMBER = 32;
export const TICKET_PRICE = 1_000_000n; // 1 NUSDC (6 decimals)
export const MAX_TICKETS_PER_ADDRESS = 100;

// Prize distribution (basis points)
export const PRIZE_POOL_BPS = 7000; // 70%
export const ROLLOVER_BPS = 2000;   // 20%
export const TREASURY_BPS = 1000;   // 10%

// Round status
export const ROUND_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  DRAWN: 2,
  SETTLED: 3,
} as const;
```

---

## 10. Testing Checklist

### E2E Scenarios
- [ ] Ticket purchase: Connect wallet → Select numbers → Purchase → Verify ticket
- [ ] Quick Pick: Auto-generate → Purchase → Verify ticket
- [ ] Winner check: After draw → Check ticket for winning status
- [ ] Prize claim: Claim Prize → Verify NUSDC balance increase

### Edge Cases
- [ ] Invalid number range (0, 33+)
- [ ] Duplicate number selection
- [ ] Less than 5 numbers selected
- [ ] Purchase after sales closed
- [ ] Claim non-winning ticket
- [ ] Re-claim already claimed ticket
- [ ] Exceed 100 tickets per address

---

## 11. Implementation Notes

### 11.1 UI State Update After Transaction

트랜잭션 후 UI가 즉시 업데이트되지 않는 문제 해결:

**문제**: 티켓 구매 후 `Tickets Sold` 카운트가 즉시 업데이트되지 않음

**원인**:
1. RPC 노드가 트랜잭션 직후 캐시된 데이터를 반환
2. React Query의 `invalidateQueries`가 inactive 쿼리를 즉시 refetch하지 않음

**해결책** (`useLotteryActions.ts`):
```typescript
// 1. 트랜잭션 실행
await signAndExecute(tx);

// 2. RPC 노드 상태 업데이트 대기 (1초)
await new Promise((resolve) => setTimeout(resolve, 1000));

// 3. Active 쿼리 강제 refetch
await Promise.all([
  queryClient.refetchQueries({ queryKey: ['lottery-rounds'], type: 'active' }),
  queryClient.refetchQueries({ queryKey: ['lottery-round', roundId], type: 'active' }),
]);

// 4. Inactive 쿼리 invalidate (다음 마운트 시 refetch)
queryClient.invalidateQueries({ queryKey: ['lottery-rounds'] });
queryClient.invalidateQueries({ queryKey: ['lottery-round'] });
```

**추가 조치**:
- `TicketPurchaseForm`에 `onPurchaseSuccess` 콜백 전달
- 부모 컴포넌트에서 `refetch` 함수를 콜백으로 전달하여 이중 안전장치

### 11.2 Query Key Conventions

| Query Key | Hook | Description |
|-----------|------|-------------|
| `['lottery-rounds']` | useLotteries | 전체 라운드 목록 |
| `['lottery-round', roundId]` | useLotteryRound | 특정 라운드 상세 |
| `['lottery-registry']` | useLotteries | Registry 정보 |
| `['my-lottery-tickets']` | useMyTickets | 사용자 티켓 목록 |
