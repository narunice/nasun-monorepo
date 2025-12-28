# Nasun Explorer Roadmap

> Version: v0.8.0
> Date: 2025-12-28
> Current Version: v0.7.0-network-charts

---

## Current Features (v0.7.x)

| Page | Features | Status |
|------|----------|--------|
| Home | Network status, TPS Trend Chart, Epoch Progress, Search, Recent TX | ✅ UPDATED |
| Transactions | TX list with pagination | ✅ |
| Transaction | TX details (gas, events, object changes, raw data) | ✅ |
| Object | Object details + NFT media display + Package link | ✅ |
| Address | Balance, NFTs grid, Objects table, TX history | ✅ |
| Validators | Validator list, APY, Commission, Staking summary | ✅ |
| Validator | Validator details, staking info | ✅ |
| Checkpoints | Checkpoint list with pagination | ✅ |
| Checkpoint | Checkpoint details, TX list, gas summary | ✅ |
| Package | Module list, functions, structs | ✅ NEW |
| Wallet | Create/Unlock, Send NASUN, Faucet | ✅ |

---

## Enhancement Roadmap

### ✅ Completed (v0.5.0 - v0.6.0)

#### 1. Validators/Staking Page ✅

**Route**: `/validators`, `/validator/:address`
**Completed**: 2025-12-27

**Implemented Features**:
- Validator list table (Name, Address, APY, Commission, Stake, Voting Power)
- Network staking summary (Epoch, Total Stake, Validator Count, Avg APY)
- Individual validator details with staking info

---

#### 2. Checkpoints Page ✅

**Route**: `/checkpoints`, `/checkpoint/:sequence`
**Completed**: 2025-12-27

**Implemented Features**:
- Recent checkpoints list with pagination
- Checkpoint details (TX list, gas summary)

---

#### 3. Package/Module Explorer ✅

**Route**: `/package/:id`
**Completed**: 2025-12-28

**Implemented Features**:
- Package overview (ID, module count, function count, struct count)
- Module list with expandable details
- Function signatures with visibility and entry markers
- Struct definitions with abilities and fields
- Object.tsx에서 Type → Package 링크 연결
- Header에 Packages 메뉴 추가

---

#### 4. Network Charts (Recharts) ✅

**Location**: Home page
**Completed**: 2025-12-28

**Implemented Features**:
- TPS Trend Chart (AreaChart with 30-point history)
- Epoch Progress visualization with progress bar
- Epoch start/end time display
- Real-time updates (10s interval)

---

### P1 - Next (v0.8.0)

#### 6. Token List

**Route**: `/tokens`

**Features**:
- Token list with holders count
- Total supply
- Token details page

---

### P3 - Future (v0.9.0+)

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
Phase 1 (v0.5.0) ✅ COMPLETED
├── [x] Validators page
│   ├── [x] sui-client.ts: getValidators(), getValidatorByAddress()
│   ├── [x] pages/Validators.tsx
│   ├── [x] pages/Validator.tsx
│   └── [x] App.tsx: routes
├── [x] Checkpoints page
│   ├── [x] sui-client.ts: getCheckpoints(), getCheckpoint()
│   ├── [x] pages/Checkpoints.tsx
│   ├── [x] pages/Checkpoint.tsx
│   └── [x] App.tsx: routes
└── [x] Header navigation update

Phase 2 (v0.6.0) ✅ COMPLETED
├── [x] Package Explorer
│   ├── [x] sui-client.ts: getPackageModules(), getModuleDetail()
│   ├── [x] pages/Package.tsx
│   ├── [x] Object.tsx: Package link
│   └── [x] Header: Packages menu

Phase 3 (v0.7.0) ✅ COMPLETED
├── [x] Network Charts (Recharts)
│   ├── [x] pnpm add recharts
│   ├── [x] Home.tsx: TPS Trend AreaChart
│   ├── [x] Home.tsx: Epoch Progress bar
│   └── [x] sui-client.ts: getEpochInfo() progress/timestamps

Phase 4 (v0.8.0) - NEXT
├── [ ] Token List page
└── [ ] Gas price history chart
```

---

## File Structure (v0.7.0)

```
src/
├── pages/
│   ├── Home.tsx               # TPS Chart, Epoch Progress added
│   ├── Transactions.tsx
│   ├── Transaction.tsx
│   ├── Object.tsx           # Package link added
│   ├── Address.tsx
│   ├── Validators.tsx
│   ├── Validator.tsx
│   ├── Checkpoints.tsx
│   ├── Checkpoint.tsx
│   └── Package.tsx          # NEW (v0.6.0)
├── lib/
│   ├── sui-client.ts        # getPackageModules(), getModuleDetail()
│   ├── format.ts
│   ├── media.ts
│   └── nft.ts
└── components/
    ├── Header.tsx           # Packages menu added
    ├── CopyableId.tsx
    ├── NFTDetailView.tsx
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

| Version | Date | Features |
|---------|------|----------|
| v0.7.0 | 2025-12-28 | Network Charts (TPS Trend, Epoch Progress), Recharts |
| v0.6.0 | 2025-12-28 | Package Explorer, Object→Package link, Header menu |
| v0.5.0 | 2025-12-27 | Validators, Checkpoints pages |
| v0.4.2 | 2025-12-15 | NFT display (Object/Address pages) |
| v0.4.1 | - | UI branding, English locale |
| v0.4.0 | - | Transactions page, Address TX history, Auto-refresh |
| v0.3.0 | - | Wallet module (create, send, faucet) |
| v0.2.0 | - | Basic explorer (Home, TX, Object, Address) |
