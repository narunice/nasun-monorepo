# Pado Chat Server (Archived)

> **Status**: Archived 2026-04-13. Code removed from repo; recoverable via git history.
> **Current home**: `apps/nasun-website/chat-server/` — unified chat server hosting both nasun and pado.
> **Canonical README**: [apps/nasun-website/chat-server/README.md](../../nasun-website/chat-server/README.md)

## 개요

Pado 전용 chat-server(port 3100)는 2026-04-10부터 2026-04-13에 걸쳐 **nasun-chat-server(port 3101)로 통합**되었다. 본 문서는 이전 구조의 이력과 현 구조의 참조 포인트만 남긴다.

## 이관 이력

| 날짜 | 사건 | 커밋/핸드오프 |
|---|---|---|
| 2026-04-10 | pado frontend `VITE_CHAT_HTTP_URL`을 `nasun.io/chat`으로 전환 시작 (phase2a) | `.claude/handoffs/2026-04-10-unified-chat-phase2a.md` |
| 2026-04-11 | phase2b 완료, nginx/PM2 런타임 cutover | `.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md` |
| 2026-04-12 | Score API 추가(`/api/pado/leaderboard/score`), settle-pado 전환 | commits `85339be6` `6934164c` |
| 2026-04-13 | pado.finance nginx `/chat/` `/ws` → 410 hotfix, PM2 delete, 코드 archive | commit `f7b1c8f2` |

## 현 구조

**단일 서버**: `apps/nasun-website/chat-server/` (포트 3101, nasun + pado 공용)

**라우팅**:
- nasun.io: nginx `/chat/` → `127.0.0.1:3101`, `/ws/chat` → `127.0.0.1:3101`
- pado.finance: nginx `/chat/` `/ws` → **410 Gone** (브라우저/CDN이 canonical `nasun.io/chat` 사용 유도)
- pado frontend는 `VITE_CHAT_HTTP_URL=https://nasun.io/chat` / `VITE_CHAT_WS_URL=wss://nasun.io/ws/chat` 직접 호출

**API 접두사 규칙**:
- `/api/` — 공용 (chat, feed, leaderboard, trades, orders, competitions)
- `/api/pado/` — pado 전용 (현재는 Score API: `/api/pado/leaderboard/score`, `/api/pado/leaderboard/trader/:addr/score`)

## 향후 분리 기준 (apps/pado/data-server)

nasun-chat-server에서 pado 관련 부하가 다음 임계치를 넘으면 `apps/pado/data-server/`로 분리:

| 지표 | 임계치 |
|---|---|
| Write QPS | > 100 |
| leaderboard.db 크기 | > 10 GB |
| aggregator CPU peak | WS chat latency 영향 발생 |
| pado 전용 endpoint 수 | +5 이상 추가 |
| 타 앱이 자체 leaderboard/indexer 요구 | — |

자세한 baseline + 재평가 기준은 canonical README 참조.

## 과거 구조 (archive)

삭제 전 `apps/pado/chat-server/`의 구조와 기능은 git history로 복원 가능:
```
git log --follow apps/pado/chat-server/
git show f7b1c8f2^:apps/pado/chat-server/src/server.ts
```

주요 모듈(참고용):
- `server.ts` — WebSocket + REST, broadcastSystemMessage
- `store.ts` — SQLite chat DB
- `rooms.ts` — 룸 정의 (room 0 = global, per-pool)
- `auth.ts` — challenge-response wallet auth
- `indexer.ts` — DeepBook OrderFilled 폴링
- `aggregator.ts` — leaderboard 통계 집계
- `market-narrator.ts`, `price-tracker.ts`, `ai-chatbot.ts` — 알림/AI 봇
