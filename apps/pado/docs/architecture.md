# Pado Architecture

> Last Updated: 2026-03-26

## Project Structure

```
apps/pado/
├── CLAUDE.md                        # Main reference
├── .env.development                 # Dev environment vars (V7)
├── .env.staging                     # Staging environment vars
├── .env.local                       # Local overrides (gitignored)
├── contracts/                       # pado_tokens: NBTC, NUSDC, Faucet
├── contracts-prediction/            # pado_prediction: Prediction Market
├── contracts-oracle/                # pado_oracle: DevOracle (price feed)
├── contracts-lending/               # pado_lending: Lending Pool (Phase 12)
├── contracts-lottery/               # pado_lottery: Weekly Lottery
├── contracts-margin/                # unified_margin: Margin + Risk Engine + Liquidation
├── contracts-perp/                  # pado_perp: Perpetuals + Funding + Liquidation
├── contracts-nsa/                   # nasun_smart_account: Multi-signer + Recovery
├── deepbookv3/                      # DeepBook V3 CLOB (Rust indexer + Move contracts)
├── bots/                            # Automation bots (LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper)
├── chat-server/                     # WebSocket + HTTP server (Chat, Leaderboard, Competitions, Market Narrator)
├── scripts/                         # Utility scripts (create-perp-market)
├── docs/                            # Internal documentation
└── frontend/                        # React App
    └── src/
        ├── main.tsx                 # Entry: Provider hierarchy setup
        ├── App.tsx                  # Layout: Header + Routes
        ├── features/                # Feature modules (see frontend.md)
        ├── components/              # Shared UI (Button, Input, Spinner, Toast, Skeleton, Header)
        ├── pages/                   # Page components (16 pages)
        ├── routes/                  # AppRoutes.tsx - Lazy loading + Suspense
        ├── providers/               # ThemeProvider (dark/light mode)
        ├── hooks/                   # Shared hooks (useAdaptiveInterval, useSubmitGuard, useTransactionSync)
        ├── lib/                     # Core libraries (see frontend.md)
        ├── config/                  # network.ts (network/token/pool config)
        ├── utils/                   # envValidation.ts (env var validation)
        └── assets/                  # Static resources
```

---

## Architecture Patterns

### State Management

- **React Context**: Global state (Theme, Market, OrderForm, PerpMarket, Toast, ChatPanel)
- **Zustand**: Wallet state (`@nasun/wallet`)
- **TanStack Query**: Server state caching (stale time 5s, window focus refetch disabled)
- **localStorage**: Favorites, notification settings, price alerts, TP/SL, chart tools, tour state

### Data Fetching

- **EventService**: WebSocket -> Polling -> Simulation automatic fallback
- **`devInspectTransactionBlock`**: Read-only on-chain queries
- **Dynamic field object**: On-chain state queries
- **Adaptive polling interval**: Tab-focus-based dynamic intervals

### Smart Contract Design Patterns

- **Owned Objects**: Per-user state (MarginAccount, AccountPositions, SmartAccount, PerpPosition, Ticket, DepositPosition)
- **Shared Objects**: Protocol state (MarginRegistry, OracleRegistry, Markets, LotteryRound, LendingPool)
- **Capability Pattern**: AdminCap-based access control
- **Permissionless**: Liquidation/round-end/funding-settlement callable by anyone

### UI Patterns

- Simple/Pro mode (TradePage): Mobile-friendly 2-column vs pro 3-column
- Toast notifications + Error Boundary
- One-click trading (skip confirmation modal)
- Lazy loading (route-based code splitting + Suspense)
- PWA support (Workbox runtime caching, offline operation)
- Tailwind CSS custom theme variables (CSS custom properties for dark/light switching)
- Custom animations (flash-buy, flash-sell, pulse-up, pulse-down, fullscreen-in)
- Browser notifications + sound effects (on fill)
- Clear Signing: Contract-aware transaction preview
- Fullscreen chart overlay (mobile expand/close)
- Sticky Buy/Sell bottom bar with gradient styling (mobile)
- Chart context menu: right-click (desktop) / long-press (mobile) for chart-to-order
