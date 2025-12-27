# Nasun Explorer Roadmap

> Version: v0.5.0+
> Date: 2025-12-15
> Current Version: v0.4.2-nft-display

---

## Current Features (v0.4.x)

| Page | Features |
|------|----------|
| Home | Network status (5s auto-refresh), Recent TX (10s auto-refresh), Search |
| Transactions | TX list with pagination |
| Transaction | TX details (gas, events, object changes, raw data) |
| Object | Object details + NFT media display |
| Address | Balance, NFTs grid, Objects table, TX history |
| Wallet | Create/Unlock, Send NASUN, Faucet |

---

## Enhancement Roadmap

### P0 - Critical (v0.5.0)

#### 1. Validators/Staking Page

**Route**: `/validators`, `/validator/:address`

**Features**:
- Validator list table
  - Name, Address, APY, Commission
  - Total stake, Delegators count
  - Status (Active/Inactive)
- Network staking summary
  - Total staked amount
  - Average APY
  - Validator count
- Individual validator details
  - Delegation history
  - Rewards info

**Reference**: [SuiVision Validators](https://suivision.xyz/validators), [Suiscan Validators](https://suiscan.xyz/mainnet/validators)

**Sui SDK Methods**:
```typescript
suiClient.getLatestSuiSystemState()
suiClient.getValidatorsApy()
```

---

#### 2. Checkpoints Page

**Route**: `/checkpoints`, `/checkpoint/:sequence`

**Features**:
- Recent checkpoints list
  - Sequence number, Timestamp
  - TX count, Gas usage
  - Digest
- Checkpoint details
  - Included transactions
  - Epoch info

**Sui SDK Methods**:
```typescript
suiClient.getCheckpoint({ id: sequenceNumber })
suiClient.getCheckpoints({ descendingOrder: true, limit: 20 })
```

---

### P1 - Important (v0.6.0)

#### 3. Gas Tracker

**Location**: Home page widget or dedicated page

**Features**:
- Real-time gas price (Reference Gas Price)
- Gas price history chart (optional)

**Reference**: [Etherscan Gas Tracker](https://etherscan.io/gastracker)

---

#### 4. Package/Module Explorer

**Route**: `/package/:id`

**Features**:
- Package info (ID, version, modules)
- Module list
- Function signatures
- Source code display (if available)

**Sui SDK Methods**:
```typescript
suiClient.getNormalizedMoveModulesByPackage({ package: packageId })
```

---

### P2 - Nice to Have (v0.7.0)

#### 5. Token List

**Route**: `/tokens`

**Features**:
- Token list with holders count
- Total supply
- Token details page

---

#### 6. Statistics/Charts

**Route**: `/stats`

**Features**:
- Daily TX count chart
- Active addresses chart
- TPS metrics
- Network growth visualization

---

### P3 - Future (v0.8.0+)

#### 7. Coins Page

- Coin type list
- Supply distribution
- Holder analytics

#### 8. Events Search

- Event type filtering
- Advanced search by event fields

---

## Implementation Order

```
Phase 1 (v0.5.0)
├── [ ] Validators page
│   ├── [ ] sui-client.ts: getValidators(), getValidatorDetails()
│   ├── [ ] pages/Validators.tsx
│   ├── [ ] pages/Validator.tsx
│   └── [ ] App.tsx: routes
├── [ ] Checkpoints page
│   ├── [ ] sui-client.ts: getCheckpoints(), getCheckpoint()
│   ├── [ ] pages/Checkpoints.tsx
│   ├── [ ] pages/Checkpoint.tsx
│   └── [ ] App.tsx: routes
└── [ ] Header navigation update

Phase 2 (v0.6.0)
├── [ ] Gas Tracker widget
└── [ ] Package Explorer

Phase 3 (v0.7.0)
├── [ ] Token List
└── [ ] Statistics page
```

---

## File Structure (After v0.5.0)

```
src/
├── pages/
│   ├── Home.tsx
│   ├── Transactions.tsx
│   ├── Transaction.tsx
│   ├── Object.tsx
│   ├── Address.tsx
│   ├── Validators.tsx      # NEW
│   ├── Validator.tsx       # NEW
│   ├── Checkpoints.tsx     # NEW
│   └── Checkpoint.tsx      # NEW
├── lib/
│   ├── sui-client.ts       # Add validator/checkpoint methods
│   ├── format.ts
│   └── media.ts
└── components/
    ├── Header.tsx          # Update navigation
    └── ...
```

---

## References

### Sui Explorers
- [SuiVision](https://suivision.xyz/) - Analytics/Portfolio focused
- [Suiscan](https://suiscan.xyz/) - Developer/Contract focused

### General Explorers
- [Etherscan](https://etherscan.io) - Industry standard
- [Blockscout](https://www.blockscout.com/) - Open source multichain

### Documentation
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [Sui JSON-RPC API](https://docs.sui.io/references/sui-api)

---

## Version History

| Version | Features |
|---------|----------|
| v0.4.2 | NFT display (Object/Address pages) |
| v0.4.1 | UI branding, English locale |
| v0.4.0 | Transactions page, Address TX history, Auto-refresh |
| v0.3.0 | Wallet module (create, send, faucet) |
| v0.2.0 | Basic explorer (Home, TX, Object, Address) |
