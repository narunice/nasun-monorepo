# Pado Prediction Market Contracts

Binary prediction markets on Nasun Network with NUSDC collateral.

## Deployed Addresses (Nasun Devnet)

| Object | ID |
|--------|-----|
| Package | `0xc585b0b99bc4552de542a465c4b42575fa9ee2f1d56895260efc4a7c65baea89` |
| AdminCap | `0x906d0edc8137d419b14248f69bc9bd4c29023666cb62756476109a0ad8f315f9` |
| GlobalState | `0xdae9480159fb2a616e085c85ae9e908358fd635dc49e5a2b98ea8211d476863c` |

## Test Markets

| Market ID | Question |
|-----------|----------|
| `0x739cf64abf2ef089027fbf20bd6b5b8ad1ccfa1236a6d8f2aa7e73c4fb1439e8` | Will BTC reach $150,000 by March 2026? |

## Core Functions

### Admin Functions

```move
// Create a new market (requires AdminCap)
public entry fun create_market(
    admin: &AdminCap,
    question: String,
    description: String,
    category: String,
    close_time: u64,      // Unix timestamp (ms)
    resolve_deadline: u64, // Unix timestamp (ms)
    resolver: address,
    clock: &Clock,
    ctx: &mut TxContext
)

// Resolve market outcome (resolver only)
public entry fun resolve_market(
    market: &mut Market,
    outcome: bool,  // true = YES wins
    clock: &Clock,
    ctx: &mut TxContext
)
```

### User Functions

```move
// Mint YES and NO tokens (1 NUSDC = 1 YES + 1 NO)
public entry fun mint_outcome_tokens(
    market: &mut Market,
    payment: Coin<NUSDC>,
    clock: &Clock,
    ctx: &mut TxContext
)

// Place bid order to buy outcome tokens
public entry fun place_bid_order(
    market: &mut Market,
    state: &mut GlobalState,
    is_yes: bool,
    price: u64,  // Basis points (0-10000)
    payment: Coin<NUSDC>,
    clock: &Clock,
    ctx: &mut TxContext
)

// Place ask order to sell outcome tokens
public entry fun place_ask_order(
    market: &mut Market,
    state: &mut GlobalState,
    position: Position,
    price: u64,
    clock: &Clock,
    ctx: &mut TxContext
)

// Claim winnings after resolution
public entry fun claim_winnings(
    market: &mut Market,
    position: Position,
    ctx: &mut TxContext
)
```

## Build & Deploy

```bash
# Build
cd apps/pado/contracts-prediction
sui move build

# Deploy (Nasun Devnet)
sui client switch --env nasun-devnet
sui client publish --gas-budget 500000000

# Create test market
sui client call \
  --package <PACKAGE_ID> \
  --module prediction_market \
  --function create_market \
  --args <ADMIN_CAP> "Question?" "Description" "Category" <close_time_ms> <resolve_deadline_ms> <resolver_address> 0x6 \
  --gas-budget 50000000
```

## Price Mechanics

- Prices are in basis points: 0-10000 (0% - 100%)
- YES price + NO price = 100% (when market is balanced)
- Example: YES at 6500 = 65% probability

## Token Model (CTF-like)

1. **Minting**: 1 NUSDC → 1 YES + 1 NO (always paired)
2. **Trading**: Buy/sell YES or NO at market prices
3. **Resolution**: Admin confirms outcome
4. **Redemption**: Winning token = 1 NUSDC
