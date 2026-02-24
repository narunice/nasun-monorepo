# Pado Chat Server

> Last Updated: 2026-02-23
> Location: `apps/pado/chat-server/`

WebSocket + HTTP server. Global Chat, Leaderboard Indexer, Competition API, Market Narrator integrated.

## Features

| Feature | Description |
|---------|-------------|
| Global Chat | WebSocket real-time chat, signature-based auth, nicknames, SQLite storage (90-day retention) |
| Leaderboard Indexer | DeepBook OrderFilled event polling -> SQLite aggregation, P&L tracking |
| Competition API | Admin CRUD, time-limited contests, Bearer token auth |
| Market Narrator | Hybrid bot (rule-based instant alerts + optional AI 2h summary) |
| Aggregator | Real-time market metrics (price tracking, volume calculation) |

## Market Narrator Bot

```
OrderFilled events (5s poll)
       |
  indexer.ts --onTradeFill()--> market-narrator.ts --broadcastSystemMessage()--> Chat
                                      |
                                 price-tracker.ts
                                 (EWMA baseline, volume window,
                                  consecutive trade detection)
```

| Alert Type | Trigger | Cooldown |
|------------|---------|----------|
| `price_move` | >= 3% from EWMA baseline | 5 min |
| `volume_spike` | 5min vol >= 3x previous | 10 min |
| `momentum` | 5+ consecutive same-direction | 3 min |

AI summary: When `ANTHROPIC_API_KEY` is set, 2h periodic Claude Haiku summary (~$0.04/day)

## Source Structure

```
chat-server/src/
├── server.ts              # WebSocket + REST server, broadcastSystemMessage()
├── store.ts               # SQLite chat DB (messages, nicknames)
├── rooms.ts               # Room definitions (room 0 = global, per-pool rooms)
├── auth.ts                # Challenge-response wallet auth
├── types.ts               # Config, message types
├── indexer.ts             # DeepBook OrderFilled event polling
├── aggregator.ts          # Leaderboard statistics aggregation
├── leaderboard-store.ts   # SQLite leaderboard DB
├── leaderboard-types.ts   # Types (TradeFillData included)
├── price-tracker.ts       # Per-pool state tracking + alerts (EWMA, volume window)
├── market-narrator.ts     # Bot orchestrator (rule-based + AI)
└── ai-chatbot.ts          # Claude Haiku AI integration (optional, ~$0.04/day)
```

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/leaderboard?period=24h\|7d\|30d\|all&mode=volume\|pnl` | Period-based rankings |
| `GET /api/leaderboard/trader/:address` | Individual trader stats |
| `GET /api/leaderboard/trader/:address/fills` | Trader fill history |
| `GET /api/competitions` | Competition list |
| `GET /api/competitions/:id` | Competition detail |
| `POST /api/competitions` | Create competition (admin) |
| `PUT /api/competitions/:id` | Update competition (admin) |
