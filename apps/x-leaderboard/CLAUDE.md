# CLAUDE.md (x-leaderboard)

## Overview

Legacy X (Twitter) Leaderboard V2 system extracted from `apps/nasun-website/`.
Tracks engagement metrics for the @Nasun_io X account and generates periodic leaderboards.

- **Package**: `@nasun/x-leaderboard` (frontend), `@nasun/x-leaderboard-cdk` (backend)
- **Status**: Legacy (extracted, not actively developed)
- **Region**: ap-northeast-2

## Architecture

```
frontend/          Vite React SPA (read-only leaderboard UI)
cdk/               AWS CDK infrastructure
  bin/cdk.ts       Stack entry point (XLeaderboardStack)
  lib/             Stack definition (1388 lines)
  lambda-src/      Lambda handlers + services
docs/              Design docs, scoring specs, implementation history
```

## Frontend

Single-page leaderboard viewer with cumulative scoring, rank history, and user search.

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Leaderboard | Main leaderboard view |
| `/leaderboard` | Leaderboard | Alias |

**Key dependencies**: React 19, TanStack Query, Recharts, Chart.js, i18next, react-router-dom

**Dev server**: `pnpm dev` (port configured in vite.config.ts)

### Environment Variables (Frontend)

| Variable | Description |
|----------|-------------|
| `VITE_API_ENDPOINT` | API Gateway base URL |
| `VITE_X_LEADERBOARD_V2_API_ENDPOINT` | Leaderboard API endpoint |
| `VITE_X_LEADERBOARD_API_KEY` | API key (read-only) |
| `VITE_TARGET_TWEET_ACCOUNT` | Target X account (Nasun_io) |

## Backend (CDK)

### Infrastructure

| Resource | Type | Description |
|----------|------|-------------|
| `nasun-leaderboard-data` | DynamoDB (existing ref) | Main data table |
| `UserIdentityMap` | DynamoDB (existing ref) | User identity mapping |
| API Gateway | REST API + API Key | Read-only leaderboard API (cache: 1.6GB) |
| Step Functions | State Machine | 6-phase data collection pipeline |
| EventBridge | Scheduled Rule | Daily collection trigger |
| SNS/SQS | Dead Letter Queue | Error handling |

### Lambda Handlers

**API (10 handlers)**: get-leaderboard-snapshot, get-cumulative-leaderboard, get-user-rank, get-user-rank-history, get-rank-changes, get-top-climbers, get-autocomplete, search-users, get-leaderboard-config, excluded-accounts-status

**Batch (15 handlers)**: get-target-tweets, collect-likes, collect-retweets, collect-quotes, collect-mentions, collect-mentions-search, collect-mention-details, collect-high-engagement-replies, tweet-batch-splitter, community-classifier-batch, cumulative-score-calculator, cumulative-leaderboard-generator, aggregate-results, profile-enhancement-scheduler, handle-failure

**Monitoring (3)**: anomaly-detection, dashboard-setup, data-quality-dashboard

**System (2)**: refresh-oauth2-token, sync-community-members

### Environment Variables (CDK)

Required in `.env.development` / `.env.production`:
- Twitter API credentials (BEARER_TOKEN, API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET)
- OAuth2 credentials (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
- Target account config (TARGET_USERNAME, TARGET_USER_ID)
- Event periods (EVENT1-5 START/END dates)
- Scoring weights (LIKE_WEIGHT, RETWEET_WEIGHT, QUOTE_WEIGHT, etc.)
- Admin/excluded account lists

## Commands

```bash
# Frontend
cd frontend && pnpm dev          # Dev server
cd frontend && pnpm build        # Production build

# CDK
cd cdk && pnpm build:all         # Build lambdas + CDK
cd cdk && pnpm synth             # Synthesize CloudFormation
cd cdk && pnpm deploy:dev        # Deploy to dev
cd cdk && pnpm deploy:prod       # Deploy to production
```

## Data Flow

1. **EventBridge** triggers Step Functions daily
2. **get-target-tweets** fetches recent tweets from @Nasun_io
3. **tweet-batch-splitter** distributes work
4. **collect-{likes,retweets,quotes,mentions}** gather engagement data
5. **cumulative-score-calculator** computes weighted scores
6. **aggregate-results** finalizes and stores in DynamoDB
7. **API Gateway** serves cached read-only data to frontend

## Key Documentation

| File | Content |
|------|---------|
| `docs/LEADERBOARD_SCORING-METRICS_v2.3.md` | Scoring formula and weights |
| `docs/LEADERBOARD_MECHANISM_GUIDE.md` | System architecture |
| `docs/LEADERBOARD_DATA_COLLECTION_AND_SCORING_COMPREHENSIVE.md` | Full pipeline docs |
| `docs/leaderboard-v2-design-analysis.md` | Design decisions |
