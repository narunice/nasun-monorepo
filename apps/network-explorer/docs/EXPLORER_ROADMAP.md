# Nasun Explorer Roadmap

> Version: v0.9.0
> Date: 2026-02-21
> Current Version: v0.8.0-token-list-gas-chart

---

## Current Features (v0.7.x)

| Page | Features | Status |
|------|----------|--------|
| Home | Search bar (top), Network status, TPS Chart, Epoch Progress, Recent TX | ✅ v0.7.1 |
| Transactions | TX list with pagination | ✅ |
| Transaction | TX details (gas, events, object changes, raw data) | ✅ |
| Object | Object details + NFT media display + Package link | ✅ |
| Address | Balance, NFTs grid, Objects table, TX history | ✅ |
| Validators | Validator list, APY, Commission, Staking summary | ✅ |
| Validator | Validator details, staking info | ✅ |
| Checkpoints | Checkpoint list with pagination | ✅ |
| Checkpoint | Checkpoint details, TX list, gas summary | ✅ |
| Package | Module list, functions, structs | ✅ |
| Wallet | Create/Unlock, Send NASUN, Faucet, Responsive address | ✅ v0.7.1 |
| Header | Hamburger menu (mobile), Responsive navigation | ✅ v0.7.1 |

---

## Enhancement Roadmap

### ✅ Completed (v0.7.1)

#### 5. Mobile UX Improvements ✅

**Date**: 2026-01-10

**Implemented Features**:
- **Responsive Address Display**: Mobile shows `...8677` (last 4 chars), Desktop shows `0x7d5d84...268677`
- **Hamburger Menu**: Mobile navigation with slide-down menu
- **Search Bar Repositioned**: Moved to top of Home page for better discovery
- **Header Cleanup**: Hide BalanceDisplay/FaucetButton on mobile
- **Logo Adaptation**: "Explorer" on mobile, "Nasun Explorer" on desktop

**Files Changed**:
- `packages/wallet/src/sui/client.ts`: `shortenAddressResponsive()` function
- `packages/wallet-ui/src/WalletConnect.tsx`: Responsive address in button
- `apps/network-explorer/src/components/Header.tsx`: Hamburger menu
- `apps/network-explorer/src/pages/Home.tsx`: Search bar position

---

### ✅ Completed (v0.5.0 - v0.7.0)

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

### ✅ Completed (v0.8.0)

#### 6. Token List Enhancement ✅

**Route**: `/tokens`
**Completed**: 2026-02-21

**Implemented Features**:
- Token list with holder count + circulating supply (via Explorer API `/stats/tokens`)
- `@nasun/devnet-config` integration (hardcoded coin types removed)
- NSN total supply via RPC (independent from API), faucet tokens via DB aggregation
- Holders column, Supply column with "Total"/"Distributed" labels
- Decimals column removed (not useful for end users)
- Mobile responsive: Holders `hidden sm:table-cell`, Type `hidden md:table-cell`
- Graceful degradation: metadata always renders, stats show `-` on API failure

#### 7. Gas Price History Chart ✅

**Location**: Analytics page
**Completed**: 2026-02-21

**Implemented Features**:
- Daily gas cost (SOE) bar chart + average gas per TX area chart
- Explorer API `/stats/daily-gas` endpoint (checkpoints table aggregation)
- 7d/14d/30d range selection (shared with existing IndexerCharts)
- Amber color scheme (#f59e0b) differentiated from existing charts
- ChartTooltip with SOE formatting

#### 8. Explorer API E2E Tests ✅

**Completed**: 2026-02-21

**Implemented Features**:
- 121 E2E tests across 9 test files covering all API endpoints
- Request throttling (100ms) + retry with backoff for 502/503
- `fileParallelism: false` for small EC2 instances
- Discovered and fixed: SQL FLOOR() for BigInt safety, DATE `::text` consistency, DB pool sizing

---

### P3 - Future (v0.9.0+)

#### 9. Coins Page

- Coin type list
- Supply distribution
- Holder analytics

#### 10. Events Search

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

Phase 3.5 (v0.7.1) ✅ COMPLETED
├── [x] Mobile UX Improvements
│   ├── [x] packages/wallet: shortenAddressResponsive()
│   ├── [x] packages/wallet-ui: WalletConnect responsive address
│   ├── [x] Header.tsx: Hamburger menu + mobile navigation
│   ├── [x] Header.tsx: Hide BalanceDisplay/FaucetButton on mobile
│   └── [x] Home.tsx: Search bar moved to top

Phase 4 (v0.8.0) ✅ COMPLETED
├── [x] Token List Enhancement
│   ├── [x] api-server: GET /stats/tokens (holders + circulating supply)
│   ├── [x] pages/Tokens.tsx: @nasun/devnet-config integration, holders column
│   └── [x] lib/explorer-api.ts: getTokenStats()
├── [x] Gas Price History Chart
│   ├── [x] api-server: GET /stats/daily-gas (checkpoints aggregation)
│   ├── [x] components/analytics/GasCostChart.tsx
│   └── [x] pages/Analytics.tsx: GasCostChart integration
└── [x] E2E Tests (121 tests, 9 files)
    ├── [x] e2e/: health, top-accounts, daily-gas, network-summary, tokens
    ├── [x] e2e/: active-addresses, daily-transactions, edge-cases, data-consistency
    └── [x] Bug fixes: SQL FLOOR(), DATE ::text, DB pool max:25
```

---

## File Structure (v0.7.1)

```
src/
├── pages/
│   ├── Home.tsx             # TPS Chart, Epoch Progress, Search bar
│   ├── Transactions.tsx
│   ├── Transaction.tsx
│   ├── Object.tsx           # Package link added
│   ├── Address.tsx
│   ├── Validators.tsx
│   ├── Validator.tsx
│   ├── Checkpoints.tsx
│   ├── Checkpoint.tsx
│   └── Package.tsx
├── lib/
│   ├── sui-client.ts        # getPackageModules(), getModuleDetail()
│   ├── format.ts
│   ├── media.ts
│   └── nft.ts
└── components/
    ├── Header.tsx           # Hamburger menu, WalletConnect
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
| v0.8.0 | 2026-02-21 | Token List Enhancement, Gas Price History Chart, E2E Tests (121 tests) |
| v0.7.1 | 2026-01-10 | Mobile UX (Hamburger menu, Responsive address, Search bar top) |
| v0.7.0 | 2025-12-28 | Network Charts (TPS Trend, Epoch Progress), Recharts |
| v0.6.0 | 2025-12-28 | Package Explorer, Object→Package link, Header menu |
| v0.5.0 | 2025-12-27 | Validators, Checkpoints pages |
| v0.4.2 | 2025-12-15 | NFT display (Object/Address pages) |
| v0.4.1 | - | UI branding, English locale |
| v0.4.0 | - | Transactions page, Address TX history, Auto-refresh |
| v0.3.0 | - | Wallet module (create, send, faucet) |
| v0.2.0 | - | Basic explorer (Home, TX, Object, Address) |
