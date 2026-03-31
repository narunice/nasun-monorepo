# Handoff: Ecosystem Points Daily Snapshot 구현

**생성**: 2026-03-31 23:30
**브랜치**: main
**이전 핸드오프**: [2026-03-28-my-account-gamification.md](2026-03-28-my-account-gamification.md)

## 현재 상태 요약

Ecosystem Points 시스템의 배율 재설계, Daily Missions 체크리스트 (RPC 직접 조회), Health Status 도넛 차트, Alliance/Genesis Pass NFT UX 개선을 완료했다. 다음 단계는 **토큰 할당 근거가 될 daily ecosystem score snapshot**을 구현하는 것이다. 현재 ecosystem score는 materialized view 기반 실시간 집계만 하고 있어서, devnet 리셋이나 multiplier 공식 변경 시 과거 점수 복원이 불가능하다.

## 완료된 작업

- [x] Ecosystem multiplier 재설계: Alliance +0x, Genesis +0.1x, Battalion +1.0x/unit (가격 비례)
- [x] NFT 미보유 사용자 multiplier=0 (disabled state), 아무 NFT 보유 시 활성화
- [x] Score API에 disabled 플래그, leaderboard에서 disabled 사용자 제외
- [x] Daily Missions 체크리스트: RPC 직접 조회 (queryEvents + queryTransactionBlocks)
- [x] ClaimAllButton persistent + onSuccess props, SendTransaction transfer-success 이벤트
- [x] Health Status 도넛 차트 (HealthStatusBar.tsx)
- [x] Ecosystem Points UI 리디자인 (All time 중앙 배치, gradient 숫자)
- [x] Alliance NFT: 스켈레턴 placeholder, 캐릭터 이름 오버레이, explorer link 수정
- [x] Genesis Pass: Join Allowlist 그라디언트 버튼, placeholder 텍스트
- [x] 지갑 생성/가져오기 시 Cognito 세션 자동 정리 (WALLET_IDENTITY_CHANGED_EVENT)
- [x] Alliance status API cache: no-cache 적용
- [x] 로그인 후 /dev/my-account 리디렉트
- [x] Scanner 주기: 5분 -> 1분, 지갑 캐시 갱신: 3시간 -> 10분
- [x] Wave1 Mint Now 버튼 비활성화

## 미완료 작업 (다음 세션)

- [ ] **Daily Ecosystem Score Snapshot 구현** (핵심)
  - 매일 UTC 자정에 모든 사용자의 ecosystem score를 별도 테이블에 확정 기록
  - 토큰 할당 근거 데이터이므로 절대 유실 불가
  - devnet 리셋, multiplier 변경과 무관하게 과거 스냅샷 보존
- [ ] 커밋 및 프로덕션 배포 (미커밋 변경사항 있음)
- [ ] Explorer API PM2 재시작 (SCAN_INTERVAL_MS 1분 반영)

## 중요 컨텍스트

### 결정사항

- **배율 체계**: Alliance +0x (entry only), Genesis +0.1x, Battalion +1.0x/unit (G=0.1x 기준, 가격 비례)
- **NFT gating**: 아무 NFT 없으면 multiplier=0, 아무거나 1개라도 있으면 base 1.0x + bonuses
- **Daily Missions 감지**: Scanner 파이프라인 대신 Sui RPC 직접 조회 (queryEvents({Sender}) + queryTransactionBlocks({FromAddress}))
- **Scanner는 포인트 적립 전용** (뒷단): RPC가 체크리스트 UI, Scanner가 포인트 적립/리더보드
- **wallet-transfer**: Scanner에 감지 로직 없음 (이벤트 미발생). 프론트엔드에서만 TransferObjects 커맨드로 감지

### 주의사항

- `activity_points` 테이블이 원본 데이터, `ecosystem_daily_scores`는 마뷰 (재생성 가능)
- devnet 리셋 시 indexer DB 초기화 -> scanner가 과거 이벤트 재처리 못함
- multiplier 공식 변경 시 과거 시점 점수 복원 불가 (현재는 실시간 계산)
- **스냅샷 테이블은 한번 기록되면 수정/삭제 불가해야 함** (사용자 피드백: 기존 스냅샷 수정 금지)

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `apps/network-explorer/api-server/src/config/ecosystem.ts` | Multiplier config + calculateMultiplier |
| `apps/network-explorer/api-server/src/config/points.ts` | Scanner params, EVENT_MAP, BASE_POINTS |
| `apps/network-explorer/api-server/src/routes/ecosystem.ts` | Score/leaderboard API |
| `apps/network-explorer/api-server/src/scanner/points-scanner.ts` | Main scanner loop |
| `apps/network-explorer/api-server/src/scanner/daily-mission.ts` | Daily mission bonus |
| `apps/network-explorer/api-server/src/scanner/daily-nft-check.ts` | Alliance penalty + Genesis passive |
| `apps/network-explorer/api-server/src/db/ecosystem-schema.sql` | Matview + penalty table DDL |
| `apps/nasun-website/frontend/src/hooks/useDailyMissions.ts` | RPC 직접 조회 훅 |
| `apps/nasun-website/frontend/src/sections/myAccount/DailyMissionsCard.tsx` | 체크리스트 UI |
| `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` | Ecosystem Points hero UI |
| `apps/nasun-website/frontend/src/sections/myAccount/HealthStatusBar.tsx` | Health donut chart |

## 최근 변경 파일 (미커밋)

- `apps/nasun-website/frontend/src/sections/myAccount/DailyMissionsCard.tsx` - Coming Soon 태그, Pado 미션 주석 해제
- `apps/nasun-website/frontend/src/sections/myAccount/HealthStatusBar.tsx` - 도넛 차트 + 헤더 + 설명 텍스트
- `apps/nasun-website/frontend/src/sections/myAccount/NftShowcaseCard.tsx` - Genesis Pass 버튼 개선
- `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` - Ecosystem Points UI 리디자인

## 즉시 다음 단계

1. 미커밋 변경사항 커밋 + 푸시
2. Daily Ecosystem Score Snapshot 설계:
   - PostgreSQL 테이블: `ecosystem_daily_snapshots (snapshot_date, identity_id, base_score, multiplier, ecosystem_score, metadata)`
   - 저장 트리거: Scanner loop 내에서 UTC 날짜 변경 감지 시 전날 스냅샷 생성
   - 또는: 별도 cron job (EventBridge + Lambda, 또는 scanner 내 daily task)
   - 백필: 기존 `activity_points` 데이터에서 과거 스냅샷 생성 (1회성)
3. Explorer API PM2 재시작 (SCAN_INTERVAL_MS 1분 반영)
