# Pado Pitchdeck — Slide Text (v2)

> Last Updated: 2026-02-20
> Target Audience: Crypto VCs (Pre-Seed)
> Language: English
> Format: Slide text (concise) + Speaker Notes (expandable)

---

## SLIDE 1 — Title

**PADO**

Trade Together.

The non-custodial financial platform where community lives inside.

---

## SLIDE 2 — The Market

**$110B in Korean Crypto Capital Has No On-Chain Home**

- 16M+ crypto users — 30% of Korea's population
- Crypto holders now outnumber stock traders
- $110B migrated offshore (2025) — domestic exchanges are spot-only
- Corporate crypto trading ban lifted February 2026
- DeFi market: 46%+ CAGR through 2032

> Speaker Notes: Korean traders are sophisticated derivatives participants. They simply have no compliant, culturally native, on-chain venue. The offshore migration happened because domestic exchanges like Upbit are restricted to spot trading — derivatives, prediction markets, and unified margin don't exist on-chain for Korean users.

---

## SLIDE 3 — The Problem

**Two Bad Choices**

**CEX (Upbit, Binance)**
- Custody risk — FTX: $8B vanished
- Opaque risk management
- Spot-only in Korea

**Fragmented DeFi (Uniswap, Hyperliquid)**
- Multiple wallets, bridge hops
- No unified margin
- Trade alone — alpha dies in Discord before execution

**The problem: fragmentation of capital AND context.**

> Speaker Notes: When you trade on a DEX, the social context lives outside the product. Three apps open next to the DEX, none talking to each other. CEX solved community (Binance has chat rooms, Bybit has copy trading) but it's surveillance social — your data is the house's data.

---

## SLIDE 4 — The Thesis

**Finance-First Social**

SocialFi failed — forced finance into every social interaction.

Pado inverts the model:
- **Finance is the reason to come** — real markets, real risk
- **Community is the reason to stay** — chat, leaderboards, competitions

No feed. No followers. No likes.
Just markets and the people in them.

> Speaker Notes: Friend.tech attracted speculators who left when returns declined. Every unified DEX solves capital fragmentation. None solves community fragmentation. Pado is the first platform where community forms inside the trading interface.

---

## SLIDE 5 — The Product

**7 Products. 1 Account. Live on Devnet.**

- **Spot Trading** — Full CLOB orderbook, 4 pairs (Live)
- **Perpetual Futures** — 20x leverage, funding rate (Live)
- **Prediction Markets** — Binary YES/NO, on-chain resolution (Live)
- **Lottery** — Sui Random VRF provable fairness (Live)
- **Lending** — Interest rate model (Contracts Deployed)
- **Payments** — QR-code instant transfers (Live)
- **Staking** — NAS token (Planned)

One unified margin. Every asset works harder.

---

## SLIDE 6 — Social Layer

**Alpha Lives On-Chain**

- **Live Chat** — Embedded in trading UI. Your trade identity = chat identity.
- **Leaderboard** — On-chain data. Verifiable rankings.
- **Competitions** — Time-limited tournaments. Transparent results.
- **PnL Share** — One-click social cards
- **Market Narrator** — AI bot: price alerts, volume spikes, momentum
- **Points & Badges** — Achievement system

**Coming:** Copy Trading · War Rooms · ZK-verified PnL · Encrypted DMs

---

## SLIDE 7 — Built, Not Promised

**Live on Nasun Devnet today.**

| | |
|--|--|
| Smart Contracts | 9 packages deployed |
| Financial Products | 7 operational |
| Custom L1 | Sui fork, own validators |
| Trading Pairs | 4 active markets |
| Tests | 1,175+ passing |
| External Funding | **$0** |

Not a whitepaper. Not a roadmap. A working prototype.

> Speaker Notes: Full CLOB DEX, WebSocket chat with crypto auth, testnet leaderboard, unified margin engine, zkLogin (30-sec onboarding), LP Bot providing 24/7 liquidity via Binance price feed, Rust event indexer, PWA support.

---

## SLIDE 8 — Architecture

**Nasun: Purpose-Built L1**

- **Object-Based State** — Every asset is an independent on-chain object
- **Parallel Execution** — No contention between independent transactions
- **DAG Consensus** — Sub-second finality, reduced MEV
- **Programmable Transactions** — Atomic multi-step operations
- **Protocol Control** — We own the validators. Conditional orders become native ops.

**Onboarding:**
zkLogin (Google OAuth, no seed phrase) · Passkey (Face ID) · Social Recovery

> Speaker Notes: We chose to fork Sui rather than deploy on it for two reasons: economic alignment (fee capture stays in our ecosystem) and protocol-level optimization (conditional orders, hardware attestation can become validator-native operations, not feature requests to an external foundation).

---

## SLIDE 9 — Unified Margin

**One Account. One Margin Pool.**

| | Traditional DeFi | Pado |
|--|-----------------|------|
| Collateral | Locked per protocol | Shared across all products |
| Risk | Per-position | Portfolio-level |
| Efficiency | Low | High (cross-product) |

- Multi-collateral: NUSDC (100%) + NBTC (95%)
- 4-tier risk engine: IM 10% → Warning 8% → MM 5% → FC 3%
- Permissionless liquidation. 5% keeper bonus.

> Speaker Notes: Earn yield on idle collateral while trading perpetuals. Hedge spot positions atomically with futures. This is the capital infrastructure that keeps users from needing to leave.

---

## SLIDE 10 — Why Korea

**The Beachhead**

- **Users** — 16M accounts. Highest per-capita adoption globally.
- **Demand** — $110B offshore. Spot-only domestically.
- **Regulation** — Framework forming now. Early movers win.
- **Culture** — K-Content communities already exhibit Web3 participation behaviors.

**Entry Strategy:**
Korean KOL partnerships · Cultural event campaigns · Korea-focused prediction markets · Progressive DeFi education

> Speaker Notes: Long-term vision is non-custodial architecture compatible with emerging Korean regulatory frameworks — exchange-grade compliance without surrendering asset control.

---

## SLIDE 11 — Competitive Position

| | CEX | Fragmented DeFi | **Pado** |
|--|-----|----------------|----------|
| Custody | Centralized | Self-custody | **Self-custody** |
| Products | Broad | Single-purpose | **7 in 1 account** |
| Margin | Siloed | None | **Unified** |
| Social | External | None | **Native** |
| Onboarding | Email/KYC | Seed phrase | **zkLogin (30s)** |

---

## SLIDE 12 — Nasun Ecosystem

**Three Verticals. One Flywheel.**

**Pado** — DeFi engine (primary 2026 focus)
**Gen Sol** — Cinematic sci-fi IP. UE5 shooter playable now. Animation in production. 10 Korean government grants (KOCCA, NIPA, Ministry of Culture) — only Web3 project selected in every competition.
**Baram** — AI governance. On-chain audit trails for autonomous agents. EU/Korea AI Act compliance.

Pado users → Gen Sol economy → Baram enterprise demand → NSN utility compounds across all three.

One wallet. One token. Reputation is non-portable.

---

## SLIDE 13 — Revenue

**Multi-Stream, Fee-Based**

- **Trading Fees** — Maker 5bps / Taker 10bps (Live)
- **Lending Spread** — Protocol interest margin (Deployed)
- **Lottery Treasury** — 10% of ticket sales (Live)
- **Prediction Fees** — Settlement fees (Live)
- **Premium** — Copy trading, AI agents, strategy marketplace (Planned)

**At scale:** 0.5% capture of $110B offshore flow at 5bps → ~$27.5M annual revenue

---

## SLIDE 14 — Roadmap

**Phase 1 — Community (2026)**
Public testnet · Chat + Leaderboard · KOL partnerships · NFT launch
Target: 500 WAW / 60 days, 50K trades / 90 days

**Phase 2 — Depth (2026–27)**
Perp + Lending UI · Copy trading · Korea prediction markets · 3 MM partnerships

**Phase 3 — Scale (2027+)**
AI agents · Cross-chain vaults · Asia expansion · Mainnet · Security audits

---

## SLIDE 15 — Team

**Naru — Protocol Lead**
Built Nasun L1, Pado, Baram. 10yr Korean film industry (Cannes/Berlin/Venice). Clinical psychology researcher. Crypto since 2017.

**Overclocked — Ecosystem Lead**
Built SPECTRA (UE5/C++/AWS). Gen Sol IP author. 20yr media production (Microsoft, Nike, IBM). Crypto since 2017.

**Two founders. $0 funding. Shipped:** L1 blockchain + full DeFi suite + multiplayer shooter + AI compliance layer. Gen Sol IP validated by 10 Korean government grants (Grand Prize at KOCCA).

---

## SLIDE 16 — The Ask

**Pre-Seed: $1M**

| Category | Amount |
|----------|--------|
| Security Audits | $150K |
| Engineers (2 Network/DeFi) | $250K |
| Engineer (1 C++ Game) | $130K |
| Validators | $50K |
| Legal & Regulatory | $100K |
| Marketing & Community | $150K |
| Testnet Portal & Media | $100K |
| Buffer | $20K |

Pre-Seed → Seed (milestones proven) → Series A (live mainnet)
No team tokens at TGE. Milestone-based unlocks only.

---

## SLIDE 17 — Closing

**Trade Together.**

Self-custody. Unified margin. Native social layer.
7 products live. 2 builders. $0 funding.
$110B opportunity — no one is building for it on-chain.

We are not asking you to fund an idea.
We are asking you to scale something already running.
