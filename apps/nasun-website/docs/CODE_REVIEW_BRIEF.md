# Nasun Website Full Code Review Brief

> **Absolute Rule: DO NOT modify any code.**
> This is a code review task ONLY. Do not create, edit, or delete any files.
> Output discovered issues and remediation recommendations as TEXT ONLY.
> Any attempt to modify code invalidates the entire review.

## Mission

Nasun Website (`apps/nasun-website/`) -- totaling ~490 frontend files (~47,000 lines) and ~90 Lambda source files (~17,500 lines) -- undergoes a full code review. This codebase was built via **vibe coding (LLM-generated) + manual refinement** by a bootstrapped team. The purpose is to identify security vulnerabilities and code quality issues before production deployment.

**Deliverable**: A prioritized list of findings and remediation recommendations (text only). **Never modify code files.**

---

## 1. Project Overview

### What is Nasun Website?

Nasun Website (`nasun.io`) is the **official website and community platform** for the Nasun blockchain project. It serves as the primary touchpoint for users, combining:

1. **Marketing/Content**: Homepage, ecosystem pages, product showcases (Pado, Baram, GenSol/Spectra)
2. **Multi-Provider Authentication**: MetaMask (ECDSA challenge-response), Twitter OAuth2 PKCE, Google zkLogin, Cognito Identity Pool
3. **Governance Voting**: On-chain voting with sponsored transactions, voting power certificates (Ed25519 oracle signatures)
4. **Battalion NFT Event**: 3-tier hybrid verification (DynamoDB cache -> engagement polling -> user context OAuth), whitelist management
5. **Leaderboard V3**: X/Twitter engagement scoring with freshness decay, per-type calculation, seasonal snapshots
6. **Admin Dashboard**: Whitelist management, blacklist, season management, proposal creation, CSV export
7. **User Account System**: Profile management, account linking/unlinking, wallet API, account deactivation/purge

### Tech Stack

| Area | Technology |
|------|-----------|
| Frontend | React 19, Vite 7, TypeScript 5.9, TailwindCSS 3.4, i18n (EN/KR) |
| Backend | 24+ AWS Lambda functions (Node.js 20), API Gateway |
| Auth | MetaMask ECDSA, Twitter OAuth2 PKCE, Google zkLogin, Cognito Identity Pool |
| Database | DynamoDB (8+ tables), Secrets Manager |
| Blockchain | Nasun Devnet (Sui fork, Chain ID: `272218f1`) |
| Infra | AWS CDK (7 stacks), CloudWatch Alarms |
| External APIs | X API v2 (twitter-api-v2), Alchemy, Etherscan, Google JWKS |

### Security Context

- **Authentication Complexity**: 4 auth providers (MetaMask, Twitter, Google zkLogin, Cognito) with cross-linking -- errors can lead to identity theft or unauthorized access
- **Governance Integrity**: Voting power calculated from multiple data sources; manipulation = unfair governance outcomes
- **Oracle/Sponsor Keys**: Lambda holds private keys for oracle signatures and sponsored transactions -- key exposure = vote forgery
- **PII Exposure**: User profiles contain Twitter handles, email, Ethereum addresses, Cognito IDs -- DynamoDB queries must not leak cross-user data
- **Admin Functions**: CSV export, blacklist, season management -- improper access control = data breach
- **Bootstrapped startup**: No dedicated security team or automated security tooling

---

## 2. Codebase Structure

### 2A. CDK Infrastructure (~3,100 lines)

```
apps/nasun-website/cdk/
├── bin/                                    # CDK app entry
├── lib/
│   ├── common-stack.ts              (876 lines) -- UserProfiles, auth, whitelist, price, wallet, zkLogin, user mgmt
│   ├── leaderboard-v3-stack.ts      (647 lines) -- Posts/Accounts/Seasons tables, 12 endpoints
│   ├── nft-event-stack.ts           (535 lines) -- Registration, verification, withdraw, export, follower
│   ├── auth-stack.ts                (279 lines) -- Twitter OAuth2, MetaMask challenge-verify
│   ├── admin-stack.ts               (155 lines) -- Whitelist export, admin APIs
│   ├── lambda-factory.ts            (188 lines) -- Shared Lambda config factory
│   ├── follower-stack.ts            (104 lines) -- Follower count collection (scheduled)
│   ├── monitoring-stack.ts          (101 lines) -- CloudWatch alarms
│   └── constants/cors.ts             (34 lines) -- CORS origin whitelist
```

### 2B. Lambda Functions (~17,500 lines)

#### Authentication Lambdas

```
cdk/lambda-src/
├── auth-twitter/src/
│   ├── handlers/login.ts            (129 lines) -- OAuth2 PKCE initiation
│   └── handlers/callback.ts         (317 lines) -- Token exchange, session creation, Cognito link
├── auth-metamask/src/
│   └── handlers/verify.ts           (130 lines) -- ECDSA signature verification, nonce challenge
├── zklogin-salt/src/
│   └── index.ts                     (261 lines) -- JWT verification, salt generation, Sui address derivation
├── link-account/
│   └── index.ts                     (296 lines) -- Cross-provider account linking/unlinking
```

#### Governance Lambda

```
├── governance-api/src/
│   └── index.ts                     (942 lines) -- Voting power calc, oracle signature, TX sponsorship
```

#### Leaderboard V3 Lambdas

```
├── leaderboard-v3/src/
│   ├── handlers/
│   │   ├── get-leaderboard.ts       (577 lines) -- Leaderboard query with pagination
│   │   ├── get-my-rank.ts           (516 lines) -- Current user's rank + stats
│   │   ├── admin-seasons.ts         (512 lines) -- Season CRUD + snapshot
│   │   ├── get-rank-history.ts      (367 lines) -- Historical rank tracking
│   │   ├── get-featured-feed.ts     (331 lines) -- Curated content feed
│   │   ├── admin-stats.ts           (321 lines) -- Admin statistics dashboard
│   │   ├── generate-snapshot.ts     (298 lines) -- Season snapshot generation
│   │   ├── get-top-climbers.ts      (281 lines) -- Rank climbing detection
│   │   ├── create-post.ts           (264 lines) -- Post registration + scoring
│   │   ├── search-accounts.ts       (209 lines) -- Account search
│   │   └── admin-blacklist.ts       (154 lines) -- Blacklist management
│   ├── services/
│   │   ├── dynamodb-client.ts      (1,035 lines) -- Data access layer
│   │   └── score-calculator.ts      (413 lines) -- Scoring formulas
│   ├── types/index.ts               (569 lines) -- Type definitions + constants
│   └── utils/url-normalizer.ts      (167 lines) -- URL normalization
```

#### NFT Event Lambdas

```
├── nft-event/
│   ├── verify-eligibility/src/
│   │   ├── index.ts                 (172 lines) -- Eligibility check handler
│   │   ├── services/xApiClient.ts   (308 lines) -- X API v2 client
│   │   ├── services/verificationService.ts (239 lines) -- 3-tier verification
│   │   ├── services/taskTracker.ts  (172 lines) -- DynamoDB task cache
│   │   └── services/engagementCache.ts (120+ lines) -- Engagement cache
│   ├── register-user/src/
│   │   ├── index.ts                 (181 lines) -- User registration
│   │   ├── services/whitelistService.ts (197 lines) -- Whitelist write
│   │   └── services/taskTracker.ts  (216 lines) -- Task tracking
│   ├── check-registration-status/src/
│   │   └── index.ts                 (134 lines) -- Status check
│   ├── withdraw-user/src/
│   │   └── index.ts                 (114 lines) -- Withdrawal handler
│   └── export-csv/src/
│       ├── index.ts                 (180 lines) -- CSV export handler
│       └── services/csvExportService.ts (168 lines) -- CSV generation
├── whitelist/src/                   # Legacy whitelist handlers
│   ├── handlers/ (join, check, withdraw, admin-list, admin-export)
│   └── utils/ (dynamodb, validation, auth, ethereum, response)
```

#### User & Data Lambdas

```
├── get-user-profile/index.ts       (215 lines) -- Profile CRUD
├── wallet-api/src/
│   ├── index.ts                     (127 lines) -- Wallet CRUD (Cognito-authorized)
│   └── handlers/ (getWallet, saveWallet, deleteWallet)
├── deactivate-user-account/src/index.ts -- Account deactivation
├── purge-deactivated-accounts/src/index.ts -- Scheduled account purge (Cognito unlink)
├── collect-followers/src/
│   ├── index.ts                     (219 lines) -- Scheduled follower collection
│   ├── services/twitter-api.ts      (148 lines) -- Twitter API wrapper
│   ├── services/token-manager.ts    (125 lines) -- OAuth token management
│   └── services/follower-store.ts   (269 lines) -- DynamoDB follower storage
├── get-follower-count/src/index.ts  (171 lines) -- Follower count query
├── PriceAPI/src/
│   ├── services/priceFetcher.ts     -- External price fetching
│   └── services/dynamoClient.ts     -- Price storage
├── get-backup-prices/src/index.ts   -- Backup price endpoint
├── getSupplyCount/src/index.ts      -- Individual supply count
├── admin-api/src/
│   ├── handlers/export-whitelist.ts (435 lines) -- Admin whitelist CSV export
│   └── utils/ (auth, csv, response)
```

### 2C. Frontend (~47,000 lines, ~490 files)

```
apps/nasun-website/frontend/src/
├── features/
│   ├── auth/                           # Authentication feature
│   │   ├── providers/AuthProvider.tsx   (271 lines) -- Multi-provider auth context
│   │   ├── handlers/ (googleOAuthHandler, twitterOAuthHandler)
│   │   ├── services/userProfileService.ts -- Profile API calls
│   │   ├── utils/ (authApi, urlValidation, googleAuthUrl)
│   │   ├── hooks/ (useAuth, useProtectedRoute)
│   │   └── types/
│   ├── admin/                          # Admin dashboard
│   │   ├── pages/ (WhitelistManagement, BlacklistManagement, CreateProposal)
│   │   ├── components/ (leaderboard-v3/, governance/)
│   │   ├── services/leaderboardV3Api.ts (321 lines)
│   │   └── types/leaderboard-v3.ts      (316 lines)
│   ├── governance/                     # Governance voting
│   │   ├── components/VoteModal.tsx     (303 lines)
│   │   ├── hooks/ (useGovernance, useVotingPower)
│   │   └── types/
│   ├── leaderboard-v3/                 # Leaderboard display
│   │   ├── components/ (main/, sidebar/)
│   │   ├── services/leaderboardV3Api.ts (253 lines)
│   │   ├── hooks/
│   │   └── types/index.ts              (247 lines)
│   ├── wallet/                         # Wallet integration
│   │   ├── components/
│   │   └── hooks/
│   └── wave1/                          # Wave1 event features
│       ├── components/ (early-contributors/, leaderboard-info/)
│       └── hooks/
├── sections/                           # Page sections
│   ├── wave1/
│   │   ├── battalion-nft/
│   │   │   ├── BattalionNftPage.tsx    (294 lines)
│   │   │   ├── BattalionNftHeroSection.tsx (293 lines)
│   │   │   └── cards/
│   │   │       ├── Step3TaskVerificationCard.tsx (367 lines) -- X task verification UI
│   │   │       └── Step4WalletConnectCard.tsx   (299 lines) -- Wallet connect for NFT
│   │   └── leaderboard-info/LeaderboardInfoSection.tsx (291 lines)
│   ├── myAccount/
│   │   └── ProfileHeroCard.tsx         (378 lines) -- Profile display + account management
│   ├── home/ (HeroSection, WhatWeBuildingSection, ...)
│   ├── ecosystem/ (pado/, baram/, ai-economy/, pado-revised/, pado-tech/, pado-vision/, pado-pitch/)
│   └── ...
├── services/
│   ├── ethereumApi.ts                  (404 lines) -- Alchemy/Etherscan NFT queries
│   ├── battalionNftApi.ts              (301 lines) -- Battalion NFT event API
│   └── whitelistApi.ts                 (280 lines) -- Whitelist API
├── hooks/
│   ├── whitelist/ (useWhitelistJoinFlow, useWhitelistRegistration)
│   ├── votingSystem/
│   ├── PayAndMintNFT/
│   └── network/
├── utils/
│   └── metamaskUtils.ts                (390 lines) -- MetaMask wallet interaction
├── store/userStore.ts                  -- Zustand user state
├── stores/useBattalionNftStore.ts      -- Battalion NFT state
├── config/routesConfig.ts              (691 lines) -- Route definitions
├── pages/
│   ├── protocol/ (ProposalDetailPage, ...)
│   ├── wave1/ (BattalionNftPage, LeaderboardPage, ...)
│   └── ...
├── lib/logger.ts                       -- Logging utility
└── types/                              -- Shared type definitions
```

### 2D. Smart Contract (Governance)

```
apps/nasun-website/contracts/
└── sources/
    ├── voting_power.move               -- VotingPowerCertificate, oracle signature verification
    └── proposal.move                   -- Proposal creation, voting with certificate
```

---

## 3. Review Scope & Checklist

### 3A. Authentication System -- HIGHEST PRIORITY

**Files**: `auth-twitter/`, `auth-metamask/`, `zklogin-salt/`, `link-account/`, `frontend/src/features/auth/`

| # | Check Item | Details |
|---|-----------|---------|
| A1 | MetaMask Nonce Replay | `verify.ts`: getAndDeleteNonce is atomic (DynamoDB conditional delete). Can nonce be reused if Lambda times out mid-verification? |
| A2 | MetaMask Signature Validation | `verify.ts`: KO/EN dual-message verification. Is recovered address strictly compared (case-insensitive)? Can signature from different nonce be replayed? |
| A3 | Twitter OAuth2 PKCE State | `callback.ts`: Is the `state` parameter validated to prevent CSRF? Is `code_verifier` stored securely in DynamoDB? |
| A4 | Twitter Session Fixation | `callback.ts`: After successful auth, is a new session created? Can attacker pre-fix session ID? |
| A5 | zkLogin JWT Verification | `zklogin-salt/index.ts`: Google JWKS fetched at runtime. JWKS cache? TOCTOU between fetch and verify? Audience validation completeness? |
| A6 | zkLogin Salt Exposure | Salt is stored in DynamoDB and returned to client. If salt leaks, can attacker derive Sui address and impersonate? |
| A7 | Account Linking Authorization | `link-account/index.ts`: When linking MetaMask to Twitter account, how is the "primary" identity verified? Can attacker link victim's MetaMask to their own Twitter? |
| A8 | Cognito Identity Pool | Multiple providers feed into one Cognito pool. Can two different users get the same identityId? Identity merging correctness? |
| A9 | Token Storage (Frontend) | `AuthProvider.tsx`: User profile in sessionStorage. Is Cognito token stored securely? XSS implications? |
| A10 | Cross-Provider Session | `AuthProvider.tsx`: handleOAuthRedirect dispatches to Google/Twitter handlers. Can one provider's redirect interfere with another's flow? |
| A11 | Return URL Validation | `urlValidation.ts`: Is the OAuth return URL properly validated to prevent open redirect? |

### 3B. Governance System -- HIGHEST PRIORITY

**Files**: `governance-api/src/index.ts`, `frontend/src/features/governance/`, `contracts/sources/`

| # | Check Item | Details |
|---|-----------|---------|
| G1 | Oracle Signature Forgery | `governance-api`: Oracle signs voting power with Ed25519. Is the domain separator (`DOMAIN_SEPARATOR`) collision-resistant? Can the signed message be replayed for different proposals? |
| G2 | Voting Power Manipulation | Voting power = leaderboard + on-chain + allowlist bonuses. Can user inflate leaderboard score to gain disproportionate voting power? |
| G3 | TX Sponsorship Abuse | Sponsor keypair signs user's transaction. `validateTxKind()` checks ALLOWED_TARGETS. Can attacker craft a TX that passes validation but performs unintended operations? |
| G4 | Certificate TTL | 15-min (devnet) / 30-min (mainnet) TTL. Can expired certificate still be used if Move contract doesn't check expiration? |
| G5 | Double Voting | After voting with certificate, is the certificate consumed/destroyed? Can same certificate vote on same proposal twice? |
| G6 | On-chain Activity Counting | On-chain activity queries Sui events. Can user generate fake events (e.g., self-trades on DeepBook) to inflate activity score? |
| G7 | Weight Manipulation | `LEADERBOARD_WEIGHT`, `ONCHAIN_WEIGHT` read from env. If env vars are missing, defaults apply. Are defaults safe? |
| G8 | Sponsor Key Exposure | `getOraclePrivateKey()` and `getSponsorKeypair()` cache raw key bytes in module-level variable. Lambda cold start vs warm start key lifecycle? |

### 3C. Leaderboard V3 -- HIGH PRIORITY

**Files**: `leaderboard-v3/src/`

| # | Check Item | Details |
|---|-----------|---------|
| LB1 | Score Calculation Integrity | `score-calculator.ts`: PostScore = Base x RoleMultiplier + SignalBonus. Can signals be spoofed? Are content signals verified server-side? |
| LB2 | DynamoDB Injection | `dynamodb-client.ts` (1,035 lines): All queries use parameterized expressions? No string concatenation in filter expressions? |
| LB3 | Admin Authorization | `admin-seasons.ts`, `admin-stats.ts`, `admin-blacklist.ts`: How are admin endpoints protected? API key? Cognito group? IAM? |
| LB4 | Pagination DoS | `get-leaderboard.ts` (577 lines): Unlimited page size? Can attacker request `limit=999999` and exhaust DynamoDB capacity? |
| LB5 | Freshness Decay Correctness | Half-life formula: `1 / (1 + daysSinceLastPost / 14)`. Edge cases: future dates? Negative values? NaN/Infinity? |
| LB6 | Season Snapshot Atomicity | `generate-snapshot.ts`: Scans all accounts and writes to season table. If Lambda times out mid-snapshot, is state inconsistent? |
| LB7 | Post Deduplication | `create-post.ts`: Can the same tweet be registered multiple times by different users? URL normalization correctness? |
| LB8 | Blacklist Bypass | `admin-blacklist.ts`: When account is blacklisted, does it affect existing scores and rankings? |
| LB9 | Follower Count Staleness | `collect-followers/`: Scheduled Lambda collects follower counts. How stale can the data be? Can user inflate followers between collections? |

### 3D. NFT Event System -- HIGH PRIORITY

**Files**: `nft-event/`, `whitelist/`, `frontend/src/sections/wave1/battalion-nft/`

| # | Check Item | Details |
|---|-----------|---------|
| NE1 | 3-Tier Verification Bypass | `verificationService.ts`: Tier 1 (DynamoDB cache) -> Tier 2 (engagement cache) -> Tier 3 (user context OAuth). Can user spoof Tier 1 cache entry to skip actual verification? |
| NE2 | X API Rate Limit | `xApiClient.ts`: 429 handling, retry logic. Can attacker trigger excessive API calls to exhaust rate limits for all users? |
| NE3 | Registration Race Condition | `register-user/`: Can user register multiple times concurrently? Is DynamoDB write conditional? |
| NE4 | CSV Export Authorization | `export-csv/`: Who can trigger CSV export? Does it expose PII (wallet addresses, Twitter handles) to unauthorized users? |
| NE5 | Withdrawal Integrity | `withdraw-user/`: Can user withdraw after already being verified? Does withdrawal clear all associated data? |
| NE6 | User Context OAuth Token | `verificationService.ts`: User's OAuth access token passed to Lambda. Is token validated before use? Can attacker pass arbitrary token? |
| NE7 | Whitelist DynamoDB Access | `whitelist/src/utils/dynamodb.ts` (216 lines): Condition expressions, scan operations. Injection possibility? |

### 3E. User Account & Wallet -- MEDIUM PRIORITY

**Files**: `wallet-api/`, `get-user-profile/`, `deactivate-user-account/`, `purge-deactivated-accounts/`, `link-account/`

| # | Check Item | Details |
|---|-----------|---------|
| U1 | Wallet API Authorization | `wallet-api/index.ts`: Uses Cognito authorizer (`requestContext.authorizer?.claims?.sub`). Can user access/modify another user's wallet? |
| U2 | Profile Data Leakage | `get-user-profile/index.ts`: GET with `identityId` query param. Is there access control, or can any user query any profile? |
| U3 | Account Deactivation | Can attacker deactivate another user's account? Is `identityId` validated against the authenticated user? |
| U4 | Account Purge Safety | `purge-deactivated-accounts/`: Scans for DEACTIVATED status, deletes DynamoDB records, unlinks Cognito. Is Cognito UnlinkIdentity call safe? Race condition with re-activation? |
| U5 | Wallet Address Validation | `saveWallet`: Is wallet address format validated? Can user store arbitrary strings? |

### 3F. Frontend Security -- MEDIUM PRIORITY

**Files**: `frontend/src/`

| # | Check Item | Details |
|---|-----------|---------|
| F1 | XSS via Server Responses | API responses rendered in DOM (leaderboard entries, user profiles, proposal descriptions, post content). HTML escaping? |
| F2 | MetaMask Injection | `metamaskUtils.ts` (390 lines): `window.ethereum` interaction. Can malicious browser extension impersonate MetaMask? |
| F3 | CSRF Protection | API calls to Lambda endpoints. Are credentials included? CORS headers consistent across all Lambdas? |
| F4 | Admin Route Protection | Admin pages (WhitelistManagement, BlacklistManagement, CreateProposal). Is route guard checking admin role server-side or just client-side? |
| F5 | OAuth Token Exposure | Google `id_token` in URL hash, Twitter `code` in query params. Are tokens cleared from URL after extraction? (`window.history.replaceState`) |
| F6 | Ethereum API Keys | `ethereumApi.ts`: `VITE_ALCHEMY_API_KEY`, `VITE_ETHERSCAN_API_KEY` in frontend env. Are these public-safe keys? Rate-limit implications? |
| F7 | Route Configuration | `routesConfig.ts` (691 lines): Lazy loading, protected routes. Are auth checks enforced consistently? |
| F8 | sessionStorage/localStorage | Sensitive data in browser storage: user profile, auth tokens, battalion NFT session. Is data properly scoped and cleaned? |

### 3G. Infrastructure & CORS -- MEDIUM PRIORITY

**Files**: `cdk/lib/*.ts`, `cdk/lib/constants/cors.ts`

| # | Check Item | Details |
|---|-----------|---------|
| I1 | CORS Consistency | Each Lambda implements its own CORS logic. Are ALLOWED_ORIGINS consistent across all 24+ Lambdas? Missing origins = broken functionality? |
| I2 | API Gateway Auth | Which endpoints use API keys? Cognito authorizers? No auth? Is there a pattern or is it ad-hoc? |
| I3 | DynamoDB Table Access | Which Lambdas have access to which tables? Principle of least privilege? |
| I4 | Secrets Manager Access | Multiple Lambdas access secrets (governance oracle key, sponsor key, Twitter API keys). Scope of access? |
| I5 | CloudWatch Logging | Sensitive data in logs? `maskSensitiveData` used consistently? |
| I6 | Lambda Timeout | Default timeout vs actual execution time. Can long-running operations (DynamoDB scan, X API calls) exceed timeout? |
| I7 | Environment Variables | Many Lambdas fallback to default values when env vars are missing. Are defaults safe for production? |

---

## 4. Security Deep Dive Areas

### 4A. Authentication Flow Tracing

Trace every auth flow end-to-end and verify no identity confusion or privilege escalation is possible:

```
[MetaMask Flow]
Frontend: connectWallet() → getNonce(address) → signMessage(nonce) → POST /verify
Lambda:   getAndDeleteNonce() → verifySignature(KO/EN) → getCognitoIdentityId() → return token
Risk:     Nonce replay, signature message mismatch, Cognito ID collision

[Twitter OAuth2 PKCE Flow]
Frontend: redirect → Twitter OAuth consent → callback with ?code= → POST /callback
Lambda:   exchange code for tokens → fetch user info → create DynamoDB session → Cognito link
Risk:     State parameter CSRF, token interception, session fixation

[zkLogin Flow]
Frontend: Google OAuth → id_token in hash → POST /auth/zklogin/salt with JWT
Lambda:   verify JWT (JWKS) → check audience → get/create salt → derive Sui address
Risk:     JWT replay, JWKS cache poisoning, salt leakage → address derivation

[Account Linking]
Frontend: Authenticated user → Link another provider → OAuth flow → POST /link-account
Lambda:   Verify both identities → merge profiles in DynamoDB → update linkedAccounts
Risk:     Unauthorized linking, identity confusion, orphaned secondary identity
```

### 4B. Governance Vote Integrity

Trace the voting flow and verify no vote forgery is possible:

```
[Voting Power Certificate]
Frontend: Build TX (mint_certificate + vote_with_certificate) → POST /governance/sponsor
Lambda:   1. Validate TX structure (ALLOWED_TARGETS whitelist)
          2. Query voting power (leaderboard + on-chain + allowlists)
          3. Sign oracle attestation (Ed25519, domain-separated)
          4. Add mint_certificate call with signature
          5. Sponsor TX (gas payment)
          6. Return sponsored TX bytes
Frontend: Sign with user's keypair → Submit to chain
Move:     verify_oracle_attestation → mint VotingPowerCertificate → vote_with_certificate
```

Verify:
- Can TX structure validation be bypassed (e.g., extra MoveCall commands)?
- Can oracle signature be replayed for different proposals or users?
- Is domain separator unique per network/environment?
- Can certificate be used before TTL or after expiration?
- Is voting power deterministic or can it change between calculation and on-chain use?

### 4C. Leaderboard Score Gaming

Potential attack vectors for score manipulation:

```
[Post Score Inflation]
1. Register fake tweets (URL spoofing via normalization bypass)
2. Self-retweet/like to generate engagement signals
3. Use multiple accounts to cross-boost signal scores

[Role Multiplier Gaming]
1. Inflate follower count between collection intervals
2. Exploit language normalization (Korean 5x multiplier)
3. Register with fake KOL account

[Freshness/Consistency Exploitation]
1. Automated daily posting to maximize consistency bonus
2. Time-bomb: post just before snapshot to maximize freshness
```

### 4D. DynamoDB Access Pattern Security

Cross-reference all DynamoDB access patterns to verify no unauthorized data access:

| Table | Lambdas with Access | Risk |
|-------|-------------------|------|
| UserProfiles | get-user-profile, link-account, auth-twitter, auth-metamask, wallet-api, deactivate, purge | Profile data leakage if identityId is guessable |
| UserIdentityMap | link-account, auth-twitter | Identity confusion if mapping is inconsistent |
| nasun-nft-whitelist | whitelist/*, nft-event/*, admin-api, governance-api | Unauthorized whitelist modification |
| leaderboard-v3-accounts | leaderboard-v3/*, auth-twitter, governance-api | Score tampering if admin endpoints lack auth |
| leaderboard-v3-posts | leaderboard-v3/* | Post injection, score inflation |
| leaderboard-v3-seasons | leaderboard-v3/* | Season manipulation |
| ZkLoginUsers | zklogin-salt | Salt exposure = address derivation |
| NasunAuthSessions | auth-twitter | Session hijacking |

---

## 5. Code Quality Checks

### 5A. Architecture Patterns

| Check | Expected |
|-------|----------|
| CORS Consistency | All Lambdas use identical ALLOWED_ORIGINS from shared constant |
| Error Response Format | Consistent JSON error structure across all endpoints |
| Auth Pattern | Cognito authorizer for protected endpoints, API key for admin |
| DynamoDB Patterns | Document client with parameterized expressions, no string interpolation |
| Frontend State | Zustand stores for global state, React Context for auth |
| Type Safety | Strict TypeScript, minimal `any` usage |

### 5B. Code Smells

Report if found:
- Functions >200 lines (governance-api/index.ts handler, dynamodb-client.ts methods)
- >3 levels of nested conditionals/callbacks
- Same CORS logic duplicated in 24+ Lambdas instead of shared middleware
- Unused imports, variables, functions
- `// TODO`, `// FIXME`, `// HACK` comments
- `console.log`/`console.warn` exposing sensitive data in production
- Empty catch blocks (`catch { }` or `catch { /* ignore */ }`)
- `any` type usage (especially in `purge-deactivated-accounts`, `link-account`)
- `JSON.parse(event.body || '{}')` without try/catch
- `secret.SecretString!` non-null assertions on AWS SDK responses

### 5C. CORS Duplication

Every Lambda independently implements CORS:
```typescript
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string { ... }
```

Check:
- Are all 24+ implementations identical?
- Are fallback origins safe? (defaulting to `https://nasun.io` vs empty)
- Is `Access-Control-Allow-Credentials` consistently applied?
- Are security headers (HSTS, X-Frame-Options, CSP) consistently added?

### 5D. Test Coverage

Current test status:
- **Lambda**: `governance-api/test/security-e2e.test.ts` (299 lines) -- ONLY test file found
- **Frontend**: `frontend/src/__tests__/` exists, plus `leaderboard-v3/components/__tests__/`
- **No unit tests** for: auth Lambdas, NFT event, whitelist, leaderboard handlers, wallet API

Identify critical untested paths:
- MetaMask signature verification edge cases
- Twitter OAuth callback error paths
- zkLogin JWT verification failure modes
- Governance oracle signature generation
- Leaderboard score calculation edge cases
- NFT event 3-tier verification fallback paths
- Account purge Cognito unlink error recovery

---

## 6. Known Issues (Already Identified)

Already identified and either fixed or acknowledged. **Focus on NEW findings -- do not re-report these**:

| # | Issue | Status |
|---|-------|--------|
| K1 | MetaMask nonce atomic delete (race condition) | FIXED (getAndDeleteNonce with conditional delete) |
| K2 | Twitter OAuth CORS security headers | FIXED (HSTS, X-Frame-Options, Referrer-Policy added) |
| K3 | Governance TX whitelist validation | IMPLEMENTED (ALLOWED_TARGETS set) |
| K4 | X API Basic Plan follow verification | ACKNOWLEDGED (deprecated, intent URL fallback) |
| K5 | Leaderboard V3 freshness half-life | IMPLEMENTED (14-day half-life, consistency bonus) |
| K6 | Multiple cdk.out asset copies | KNOWN (CDK build artifacts, not source duplication) |
| K7 | Dark mode unification | COMPLETED (documented in _DARK_MODE_UNIFICATION_COMPLETION_REPORT.md) |
| K8 | Sensitive data masking in logs | PARTIALLY IMPLEMENTED (maskSensitiveData in some Lambdas) |

---

## 7. Output Format

> **Again: DO NOT modify code files.** Read/search only.
> Output findings in the format below as TEXT ONLY.

### 7A. Findings Format

Each finding:

```
### [SEVERITY-NUMBER] Title
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **File**: filepath:line_number
- **Category**: Security / Code Quality / Architecture / Performance / Correctness
- **Description**: What the issue is, specifically
- **Impact**: What happens if exploited/triggered
- **Recommendation**: How to fix it
- **Code snippet**: Problem code (5 lines max)
```

### 7B. Severity Criteria

| Severity | Criteria |
|----------|---------|
| CRITICAL | Identity theft, unauthorized account access, oracle key exposure, vote forgery |
| HIGH | Authentication bypass, unauthorized data access, PII exposure, admin function abuse |
| MEDIUM | Score manipulation, data inconsistency, race condition, information leakage |
| LOW | Code quality, maintainability, performance inefficiency, inconsistent patterns |
| INFO | Improvement suggestion, best practice mismatch |

### 7C. Final Summary

- Total findings count (by severity)
- Immediate fix required (CRITICAL/HIGH)
- Must-fix before production deployment
- Items deferrable to future work

---

## 8. File Review Order

Review in this order for maximum security coverage:

### Phase 1: Authentication & Identity (10 files, ~2,500 lines) -- HIGHEST RISK

1. `cdk/lambda-src/auth-metamask/src/handlers/verify.ts` (130 lines)
2. `cdk/lambda-src/auth-metamask/src/utils/ethereum.ts` -- Signature verification implementation
3. `cdk/lambda-src/auth-metamask/src/utils/dynamodb.ts` -- Nonce management
4. `cdk/lambda-src/auth-twitter/src/handlers/callback.ts` (317 lines)
5. `cdk/lambda-src/auth-twitter/src/handlers/login.ts` (129 lines)
6. `cdk/lambda-src/auth-twitter/src/utils/session-manager.ts` -- Session management
7. `cdk/lambda-src/zklogin-salt/src/index.ts` (261 lines)
8. `cdk/lambda-src/link-account/index.ts` (296 lines)
9. `cdk/lambda-src/get-user-profile/index.ts` (215 lines)
10. `cdk/lambda-src/wallet-api/src/index.ts` (127 lines)

### Phase 2: Governance & Voting (5 files, ~2,500 lines) -- Oracle Key & Vote Integrity

11. `cdk/lambda-src/governance-api/src/index.ts` (942 lines)
12. `contracts/sources/voting_power.move` -- On-chain oracle attestation verification
13. `contracts/sources/proposal.move` -- Voting logic
14. `frontend/src/features/governance/components/VoteModal.tsx` (303 lines)
15. `frontend/src/features/governance/hooks/useVotingPower.ts`

### Phase 3: Leaderboard V3 (15 files, ~6,500 lines) -- Score Integrity & Admin

16. `cdk/lambda-src/leaderboard-v3/src/services/score-calculator.ts` (413 lines)
17. `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts` (1,035 lines)
18. `cdk/lambda-src/leaderboard-v3/src/handlers/create-post.ts` (264 lines)
19. `cdk/lambda-src/leaderboard-v3/src/handlers/get-leaderboard.ts` (577 lines)
20. `cdk/lambda-src/leaderboard-v3/src/handlers/get-my-rank.ts` (516 lines)
21. `cdk/lambda-src/leaderboard-v3/src/handlers/admin-seasons.ts` (512 lines)
22. `cdk/lambda-src/leaderboard-v3/src/handlers/admin-stats.ts` (321 lines)
23. `cdk/lambda-src/leaderboard-v3/src/handlers/admin-blacklist.ts` (154 lines)
24. `cdk/lambda-src/leaderboard-v3/src/handlers/generate-snapshot.ts` (298 lines)
25. `cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts` (331 lines)
26. `cdk/lambda-src/leaderboard-v3/src/handlers/get-top-climbers.ts` (281 lines)
27. `cdk/lambda-src/leaderboard-v3/src/handlers/get-rank-history.ts` (367 lines)
28. `cdk/lambda-src/leaderboard-v3/src/handlers/search-accounts.ts` (209 lines)
29. `cdk/lambda-src/leaderboard-v3/src/types/index.ts` (569 lines)
30. `cdk/lambda-src/leaderboard-v3/src/utils/url-normalizer.ts` (167 lines)

### Phase 4: NFT Event & Whitelist (15 files, ~3,500 lines) -- Verification Integrity

31. `cdk/lambda-src/nft-event/verify-eligibility/src/services/verificationService.ts` (239 lines)
32. `cdk/lambda-src/nft-event/verify-eligibility/src/services/xApiClient.ts` (308 lines)
33. `cdk/lambda-src/nft-event/verify-eligibility/src/index.ts` (172 lines)
34. `cdk/lambda-src/nft-event/verify-eligibility/src/services/taskTracker.ts` (172 lines)
35. `cdk/lambda-src/nft-event/verify-eligibility/src/services/engagementCache.ts`
36. `cdk/lambda-src/nft-event/register-user/src/index.ts` (181 lines)
37. `cdk/lambda-src/nft-event/register-user/src/services/whitelistService.ts` (197 lines)
38. `cdk/lambda-src/nft-event/withdraw-user/src/index.ts` (114 lines)
39. `cdk/lambda-src/nft-event/export-csv/src/index.ts` (180 lines)
40. `cdk/lambda-src/nft-event/check-registration-status/src/index.ts` (134 lines)
41. `cdk/lambda-src/whitelist/src/handlers/join.ts` (170 lines)
42. `cdk/lambda-src/whitelist/src/utils/dynamodb.ts` (216 lines)
43. `cdk/lambda-src/whitelist/src/utils/auth.ts`
44. `cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` (435 lines)
45. `cdk/lambda-src/collect-followers/src/index.ts` (219 lines)

### Phase 5: User Management & Data (5 files, ~800 lines)

46. `cdk/lambda-src/deactivate-user-account/src/index.ts`
47. `cdk/lambda-src/purge-deactivated-accounts/src/index.ts`
48. `cdk/lambda-src/get-follower-count/src/index.ts` (171 lines)
49. `cdk/lambda-src/collect-followers/src/services/token-manager.ts` (125 lines)
50. `cdk/lambda-src/collect-followers/src/services/follower-store.ts` (269 lines)

### Phase 6: Frontend Critical Path (15 files, ~5,000 lines)

51. `frontend/src/features/auth/providers/AuthProvider.tsx` (271 lines)
52. `frontend/src/features/auth/handlers/twitterOAuthHandler.ts`
53. `frontend/src/features/auth/handlers/googleOAuthHandler.ts`
54. `frontend/src/features/auth/utils/urlValidation.ts`
55. `frontend/src/features/auth/utils/authApi.ts`
56. `frontend/src/utils/metamaskUtils.ts` (390 lines)
57. `frontend/src/services/ethereumApi.ts` (404 lines)
58. `frontend/src/services/battalionNftApi.ts` (301 lines)
59. `frontend/src/services/whitelistApi.ts` (280 lines)
60. `frontend/src/sections/wave1/battalion-nft/cards/Step3TaskVerificationCard.tsx` (367 lines)
61. `frontend/src/sections/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx` (299 lines)
62. `frontend/src/sections/myAccount/ProfileHeroCard.tsx` (378 lines)
63. `frontend/src/store/userStore.ts`
64. `frontend/src/config/routesConfig.ts` (691 lines)
65. `frontend/src/features/leaderboard-v3/services/leaderboardV3Api.ts` (253 lines)

### Phase 7: CDK Infrastructure (8 files, ~3,100 lines)

66. `cdk/lib/common-stack.ts` (876 lines)
67. `cdk/lib/auth-stack.ts` (279 lines)
68. `cdk/lib/leaderboard-v3-stack.ts` (647 lines)
69. `cdk/lib/nft-event-stack.ts` (535 lines)
70. `cdk/lib/admin-stack.ts` (155 lines)
71. `cdk/lib/follower-stack.ts` (104 lines)
72. `cdk/lib/monitoring-stack.ts` (101 lines)
73. `cdk/lib/lambda-factory.ts` (188 lines)

### Phase 8: Remaining Frontend (~400+ files)

74+. Remaining pages, sections, components, hooks, utils

---

## 9. Reference Information

- **Nasun Devnet** is a Sui fork. All standard Sui Move features (shared objects, dynamic fields, Table, Balance) are supported.
- **Chain ID**: `272218f1` (Devnet V7)
- **NUSDC**: 6 decimals (1,000,000 = 1 NUSDC). Native token: NASUN (9 decimals, smallest unit: SOE).
- Frontend uses both `@nasun/wallet` and MetaMask integration. Two wallet ecosystems coexist.
- CDK infrastructure: AWS Lambda + API Gateway, DynamoDB, Secrets Manager, S3 (CSV export), CloudWatch.
- i18n: EN/KR supported via locales. UI text defaults to English.
- Existing docs in `apps/nasun-website/docs/` contain architecture guides -- cross-reference for design intent.

### Key Architecture Decisions

1. **Multi-Provider Auth**: MetaMask (ECDSA), Twitter (OAuth2 PKCE), Google (zkLogin), unified via Cognito Identity Pool
2. **Governance Voting Power**: `log2(1 + leaderboardScore) * 8 + log2(1 + onchainScore) * 8 + allowlistBonuses + xLinkBonus`
3. **Sponsored Transactions**: Lambda holds sponsor keypair, validates TX structure against whitelist before signing gas
4. **3-Tier NFT Verification**: DynamoDB task cache (0 API calls) -> engagement polling cache (0 API calls) -> user context OAuth (per-user rate limit)
5. **Leaderboard V3 Score**: PostScore x PerTypeDecay x ConsistencyBonus x FreshnessMultiplier
6. **Account Linking**: Primary identity (MetaMask/Twitter/Google) can link secondary providers, stored in UserProfiles.linkedAccounts
7. **Session Strategy**: sessionStorage for user profile (XSS mitigation), localStorage for auth preference
