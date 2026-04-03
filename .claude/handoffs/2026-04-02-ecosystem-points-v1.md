# Handoff: Ecosystem Points V1 구현

**생성**: 2026-04-02 23:30
**브랜치**: main
**이전 핸드오프**: [2026-03-31-ecosystem-points-snapshot.md](2026-03-31-ecosystem-points-snapshot.md)

## 현재 상태 요약

Ecosystem Points V1 구현 계획을 수립하고 Phase 1 구현을 시작했다. 1-1(PointsCard 제거), 1-2(Multiplier 재설계), 1-4 일부(프론트엔드 realtime 제거 + daily-mission 비활성화)가 완료되었다. 미커밋 상태이며, 1-3(per-user sync), 1-4 나머지(wallet-transfer Scanner 감지), Phase 2(스테이킹, numbermatch)가 남았다.

## 완료된 작업

- [x] Ecosystem Points 시스템 전체 코드베이스 분석 (백엔드, 프론트엔드, Lambda, 3개 에이전트 병렬 탐색)
- [x] Gemini 분석과 독립 교차 검증, 8개 파편화 지점 식별
- [x] V1 구현 계획 수립 (6 Phase, 14 items), 3차 리뷰 거쳐 최종 확정
- [x] 계획 문서 저장: `apps/nasun-website/docs/ECOSYSTEM_POINTS_V1_PLAN.md`
- [x] 롤백 포인트 확보 (ac907ed2 커밋)
- [x] **1-1. 단일 점수 체계**: MyAccountPage에서 PointsCard import/렌더링 제거, order 재정렬
- [x] **1-2. Multiplier 재설계**: `calculateMultiplier()` additive -> hybrid (max base + battalion stack)
  - Alliance=1x, Genesis=2x, Battalion=5x/unit, cap 20x
  - BONUS_CONFIG 제거 (dead code)
  - ACTIVATIONS_CACHE_REFRESH_MS 12시간으로 변경
- [x] **1-4 (부분)**: ProfileHeroCard에서 realtimeMultiplier, realtimeBaseScore, Math.max 보정 로직 제거
- [x] **1-4 (부분)**: Scanner에서 calculateDailyMissions() 호출 비활성화 (주석 처리)
- [x] TypeScript 타입 체크 통과 확인

## 미완료 작업 (다음 세션)

- [ ] **1-3. Multiplier 단일 경로 + 개별 Sync**
  - POST /ecosystem/sync/:identityId 엔드포인트 (explorer-api)
  - admin-api Lambda에 단일 사용자 활성화 조회 엔드포인트 추가
  - ecosystem-cache.ts에 updateActivationsForUser() 함수
  - 프론트엔드 Refresh 버튼 + activate 후 sync 호출
- [ ] **1-4 (나머지). wallet-transfer Scanner 감지**
  - daily-nft-check.ts에 suix_queryTransactionBlocks RPC 감지 함수 추가
  - Score API 폴링 1분으로 단축 + 캐시 TTL 맞춤
- [ ] **2-1. 스테이킹 일일 점수**
  - daily-nft-check.ts에 awardStakingDailyPoints() 추가
  - suix_getStakes RPC, flat 1pt/day
- [ ] **2-2. numbermatch 이벤트 매핑**
  - points.ts EVENT_MAP에 numbermatch 컨트랙트 이벤트 추가
- [ ] **3-1. Bonus Points 인프라** (matview 재생성, Score API bonus 합산)
- [ ] Phase 3-6 나머지 (Pado 연동, Games USDC, 에어드롭, Early Bird, Snapshot, 리더보드)
- [ ] 미커밋 변경사항 커밋 + 푸시

## 중요 컨텍스트

### 확정된 설계 결정

- **공식**: `Ecosystem Points = (Base Score x Multiplier) + Bonus Points`
- **Multiplier**: max(Alliance 1x, Genesis 2x) + Battalion(5x * count), cap 20x. NFT 없으면 0x.
- **NFT 캐시**: 12시간 전체 갱신 + per-user sync(자동+수동). Lambda 콜백 불필요, 프론트엔드에서 sync 호출.
- **Bonus Points**: activity_points 테이블 재사용 (ecosystem-bonus-* 카테고리). 별도 테이블 불필요.
- **matview 재생성 필요**: NOT IN 리스트 -> NOT LIKE 'ecosystem-bonus-%' 패턴으로 변경 (DROP+CREATE)
- **daily-mission 보너스**: 비활성화. base_score가 이미 카테고리 다양성 보상.
- **wallet-transfer**: RPC suix_queryTransactionBlocks로 감지 (daily-nft-check 패턴)
- **스테이킹**: flat 1pt/day (데브넷). 메인넷에서 log2 전환.
- **Pado 리더보드 풀**: 주간 50K + 월간 100K. Top 100(40%) + 101-1000(60%) 차등 분배.
- **Games USDC**: 1:1 환산, rolling 7일 600pt 캡.
- **Early Bird**: (active_days * 10) + min(tx_count, 500). multiplier 미적용.
- **에어드롭**: 200,000 Ecosystem Points. 인당 100pt (Genesis 200pt).

### 주의사항

- **staking-daily 카테고리**: matview에서 제외하지 않음 (base_score 포함). 단, daily-nft-check EXCLUDED_CATEGORIES에 추가 필요 (alliance penalty 회피 방지).
- **리더보드 CTE**: multiplier는 메모리에만 있으므로 SQL에서 적용 불가. SQL로 base+bonus 합산, JS에서 multiplier 적용 후 재정렬 (현행 패턴 유지).
- **Pado chat-server points API**: limit 캡 100 -> 1000 상향 필요. 시간 필터 없음, delta는 스냅샷으로 계산.
- **sync 엔드포인트**: explorer-api에 DynamoDB 접근 없음. admin-api Lambda에 단일 사용자 조회 엔드포인트 추가 후 HTTP 호출.
- **현재 퍼블릭 상태**: Pado Games만 공개. Spot DEX 비공개. Alliance 보유자 일일 최대 ~5-6 ecosystem pts.

### 핵심 파일

| 파일 | 역할 | 상태 |
|------|------|------|
| `api-server/src/config/ecosystem.ts` | V1 multiplier 공식 | 수정 완료 |
| `api-server/src/scanner/points-scanner.ts` | daily-mission 비활성화 | 수정 완료 |
| `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` | realtime 제거 | 수정 완료 |
| `nasun-website/frontend/src/pages/MyAccountPage.tsx` | PointsCard 제거 | 수정 완료 |
| `api-server/src/scanner/ecosystem-cache.ts` | per-user sync 추가 예정 | 미수정 |
| `api-server/src/routes/ecosystem.ts` | sync 엔드포인트 + bonus 합산 | 미수정 |
| `api-server/src/scanner/daily-nft-check.ts` | wallet-transfer + staking 추가 예정 | 미수정 |
| `api-server/src/config/points.ts` | staking-daily, numbermatch 추가 예정 | 미수정 |
| `api-server/src/db/ecosystem-schema.sql` | matview NOT LIKE 패턴 재생성 | 미수정 |
| `apps/nasun-website/docs/ECOSYSTEM_POINTS_V1_PLAN.md` | 전체 계획 문서 | 커밋 완료 |

## 최근 변경 파일 (미커밋)

- `apps/network-explorer/api-server/src/config/ecosystem.ts` - Multiplier V1 재설계
- `apps/network-explorer/api-server/src/scanner/points-scanner.ts` - daily-mission 비활성화
- `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` - realtime 로직 제거
- `apps/nasun-website/frontend/src/pages/MyAccountPage.tsx` - PointsCard 제거

(참고: 다른 세션에서 작업한 airdrop admin 관련 파일도 미커밋 상태)

## 즉시 다음 단계

1. 미커밋 Ecosystem Points 변경사항 커밋 (airdrop admin 변경과 분리)
2. **1-3 구현**: ecosystem-cache.ts에 updateActivationsForUser(), routes/ecosystem.ts에 sync 엔드포인트, admin-api Lambda에 단일 사용자 조회
3. **1-4 나머지**: daily-nft-check.ts에 wallet-transfer RPC 감지 추가
4. **2-1**: daily-nft-check.ts에 스테이킹 일일 점수 추가
5. **2-2**: points.ts에 numbermatch EVENT_MAP 추가
6. Phase 1-2 완료 후 배포 (Explorer API rsync + PM2 restart, 프론트엔드 빌드 + rsync)
