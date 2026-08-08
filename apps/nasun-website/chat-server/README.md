# nasun-chat-server

> **Role**: Unified chat + data server for **nasun + pado** (since 2026-04-13).
> Hosts chat (WebSocket + REST), pado DEX leaderboard/indexer/aggregator,
> market-narrator, trade/order APIs, competition API, and ecosystem-adjacent feeds.
> Pado-specific logic will migrate to `apps/pado/data-server/` when trigger
> conditions below are met. Route convention: pado-specific = `/api/pado/*`,
> future apps = `/api/{app}/*`. Rename/URL transitions use additive-first
> (keep → add → cutover → remove).
>
> See `.claude/handoffs/2026-04-12-chat-server-role-clarification.md`.

## 구조와 역할

### Deployment

| 환경 | 주소 | 포트 | PM2 이름 |
|---|---|---|---|
| Prod | `__PROD_EC2_HOST__` (ec2-user) | 3101 | `nasun-chat-server` |
| Staging | `__STAGING_EC2_HOST__` (ubuntu) | 3101 | `nasun-chat-server` |

**Ingress**:
- `nasun.io`: nginx `/chat/` → `127.0.0.1:3101`, `/ws/chat` → `127.0.0.1:3101`
- `pado.finance`: nginx `/chat/` `/ws` → **410 Gone** (canonical Link → `nasun.io/chat`)
- Pado frontend는 `VITE_CHAT_HTTP_URL=https://nasun.io/chat` 로 직접 호출

**Entry point**: `src/server.ts`. PM2 ecosystem 파일로 기동, `.env`는 EC2 로컬.

### 책임 (Responsibilities)

| 영역 | 서브시스템 | 파일 |
|---|---|---|
| Chat | WebSocket 실시간 메시지, 룸, 닉네임, 반응, 팔로우 | `server.ts`, `store.ts`, `rooms.ts`, `auth.ts` |
| Indexer | DeepBook `OrderFilled` RPC 폴링 → SQLite 적재 | `indexer.ts` |
| Aggregator | trade fills → per-trader stats/PnL/score 집계 | `aggregator.ts` |
| Leaderboard | Score API (`/api/pado/leaderboard/*`), 트레이더 통계/fills | `leaderboard-api.ts`, `leaderboard-store.ts` |
| Trade/Order API | FIFO cost-basis, 주문 이벤트, 트레이드 히스토리 | `trade-api.ts` (내부), `store.ts` |
| Competitions | 관리자 CRUD, 기간제 리더보드 | `leaderboard-api.ts` |
| Market Narrator | 룰 기반 가격/볼륨/모멘텀 알림 + (선택) AI 2h 요약 | `market-narrator.ts`, `price-tracker.ts`, `ai-chatbot.ts` |
| Social Feed | 팔로잉 활동 피드 | `leaderboard-api.ts` |
| News Feed | RSS + X(트윗) 집계, audience별 분리 | `news-feed-api.ts` |

### News Feed / X API 자격증명

`GET /news-feed?audience=uju|pado&limit=` (`api.nasun.io/news-feed`). 소비처는
nasun.io Nasun AI 대시보드의 `UjuFeedCarousel`, pado.finance Prediction 히어로의
`PadoFeedCarousel` 두 곳이고, **둘 다 `audience=uju`로 호출**한다.

⚠️ `audience=uju`에는 **RSS 폴백이 없다** (`news-feed-api.ts`의
`if (audience !== 'uju')`). 트윗이 유일한 소스이므로 X API가 죽으면 두 캐러셀이
그대로 "No feed available"이 된다. `audience=pado`만 RSS가 섞인다.

인증은 OAuth 2.0 **App-Only Bearer** (`X_API_BEARER_TOKEN`), box의
`apps/nasun-website/chat-server/.env`에 있고 부팅 시 `env.ts`가 주입한다.
`env.ts`는 **기동 때 1회만** 읽으므로 값을 바꾸면 `pm2 restart nasun-chat-server`
없이는 반영되지 않는다.

> 리더보드/팔로워 수집이 쓰는 `nasun-twitter-tokens*`(OAuth user-context)와는
> **다른 X 앱**이다. 혼동 금지. 개발자 계정·앱 ID 등 좌표는 public repo에 두지
> 않는다 (nasun-ops `docs/x-api-app.md` 참조).

**2026-05-27 사고**: 포털에서 Bearer Token을 재발급하면 이전 토큰이 즉시
무효화되는데 Secrets Manager/`.env`에 반영되지 않아, 2026-05-27부터 2026-08-08까지
약 10주간 두 캐러셀이 빈 채로 방치됐다. `fetchTweets`가 에러를 삼키고 빈 배열을
반환하므로 크래시도 사용자 에러도 없고, 로그의 401만 남는다. 이후
`nasun-news-feed-watchdog` 타이머(1h)가 `sources.twitter`를 감시해 24시간 지속 시
Telegram으로 알린다 (`nasun-ops/scripts/box-news-feed-watchdog.sh`).

**과금**: X는 2026-05-21 레거시 Basic을 폐기하고 2026-06-01 이후 Pay-Per-Use로
자동 이관했다. **반환된 포스트 1건당 $0.005** (요청당이 아님). 12h TTL 기준
하루 2회 × 최대 50건 → 월 약 3,000건 ≈ **$15**. `TWEET_MONTHLY_LIMIT`이 상한을
건다.

### Public API 표면

**공용** (unprefixed, `/api/`):
- `GET /api/messages?roomId=&limit=&before=` — 채팅 히스토리
- `GET /api/status` — 서버 상태
- `GET /api/leaderboard?period=&mode=&limit=` — DEX 거래 리더보드 (volume/PnL)
- `GET /api/leaderboard/trader/:addr` / `:addr/fills` — 트레이더 상세
- `GET /api/leaderboard/status` — 인덱서 상태
- `GET /api/leaderboard/snapshots` / `/dates` / `POST /generate` — 스냅샷
- `GET /api/trades/:addr` / `:addr/cost-basis` — 트레이드/원가
- `GET /api/orders/:addr` — 주문 이벤트
- `GET /api/competitions` / `:id` / `:id/results` — 대회 (관리자 POST/PATCH)
- `GET /api/feed` — 팔로잉 피드
- `GET /news-feed?audience=&limit=` — RSS + X 뉴스 (prefix 없음, 위 섹션 참조)

**Pado 전용** (`/api/pado/`):
- `GET /api/pado/leaderboard/score?scope=alltime&limit=&offset=` — pado DEX 트레이딩 스코어 리더보드
- `GET /api/pado/leaderboard/trader/:addr/score` — 개별 트레이더 스코어

**WebSocket**: `wss://nasun.io/ws/chat` (pado는 `VITE_CHAT_WS_URL` 동일 사용)

### Data Stores

로컬 SQLite 2개 파일 (EC2 `~/nasun-chat-server/data/`, 이 경로는 rsync 제외):

| 파일 | 주요 테이블 | 역할 |
|---|---|---|
| `chat.db` | `messages`, `users`, `reactions`, `follows`, `nasun_profiles` | 채팅/소셜 |
| `leaderboard.db` | `trade_fills`, `trader_stats`, `trader_pnl`, `trader_points`*, `points_snapshots`*, `trader_scores`, `score_snapshots`, `order_events`, `competitions`, `competition_results`, `indexer_state`, `balance_managers` | 파도 DEX 지표 |

\* `trader_points` / `points_snapshots`: historical 이름, 실제 값은 **DEX 거래 스코어**. rename(`pado_trader_scores`, `pado_score_snapshots`)은 Q3 follow-up (SQLite `ALTER TABLE`은 O(1)).

## Baseline (2026-04-12, pre-archive)

Prod(__PROD_EC2_HOST__)에서 PR#1 A-0 측정:

| 지표 | 값 |
|---|---|
| trader_points rows | 500 |
| leaderboard.db 크기 | 2.5 GB |
| PM2 restarts (cumulative) | 17 |
| Write QPS | TBD (CloudWatch custom metric 예정) |
| Aggregator CPU peak | TBD |

## Re-evaluation Triggers (→ apps/pado/data-server 분리)

아래 중 하나 이상 충족 시 pado 전용 data-server로 분리 검토:

- 타 앱이 자체 leaderboard/indexer 요구 (옵션 C/D 활성화)
- Write QPS > 100
- `leaderboard.db` > 10 GB
- Aggregator CPU spike가 WS chat latency에 영향
- pado 전용 endpoint가 현재 +5 이상 추가됨 (`apps/pado/data-server/` 스탠드업 신호)

Observability CloudWatch 대시보드: **TBD** (`.claude/plans/enumerated-conjuring-quokka.md` Follow-up 참조). 위 표는 대시보드 live 시 링크로 대체.

## 향후 계획 (apps/pado/data-server)

현재 `apps/pado/data-server/`는 존재하지 않음. 트리거 충족 시 다음 순서로 분리:

1. 새 워크스페이스 패키지 생성 (`apps/pado/data-server/` + `package.json`)
2. pado 전용 모듈(indexer, aggregator, leaderboard-api pado 경로, trade-api pado 경로, market-narrator) 이관
3. nasun-chat-server에서 pado 의존 제거, 공용 레이어만 유지
4. 배포 파이프라인/PM2 엔트리 추가
5. nginx `/api/pado/*` → pado-data-server 포트로 라우팅
6. Additive-first: 기존 경로 유지 → 새 포트로 추가 → 프런트 cutover → 구 핸들러 삭제

## 배포

```bash
# 로컬 build
cd apps/nasun-website/chat-server && npx tsc

# Staging
rsync -avz --delete \
  --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' \
  -e "ssh -i ~/.ssh/<your-staging-key>.pem" \
  apps/nasun-website/chat-server/ \
  ubuntu@__STAGING_EC2_HOST__:~/nasun-chat-server/
ssh -i ~/.ssh/<your-staging-key>.pem ubuntu@__STAGING_EC2_HOST__ \
  "pm2 restart nasun-chat-server --update-env"

# Prod (동일 패턴, 프로파일만 교체)
rsync -avz --delete \
  --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' \
  -e "ssh -i ~/.ssh/<your-prod-key>" \
  apps/nasun-website/chat-server/ \
  ec2-user@__PROD_EC2_HOST__:~/nasun-chat-server/
ssh -i ~/.ssh/<your-prod-key> ec2-user@__PROD_EC2_HOST__ \
  "pm2 restart nasun-chat-server --update-env"
```

EC2는 node_modules/빌드 산출물 미생성 — 로컬 `dist/`가 rsync에 포함되어 그대로 실행.

## 관련 문서

- [Pado chat-server archive 이력](../../pado/docs/chat-server.md)
- [Root CLAUDE.md — Chat Server 규약](../../../CLAUDE.md)
- `.claude/handoffs/2026-04-12-chat-server-role-clarification.md` — 역할 결정 근거
- `.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md` — 통합 완료 이력
