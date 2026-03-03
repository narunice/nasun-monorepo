# Pado Chat Server

> Last Updated: 2026-03-03
> Location: `apps/pado/chat-server/`

WebSocket + HTTP server. Global Chat, Leaderboard Indexer, Competition API, Market Narrator integrated.

## Features

| Feature | Description |
|---------|-------------|
| Global Chat | WebSocket real-time chat, signature-based auth, nicknames, SQLite storage (90-day retention) |
| Leaderboard Indexer | DeepBook OrderFilled event polling -> SQLite aggregation, P&L tracking |
| Points System | Activity-based points: 10pt/trade, 5pt/1K volume, 25pt/unique pool, 100pt first-trade bonus |
| Trade API | Paginated trade history, FIFO cost basis calculation, order event tracking |
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

### Chat

| Endpoint | Description |
|----------|-------------|
| `GET /api/messages?roomId=&limit=&before=` | Chat message history |
| `GET /api/status` | Server status |

### Leaderboard

| Endpoint | Description |
|----------|-------------|
| `GET /api/leaderboard?period=24h\|7d\|30d\|all&mode=volume\|pnl&limit=` | Period-based rankings |
| `GET /api/leaderboard/trader/:address` | Individual trader stats |
| `GET /api/leaderboard/trader/:address/fills?pool=&limit=&cursor=` | Trader fill history |
| `GET /api/leaderboard/status` | Leaderboard indexer status |
| `GET /api/leaderboard/points?period=&limit=` | Points-based leaderboard |
| `GET /api/leaderboard/trader/:address/points` | Individual trader points |

### Trade API

| Endpoint | Description |
|----------|-------------|
| `GET /api/trades/:address?pool=&limit=&cursor=` | Paginated trade history |
| `GET /api/trades/:address/cost-basis?pool=&limit=&cursor=` | FIFO weighted average cost basis |
| `GET /api/orders/:address` | Order events + fill history |

### Competitions

| Endpoint | Description |
|----------|-------------|
| `GET /api/competitions?status=&limit=` | Competition list |
| `GET /api/competitions/:id` | Competition detail |
| `GET /api/competitions/:id/results?limit=` | Competition results + leaderboard |
| `POST /api/competitions` | Create competition (admin) |
| `PATCH /api/competitions/:id` | Update competition (admin) |
