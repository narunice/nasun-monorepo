# Network Explorer Full Code Review Brief

> **Absolute Rule: DO NOT modify any code.**
> This is a code review task ONLY. Do not create, edit, or delete any files.
> Output discovered issues and remediation recommendations as TEXT ONLY.
> Any attempt to modify code invalidates the entire review.

## Mission

Nasun Network Explorer (`apps/network-explorer/`) -- a frontend-only React app totaling ~67 source files (~4,960 lines) -- undergoes a full code review. This codebase is a blockchain explorer for the Nasun Devnet (Sui fork), featuring wallet integration, zkLogin authentication, and NFT display. Built via **vibe coding (LLM-generated) + manual refinement** by a bootstrapped team.

**Deliverable**: A prioritized list of findings and remediation recommendations (text only). **Never modify code files.**

---

## 1. Project Overview

### What is Network Explorer?

Network Explorer (`explorer.nasun.io/devnet`) is the **blockchain explorer** for the Nasun Devnet. It provides:

1. **Network Dashboard**: Real-time status (5s auto-refresh), TPS charts, epoch progress, recent transactions
2. **Transaction Explorer**: TX detail with gas, events, object changes, raw data
3. **Object/NFT Viewer**: Object detail, NFT rendering (IPFS support), display metadata
4. **Address Inspector**: Token balances, owned objects, NFT gallery, TX history
5. **Validator Dashboard**: Validator list (APY, commission, stake), validator detail
6. **Checkpoint Browser**: Checkpoint listing and detail
7. **Package Explorer**: Move module browser (functions, structs)
8. **Smart Search**: Auto-detection of TX digest (Base58), Object ID (hex), address
9. **Wallet Integration**: @nasun/wallet + @nasun/wallet-ui (create/unlock/faucet/send)
10. **zkLogin**: Google OAuth authentication via self-hosted prover

### Tech Stack

| Area | Technology |
|------|-----------|
| Frontend | React 19, Vite 7, TypeScript 5.9, TailwindCSS 3.4 |
| Blockchain SDK | @mysten/sui (SuiClient, RPC) |
| Data Fetching | TanStack React Query v5 (caching, auto-refetch) |
| Routing | React Router v7 (route params, no query strings) |
| State | Zustand v5 (wallet), React Query (server state) |
| Charts | Recharts v3 (TPS, epoch) |
| Wallet | @nasun/wallet, @nasun/wallet-ui (shared monorepo packages) |
| Auth | Google zkLogin (self-hosted prover), WalletConnect |
| Deployment | EC2 + nginx (static SPA) |

### Security Context

- **Read-only blockchain data**: No state-changing transactions (except wallet send/faucet, handled by @nasun/wallet)
- **No backend Lambda functions**: Pure frontend app, all data from public RPC
- **User input surface**: Search bar (TX digest, object ID, address), wallet password
- **External content rendering**: NFT images/videos from IPFS and arbitrary URLs -- primary XSS vector
- **Wallet key management**: Handled by @nasun/wallet package (AES-256-GCM + PBKDF2) -- out of scope for this review but critical dependency
- **zkLogin OAuth**: Token exchange and salt management via Lambda endpoints (shared with nasun-website)
- **Bootstrapped startup**: No dedicated security team

### Risk Assessment

| Attack Vector | Severity | Likelihood | Notes |
|---------------|----------|-----------|-------|
| NFT media XSS (malicious image/video URL) | HIGH | MEDIUM | Attacker mints NFT with javascript: or data:text/html URL |
| Search input injection | MEDIUM | LOW | Route params, validated with regex |
| IPFS gateway compromise | MEDIUM | LOW | Single gateway (ipfs.io), no fallback |
| CSP bypass (meta tag vs header) | MEDIUM | LOW | Meta tag CSP can be weaker than header-based |
| RPC response manipulation | LOW | LOW | MITM on HTTPS would be needed |
| Wallet key extraction (XSS prerequisite) | CRITICAL | LOW | Requires prior XSS to access encrypted keys |

---

## 2. Codebase Structure

### 2A. Core Application

```
apps/network-explorer/
├── index.html                       (14 lines) -- CSP meta tag, entry point
├── src/
│   ├── main.tsx                     (77 lines) -- Wallet config, zkLogin init, providers
│   ├── App.tsx                      (39 lines) -- Route definitions (11 routes)
│   └── index.css                    -- Tailwind + self-hosted fonts
├── .env                             (14 lines) -- RPC URL, Chain ID, OAuth config
├── vite.config.ts                   (80 lines) -- Build config, dev proxy, chunking
└── tailwind.config.js               -- Theme colors, dark mode config
```

### 2B. Pages (11 route pages)

```
src/pages/
├── Home.tsx                    -- Dashboard (network status + TPS + recent TX)
├── Transactions.tsx            -- TX listing with cursor pagination
├── Transaction.tsx             -- TX detail (overview, gas, events, objects, raw)
├── Object.tsx                  -- Object/NFT detail with Display<T> support
├── Address.tsx                 -- Address info (balances, NFTs, objects, history)
├── Validators.tsx              -- Validator listing (APY, commission, stake)
├── Validator.tsx               -- Validator detail
├── Checkpoints.tsx             -- Checkpoint listing
├── Checkpoint.tsx              -- Checkpoint detail
├── Package.tsx                 -- Move package/module browser
└── AuthCallback.tsx            -- zkLogin OAuth callback handler
```

### 2C. Component Library

```
src/components/
├── Header.tsx                  -- Navigation + wallet button + search (mobile)
├── InfoRow.tsx                 -- Key-value display with copy, link, status badge
├── CopyableId.tsx              -- ID display with copy button
├── CoinSymbol.tsx              -- Token symbol resolution
├── NFTMedia.tsx                -- NFT image/video renderer (uses resolveMediaUrl)
├── NFTCard.tsx                 -- NFT grid card (thumbnail + name)
├── NFTDetailView.tsx           -- Full NFT detail (metadata, attributes, media)
├── NFTAttributes.tsx           -- NFT attribute table
├── ui/
│   ├── Card.tsx, SectionBox.tsx, JsonBlock.tsx
├── layout/
│   ├── Layout.tsx              -- Main layout wrapper (header + outlet)
│   └── ErrorBoundary.tsx       -- React error boundary (graceful recovery)
├── home/
│   ├── NetworkStatusCards.tsx   -- Status cards (5s auto-refresh)
│   ├── NetworkActivityCharts.tsx -- TPS & epoch charts
│   └── RecentTransactionsTable.tsx
├── transaction/
│   ├── TransactionOverview.tsx, TransactionGas.tsx
│   ├── TransactionObjectChanges.tsx, TransactionEvents.tsx
│   └── TransactionRawData.tsx
├── address/
│   ├── AddressOverview.tsx, AddressTokenBalances.tsx
│   ├── AddressNFTs.tsx, AddressOtherObjects.tsx
│   └── AddressTransactionHistory.tsx
├── charts/
│   ├── SearchBar.tsx            -- **Smart search with regex validation**
│   ├── TPSChart.tsx, EpochProgress.tsx
├── theme/
│   └── ThemeProvider.tsx, ThemeToggle.tsx
└── package/
    └── ModuleItem.tsx           -- Move module function/struct display
```

### 2D. Libraries & Utilities

```
src/lib/
├── sui-client.ts          (338 lines) -- **RPC client, all data fetching functions**
├── media.ts               (173 lines) -- **URL sanitization, IPFS gateway, protocol allowlist**
├── format.ts              (~120 lines) -- Number/date/address formatting
├── object-utils.ts        (~100 lines) -- Object type detection, parsing
├── nft.ts                 (~80 lines)  -- NFT field extraction, Display<T> parsing
├── move-utils.ts          (~60 lines)  -- Move type string parsing
├── coin-metadata.ts       (~50 lines)  -- Coin metadata cache
└── types.ts               (~30 lines)  -- Shared type definitions
```

### 2E. Custom Hooks

```
src/hooks/
├── useNetworkData.ts       -- Network status (5s interval polling)
├── useAddressObjects.ts    -- Address object pagination (cursor-based)
├── useCursorPagination.ts  -- Generic cursor pagination
├── useTPSHistory.ts        -- TPS time-series tracking
├── useMinDuration.ts       -- Minimum loader display duration
└── useCopyToClipboard.ts   -- Clipboard API wrapper
```

---

## 3. Review Areas & Checklist

### Area 1: External Content Rendering (NFT/Media XSS)

**Why Critical**: Blockchain explorers render NFT metadata from on-chain data. Attackers can mint NFTs with malicious URLs (javascript:, data:text/html, SVG with embedded scripts) to achieve XSS on any explorer that renders them.

| # | Check Item | Files |
|---|-----------|-------|
| 1.1 | `resolveMediaUrl()` protocol allowlist completeness (http, https, data, ipfs only) | `lib/media.ts:22-48` |
| 1.2 | SVG exclusion from data: URI whitelist (SVG can contain `<script>`) | `lib/media.ts:7-15` |
| 1.3 | `sanitizeHref()` for external links (blocks javascript:, vbscript:, etc.) | `lib/media.ts:55-66` |
| 1.4 | NFTMedia component: resolveMediaUrl called before rendering | `components/NFTMedia.tsx` |
| 1.5 | No `dangerouslySetInnerHTML` anywhere in codebase | All `.tsx` files |
| 1.6 | JsonBlock uses text content (`{jsonString}`) not innerHTML | `components/ui/JsonBlock.tsx` |
| 1.7 | InfoRow renders values as text content, links via React Router | `components/InfoRow.tsx` |
| 1.8 | NFTDetailView: external link URLs pass through sanitizeHref | `components/NFTDetailView.tsx` |
| 1.9 | IPFS gateway URL construction (path traversal in hash?) | `lib/media.ts:37-38` |
| 1.10 | Object.tsx: raw object content display safety | `pages/Object.tsx` |

### Area 2: User Input Validation (Search & Route Params)

**Why Important**: User input flows through search bar → route params → RPC calls. Malformed input could cause unexpected behavior or be used for phishing via crafted URLs.

| # | Check Item | Files |
|---|-----------|-------|
| 2.1 | SearchBar regex validation: Base58 (`TX_DIGEST_RE`), hex (`HEX_ID_RE`) | `components/charts/SearchBar.tsx:5-8` |
| 2.2 | Route params extracted via `useParams` (no query string parsing) | All page files |
| 2.3 | `encodeURIComponent` on fallback search path (unrecognized 0x format) | `SearchBar.tsx:47` |
| 2.4 | RPC call params: user-supplied strings passed to SDK (no URL construction) | `lib/sui-client.ts` |
| 2.5 | Cursor pagination: opaque string from RPC, passed back as-is | `hooks/useCursorPagination.ts`, `sui-client.ts` |
| 2.6 | Error handling: try/catch on all RPC calls, graceful null returns | `lib/sui-client.ts` (all functions) |
| 2.7 | TanStack Query `enabled` guards prevent RPC calls with undefined params | All page files |

### Area 3: Content Security Policy (CSP)

**Why Important**: CSP is the last defense against XSS. The explorer loads external images/videos, making CSP configuration critical.

| # | Check Item | Files |
|---|-----------|-------|
| 3.1 | CSP is in `<meta>` tag (not HTTP header) -- weaker enforcement | `index.html:8` |
| 3.2 | `script-src 'self'` -- no inline scripts allowed | `index.html:8` |
| 3.3 | `style-src 'unsafe-inline'` -- required for Tailwind (acceptable) | `index.html:8` |
| 3.4 | `img-src` whitelist: self, ipfs.io, googleusercontent, data: | `index.html:8` |
| 3.5 | `frame-src 'none'`, `object-src 'none'` -- blocks iframes and plugins | `index.html:8` |
| 3.6 | `connect-src` whitelist: RPC, faucet, Lambda APIs, Google, WalletConnect | `index.html:8` |
| 3.7 | No `'unsafe-eval'` in any directive | `index.html:8` |

### Area 4: Authentication & Wallet Security

**Why Important**: Wallet operations (create, unlock, send TX) and zkLogin handle cryptographic material. Configuration errors could expose keys or allow session hijacking.

| # | Check Item | Files |
|---|-----------|-------|
| 4.1 | Wallet config: RPC URL from env vars, sessionPersist behavior | `main.tsx:16-20` |
| 4.2 | zkLogin init: conditional (only if clientId and saltApiUrl exist) | `main.tsx:22-38` |
| 4.3 | zkLogin redirect URI: constructed from `window.location.origin` (safe) | `main.tsx:34` |
| 4.4 | AuthCallback: delegates to @nasun/wallet-ui, no custom token handling | `pages/AuthCallback.tsx` |
| 4.5 | No secret credentials in .env (all VITE_ vars are public by design) | `.env` |
| 4.6 | WalletConnect project ID exposure (public by design per WalletConnect docs) | `.env` |

### Area 5: Data Fetching & RPC Safety

**Why Important**: All blockchain data comes from the Nasun Devnet RPC. The RPC client pattern determines whether malformed responses could cause issues.

| # | Check Item | Files |
|---|-----------|-------|
| 5.1 | SuiClient used directly (official SDK, audited) | `lib/sui-client.ts:1-5` |
| 5.2 | No custom HTTP interceptors or middleware on RPC calls | `lib/sui-client.ts` |
| 5.3 | Error handling pattern: try/catch → console.error → null/empty return | `lib/sui-client.ts` (all functions) |
| 5.4 | Parallel RPC calls: Promise.all with proper error isolation | `lib/sui-client.ts:15-19, 92-118` |
| 5.5 | TanStack Query: staleTime 10s, refetchInterval 30s (reasonable defaults) | `main.tsx:44-51` |
| 5.6 | Auto-refresh intervals: 5s for network status, no runaway polling | `hooks/useNetworkData.ts` |
| 5.7 | Pagination: cursor-based (RPC standard), no offset manipulation | `hooks/useCursorPagination.ts` |

### Area 6: Error Handling & Information Leakage

**Why Important**: Error messages could leak internal RPC details or cause poor UX.

| # | Check Item | Files |
|---|-----------|-------|
| 6.1 | ErrorBoundary: shows generic message, no stack trace to user | `components/layout/ErrorBoundary.tsx` |
| 6.2 | RPC errors: logged to console, not displayed to user | `lib/sui-client.ts` |
| 6.3 | Console.error usage: appropriate for devnet, review for production | All files |
| 6.4 | 404 handling: missing routes handled by React Router | `App.tsx` |
| 6.5 | Object not found: graceful "not found" UI vs error state | `pages/Object.tsx`, `pages/Transaction.tsx` |

### Area 7: Configuration & Environment

| # | Check Item | Files |
|---|-----------|-------|
| 7.1 | Chain ID in `.env` matches current devnet (V7: `272218f1`) | `.env:4` |
| 7.2 | Vite dev proxy: faucet proxy config (no secret leakage) | `vite.config.ts` |
| 7.3 | Build chunking: React and wallet in separate chunks | `vite.config.ts` |
| 7.4 | BASE_URL: different for staging/prod vs dev | `vite.config.ts:4` |
| 7.5 | Self-hosted fonts: no external CDN calls for fonts | `index.css` |

---

## 4. Known Secure Patterns (Skip These)

These patterns have been verified as correctly implemented. Reviewers can skip detailed analysis of these unless they discover deviations:

1. **React text rendering**: All user-facing values rendered as JSX text content (`{value}`), not HTML. No `dangerouslySetInnerHTML` in entire codebase.
2. **SVG exclusion**: `SAFE_DATA_PREFIXES` in `media.ts` explicitly excludes `data:image/svg+xml`.
3. **Protocol allowlist**: `resolveMediaUrl()` blocks everything except `https://`, `http://`, `ipfs://` (converted to https), and whitelisted `data:` MIME types.
4. **Route params**: All pages use `useParams<>()` with TypeScript generics, no `useSearchParams()` or manual query string parsing.
5. **React Router links**: Internal navigation uses `<Link to={...}>`, not `<a href={...}>`.
6. **ErrorBoundary**: Catches all unhandled errors, shows generic recovery UI.
7. **TanStack Query caching**: Prevents redundant RPC calls, has sensible stale/refetch intervals.

---

## 5. High-Priority Review Focus

Reviewers should spend the most time on these areas, listed in priority order:

### Priority 1: NFT Media Rendering Pipeline
```
Flow: RPC response → object-utils.ts (parse) → nft.ts (extract URLs)
      → media.ts (resolveMediaUrl) → NFTMedia.tsx (render)
```
- Can an attacker craft a Sui object that bypasses the media URL sanitization?
- Are there code paths where a URL reaches `<img src={}>`or `<video src={}>` without going through `resolveMediaUrl()`?
- Does the IPFS hash parameter in `https://ipfs.io/ipfs/${hash}` allow path traversal (e.g., `../../`)?

### Priority 2: Search Bar → RPC → Display
```
Flow: SearchBar.tsx (input) → navigate(/tx/:digest or /address/:addr)
      → Page (useParams) → sui-client.ts (RPC call) → Component (render)
```
- Can a crafted URL like `/tx/<script>alert(1)</script>` cause issues?
- What happens if RPC returns unexpected data types?

### Priority 3: External Link Safety
```
Flow: NFT metadata → description/external_url field → rendered as <a href={}>
```
- Are all external links (from NFT metadata) sanitized via `sanitizeHref()`?
- Check NFTDetailView.tsx and NFTAttributes.tsx for raw URL rendering.

---

## 6. Phased File Review Order

### Phase 1: XSS Attack Surface (NFT/Media)
1. `src/lib/media.ts` -- URL sanitization logic
2. `src/components/NFTMedia.tsx` -- Media rendering component
3. `src/components/NFTDetailView.tsx` -- NFT detail (external links, metadata)
4. `src/components/NFTCard.tsx` -- NFT card (thumbnail)
5. `src/components/NFTAttributes.tsx` -- NFT attributes (arbitrary key-value display)
6. `src/lib/nft.ts` -- NFT field extraction
7. `src/lib/object-utils.ts` -- Object type detection

### Phase 2: User Input & Search
8. `src/components/charts/SearchBar.tsx` -- Search validation and navigation
9. `src/pages/Transaction.tsx` -- Route param → RPC call
10. `src/pages/Object.tsx` -- Route param → RPC call
11. `src/pages/Address.tsx` -- Route param → RPC call

### Phase 3: RPC & Data Layer
12. `src/lib/sui-client.ts` -- All RPC functions (338 lines, most critical)
13. `src/hooks/useNetworkData.ts` -- Auto-refresh polling
14. `src/hooks/useAddressObjects.ts` -- Pagination
15. `src/hooks/useCursorPagination.ts` -- Generic cursor handling

### Phase 4: Auth & Configuration
16. `src/main.tsx` -- Wallet config, zkLogin init
17. `src/pages/AuthCallback.tsx` -- OAuth callback
18. `index.html` -- CSP policy
19. `.env` -- Environment variables

### Phase 5: UI Components (Lower Priority)
20. `src/components/InfoRow.tsx` -- Key-value with copy/link
21. `src/components/ui/JsonBlock.tsx` -- JSON display
22. `src/components/CopyableId.tsx` -- Copy to clipboard
23. `src/components/layout/ErrorBoundary.tsx` -- Error recovery

### Phase 6: Display Components (Lowest Priority)
24-30. Transaction detail components (TransactionOverview, Gas, Events, etc.)
31-35. Address components (Overview, Balances, NFTs, Objects, History)
36-38. Home components (NetworkStatusCards, Charts, RecentTX)

---

## 7. Output Format

For each finding, use this format:

```
### [SEVERITY] Title

**Location**: `file_path:line_number`
**Category**: (XSS | Injection | Auth | Config | Info Leak | Logic | Performance)
**Description**: What the issue is and why it matters.
**Impact**: What could happen if exploited.
**Remediation**: Specific fix recommendation.
```

Severity levels:
- **CRITICAL**: Exploitable vulnerability with high impact (XSS, auth bypass)
- **HIGH**: Security weakness that should be fixed before production
- **MEDIUM**: Improvement needed but not immediately exploitable
- **LOW**: Best practice recommendation, code quality
- **INFO**: Observation, no action required

---

## 8. Context Notes

- **This is a devnet explorer** -- no real money at stake, but XSS could steal wallet keys
- **No backend**: All Lambda endpoints are in the nasun-website project (reviewed separately)
- **Shared wallet packages** (`@nasun/wallet`, `@nasun/wallet-ui`) are out of scope but worth noting if you spot issues in how they're called
- **Chain ID may be outdated**: `.env` has `12bf3808` (V6), current devnet is `272218f1` (V7)
- **IPFS gateway is hardcoded**: Single point of failure for NFT media
- **CSP is meta-tag based**: Weaker than HTTP header CSP, should be moved to nginx in production
