# Handoff: Pado Score Leaderboard - Nasun Website 구현 완료

**생성**: 2026-04-18
**브랜치**: main
**이전 핸드오프**: 2026-04-17-pado-weekly-leaderboard-settlement.md

## 현재 상태 요약

Nasun 웹사이트에 `/dev/pado-score-leaderboard` 페이지를 새로 구현하고 push 완료했다. Pado 앱의 LeaderboardPage도 동일하게 12h grace period 로직으로 수정됐다. 미커밋 잔여 파일(AuthProvider.tsx, network-explorer 3개)은 별개 작업이며 다음 세션에서 처리 예정.

## 완료된 작업

- [x] `VITE_NASUN_CHAT_HTTP_URL` env var 추가 (.env.development/staging/production)
- [x] CSP에 `http://localhost:3101` 추가 (.env.development)
- [x] `usePadoScoreLeaderboard.ts` 신규 (nasun-website)
- [x] `PadoScoreLeaderboard.tsx` 신규 (nasun-website)
- [x] `PadoScoreLeaderboardPage.tsx` 신규 (nasun-website)
- [x] AppRoutes.tsx에 `/dev/pado-score-leaderboard` 라우트 추가
- [x] Pado LeaderboardPage.tsx: `isWeekEmpty` -> `isNewWeek` (12h grace period + traders.length === 0 폴백)
- [x] 포인트 지급 안내 섹션 추가 (1위=50pts ... Top500=1pt, GP 2x)
- [x] 프로덕션 chat-server 정상 작동 확인 (`https://nasun.io/chat/api/pado/leaderboard/score/weekly/2026-W16`)
- [x] 2개 커밋 push (`5493e7c8`, `4af0500e`)

## 미완료 작업

- [ ] **Twitter secondary identity 정리** (별도 세션): `AuthProvider.tsx` line 240 수정, DynamoDB 8,727개 삭제 등 - 핸드오프: `2026-04-18-twitter-secondary-identity-cleanup.md` 참조
- [ ] **network-explorer 변경사항 커밋**: `ecosystem-schema.sql`, `ecosystem.ts`, `daily-nft-check.ts` (alliance penalty grace period 수정)
- [ ] **pado frontend 스테이징 배포**: LeaderboardPage.tsx 변경사항
- [ ] **nasun-website 스테이징 배포**: 새 pado-score-leaderboard 페이지

## 중요 컨텍스트

### 12h Grace Period 로직

주간 리셋(월요일 00:10 UTC) 후 12h 동안:
- 상단: "Week just started" 메시지
- 하단: 이전 주 최종 스냅샷 표시

12h 경과 후: 현재 주 실시간 스코어 표시

`weekStart` 없거나 0이면 `traders.length === 0` 폴백이 커버.

```ts
const isNewWeek = weekStart && (Date.now() - weekStart) < 12 * 60 * 60 * 1000
  || traders.length === 0
```

### 환경변수 (env 파일은 gitignored)

nasun-website `.env.*` 파일에 직접 추가해야 함 (서버 배포 시 별도 적용):
- `VITE_NASUN_CHAT_HTTP_URL=http://localhost:3101` (dev)
- `VITE_NASUN_CHAT_HTTP_URL=https://staging.nasun.io/chat` (staging)
- `VITE_NASUN_CHAT_HTTP_URL=https://nasun.io/chat` (prod)

nginx: `/chat/` -> `http://127.0.0.1:3101/` 프록시 이미 설정됨.

### 포인트 지급 구간

1위=50, 2위=40, 3위=30, 4-50위=15, 51-100위=10, 101-200위=6, 201-300위=5, 301-400위=2, 401-500위=1. Genesis Pass 2x.

### 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/frontend/src/features/pado-score-leaderboard/usePadoScoreLeaderboard.ts` | 데이터 훅 + 타입 |
| `apps/nasun-website/frontend/src/features/pado-score-leaderboard/PadoScoreLeaderboard.tsx` | 테이블 UI |
| `apps/nasun-website/frontend/src/pages/dev/PadoScoreLeaderboardPage.tsx` | 페이지 |
| `apps/pado/frontend/src/pages/LeaderboardPage.tsx` | grace period 로직 수정됨 |

## 최근 변경 파일

```
pushed:
  apps/nasun-website/frontend/src/features/pado-score-leaderboard/ (신규)
  apps/nasun-website/frontend/src/pages/dev/PadoScoreLeaderboardPage.tsx (신규)
  apps/nasun-website/frontend/src/routes/AppRoutes.tsx
  apps/pado/frontend/src/pages/LeaderboardPage.tsx

미커밋 (별도 작업):
  apps/nasun-website/frontend/src/features/auth/providers/AuthProvider.tsx
  apps/network-explorer/api-server/src/db/ecosystem-schema.sql
  apps/network-explorer/api-server/src/routes/ecosystem.ts
  apps/network-explorer/api-server/src/scanner/daily-nft-check.ts
```

## 즉시 다음 단계

1. **스테이징 배포** (pado frontend + nasun-website):
   - pado frontend: `rsync` 또는 staging 빌드
   - nasun-website: `pnpm --filter @nasun/nasun-website exec -- vite build --mode development` 후 rsync
   - VITE_NASUN_CHAT_HTTP_URL이 staging .env에 적용됐는지 확인

2. **Twitter secondary identity 정리** 이어서: `2026-04-18-twitter-secondary-identity-cleanup.md` 로드
