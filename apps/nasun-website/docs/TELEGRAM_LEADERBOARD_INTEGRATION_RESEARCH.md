# Telegram Post Data - Leaderboard V3 Integration Research

> Date: 2026-03-13
> Status: Research Complete, Implementation Pending

## 1. Background

Leaderboard V3 currently scores community engagement based on **X (Twitter) posts only**. To expand community participation channels, we want to include Telegram post data in the leaderboard scoring system.

## 2. Current Leaderboard V3 Architecture

### 2.1 Manual Curation System

Leaderboard V3 is a **manual curation system**, not an automated crawler. Admins register social media posts via the admin panel (`/admin/leaderboard-v3`), and scores are calculated based on post metadata.

**Post Registration Flow:**
1. Admin enters a post URL in the admin panel
2. `url-normalizer.ts` parses and normalizes the URL, extracts platform + username
3. Account is looked up or created in DynamoDB (`platform-username-index` GSI)
4. Post score is calculated and written to DynamoDB (Posts + Account aggregates + Season-Account)

### 2.2 Scoring Formula

```
PostScore = Base(1.0) x PostTypeMultiplier x RoleMultiplier + SignalBonus

RoleMultiplier = 1.0 + log10(normalizedFollowers + 1) x 0.2
  - Range: 1.0 (0 followers) to 2.0 (100,000+ normalized)
  - Language-adjusted: followers x LANGUAGE_SCALE (en:1.0, zh:1.3, ja:1.8, ko:3.0)

PostTypeMultiplier: original/quote = 1.0, reply = 0.5

SignalBonus: insight(+1) + creative(+1) + high_reach(+1) = max +3

RawScore = per-type log decay with daily caps
CompressedRaw = RawScore ^ 0.8
UserScore = CompressedRaw x ConsistencyBonus x FreshnessMultiplier
```

### 2.3 Platform Support Status

The `Platform` type is defined as `'twitter' | 'discord' | 'farcaster'`, but **only Twitter has real URL normalization and profile sync**. Discord and Farcaster are type-level only.

### 2.4 Existing Telegram Integration

Telegram is already integrated for **channel membership verification** (separate from leaderboard scoring):
- `verify-telegram` Lambda: Verifies user joined @nasun_io channel via Telegram Login Widget
- `isTelegramMember` field displayed as a sky-blue checkmark badge on leaderboard
- HMAC-SHA256 verification of Telegram widget data
- `telegramUserId` stored in UserProfiles table with GSI

### 2.5 Key Files

| File | Purpose |
|------|---------|
| `cdk/lambda-src/leaderboard-v3/src/types/index.ts` | Platform type, score constants |
| `cdk/lambda-src/leaderboard-v3/src/utils/url-normalizer.ts` | URL parsing/normalization (Twitter only) |
| `cdk/lambda-src/leaderboard-v3/src/handlers/create-post.ts` | Post registration handler |
| `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts` | DynamoDB operations, profile sync |
| `cdk/lambda-src/leaderboard-v3/src/services/score-calculator.ts` | Score calculation (platform-independent) |
| `frontend/src/features/admin/types/leaderboard-v3.ts` | Frontend types (mirrors backend) |
| `frontend/src/features/admin/components/leaderboard-v3/PostRegistrationTab.tsx` | Admin post registration UI |

## 3. Approach Analysis

### 3.1 Approach A: Simple URL Extension (Recommended)

Extend the existing manual curation workflow to support Telegram URLs. Admins paste `t.me/channel/123` URLs the same way they paste Twitter URLs.

**Changes Required:**
- Add `'telegram'` to Platform type (backend + frontend)
- Add Telegram URL patterns to `url-normalizer.ts`
- Update `PostRegistrationTab.tsx` to detect Telegram URLs
- Add Telegram platform icon/link in leaderboard UI

**Pros:**
- Zero additional infrastructure cost
- 6 files, small changes each
- Identical admin workflow (paste URL, select signals, submit)
- Existing score calculator works as-is (platform-independent)
- Foundation for future automation (Approach B/C)

**Cons:**
- Admins must manually find and register Telegram posts
- No Telegram engagement metrics (view counts etc.)

### 3.2 Approach B: Bot-Automated Collection

Deploy a Telegram bot to the Nasun community channel/group that monitors messages and auto-registers qualifying posts.

**Required Infrastructure:**
- New Lambda: `telegram-bot-collector` (webhook or polling)
- API Gateway webhook endpoint for Telegram Bot API
- Bot must be channel/group admin to access messages
- Existing `nasun-telegram-bot-token` secret can be reused

**Technical Constraints:**
- Bot API `getUpdates` requires long polling or webhook
- contentSignals (Insight/Creative/High Reach) cannot be auto-determined
- postType requires human judgment
- scorePreview and quality filtering need admin involvement

**Pros:**
- Reduces admin burden significantly
- Real-time post tracking possible

**Cons:**
- Significant new infrastructure (Lambda, API Gateway endpoint, bot logic)
- contentSignals auto-assignment impossible, defeats manual curation purpose
- Bot requires admin privileges in channel (security consideration)
- Over-engineering risk at prototype stage

### 3.3 Approach C: Hybrid (Bot Suggest + Admin Approve)

Bot collects posts into a "pending" queue. Admin reviews and approves with signal assignments.

**Additional Complexity:**
- "pending posts" queue/table in DynamoDB
- New admin UI tab for approval workflow
- Dual implementation: bot collection + approval flow

**Pros:**
- Best of both worlds (automation + quality control)

**Cons:**
- 3-4x implementation effort compared to Approach A
- Pending state management adds complexity
- Over-engineering for a bootstrapped project

## 4. Recommendation: Approach A

For a bootstrapped project in prototype stage, Approach A is the clear winner:

1. **Zero cost**: No additional AWS resources
2. **Minimal change**: 6 files, small modifications each
3. **Same UX**: Admins already know the workflow
4. **Extensible**: Can evolve to B/C later if needed
5. **Score calculator unchanged**: `calculatePostScoreWithFollowers()` is already platform-independent

## 5. Implementation Plan (Approach A)

### Step 1: Backend - Platform Type Extension

**File**: `cdk/lambda-src/leaderboard-v3/src/types/index.ts`

Add `'telegram'` to the Platform union type:
```typescript
export type Platform = 'twitter' | 'discord' | 'farcaster' | 'telegram';
```

### Step 2: Backend - URL Normalizer

**File**: `cdk/lambda-src/leaderboard-v3/src/utils/url-normalizer.ts`

Add Telegram URL patterns:
- Public channel/group: `t.me/{channelname}/{messageId}`, `telegram.me/{channelname}/{messageId}`
- Private channel: `t.me/c/{chatId}/{messageId}` (optional, can defer)

Normalization rules:
- Canonical domain: `t.me` (strip `telegram.me`, `www.` etc.)
- Canonical format: `https://t.me/{channelname}/{messageId}`
- Username field: channelname (lowercase)
- PostId field: messageId

Edge cases:
- `t.me/s/{channelname}/{messageId}` (preview URLs) -> normalize to standard form
- `t.me/{channelname}` without messageId -> reject (not a specific post)
- Numeric-only channelname in `t.me/c/` format -> handle or reject initially

### Step 3: Backend - DynamoDB Client

**File**: `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts`

Verify that the `createPost` function's UserProfiles lookup is conditioned on `platform === 'twitter'`. For Telegram accounts, skip profile sync (no UserProfiles entry exists for Telegram-only accounts).

### Step 4: Backend - Score Calculator

**File**: `cdk/lambda-src/leaderboard-v3/src/services/score-calculator.ts`

No changes needed. `calculatePostScoreWithFollowers()` accepts `(followerCount, language, signals, postType)` and is already platform-independent.

### Step 5: Frontend - Types and Labels

**File**: `frontend/src/features/admin/types/leaderboard-v3.ts`

```typescript
export type Platform = 'twitter' | 'discord' | 'farcaster' | 'telegram';

export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'X (Twitter)',
  discord: 'Discord',
  farcaster: 'Farcaster',
  telegram: 'Telegram',
};
```

### Step 6: Frontend - PostRegistrationTab

**File**: `frontend/src/features/admin/components/leaderboard-v3/PostRegistrationTab.tsx`

1. Extend `extractUsernameFromUrl()` to detect Telegram URLs and return `{ username, platform }`
2. Pass detected platform to `useLeaderboardV3Account()` (currently hardcoded as `"twitter"`)
3. Update URL input placeholder: `"https://x.com/... or https://t.me/channel/123"`
4. Conditionally change "X Follower Count" label to "Channel Subscribers" for Telegram URLs

### Step 7: Frontend - Leaderboard UI

Update leaderboard display components to show Telegram-specific icons and links:
- Platform icon (Telegram logo instead of X logo)
- Post URL links to `t.me/...` instead of `x.com/...`
- Relevant components in `features/leaderboard-v3/components/`

## 6. Policy Decisions

### 6.1 roleMultiplier for Telegram

| Scenario | Handling |
|----------|----------|
| Channel operator posting | Admin enters channel subscriber count as followerCount |
| Group member posting | followerCount = 0 (default multiplier 1.0) |
| Unknown | Leave followerCount empty (default multiplier 1.0) |

Language scale applies identically (based on channel language).

### 6.2 Identity Linking

- Telegram accounts are **separate leaderboard entries** from Twitter accounts
- `(platform: 'telegram', username: 'nasun_io')` and `(platform: 'twitter', username: 'nasun_io')` are distinct
- Same person active on both platforms gets separate score aggregation
- Account merging can be added later if needed (not in scope for initial implementation)
- Existing `isTelegramMember` badge (channel membership verification) remains a separate feature

### 6.3 Telegram URL Types

| URL Format | Support | Notes |
|------------|---------|-------|
| `t.me/{channel}/{msgId}` | Yes | Primary format |
| `telegram.me/{channel}/{msgId}` | Yes | Normalize to t.me |
| `t.me/s/{channel}/{msgId}` | Yes | Preview URL, normalize to standard |
| `t.me/c/{chatId}/{msgId}` | Deferred | Private channel, chatId is numeric |

## 7. Verification Checklist

- [ ] URL Normalizer: various Telegram URL patterns normalize correctly
- [ ] URL Normalizer: duplicate detection works across URL variants
- [ ] Admin UI: Telegram URL input triggers correct username extraction
- [ ] Admin UI: account lookup works with platform='telegram'
- [ ] Admin UI: score preview displays correctly for Telegram posts
- [ ] API: `POST /v3/posts` accepts and processes Telegram URLs
- [ ] API: duplicate check prevents re-registration of same Telegram post
- [ ] Leaderboard: Telegram accounts appear in rankings with correct platform display
- [ ] CDK: `cdk diff` shows only expected changes before deploy

## 8. Future Considerations

- **Approach B migration**: If admin burden grows, add bot-assisted collection with pending queue
- **Account merging**: Link same person's Twitter + Telegram accounts for unified scoring
- **Telegram metrics**: Use Bot API to fetch channel post view counts as an additional signal
- **Discord integration**: Same URL extension pattern applies to Discord message URLs