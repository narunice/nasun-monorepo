# Handoff: Ecosystem Points Ledger Refactor (Phase 1-3 shipped, Phase 4 pending)

**생성**: 2026-04-13 20:20 KST
**브랜치**: main
**이전 핸드오프**: [2026-04-13-matview-refresh-advisory-lock-bug.md](2026-04-13-matview-refresh-advisory-lock-bug.md) (prerequisite — matview refresh 안정화 완료)

## 현재 상태 요약

Ecosystem Points All Time 계산을 LIVE-SUM 재구성에서 **누적 원장(ledger)** 모델로 전환 중. Phase 1(스키마)·Phase 2(bootstrap anchor)·Phase 3(daily-snapshot cumulative 증분) 모두 prod 배포 완료. API 읽기 경로는 여전히 LIVE(Phase 4 미배포). 커밋 `59cee070`로 푸시됨.

사용자 체감 변화 0 — DB에만 새 컬럼이 채워지는 상태.

## 완료된 작업

- [x] **플랜 v3 작성**: `/home/naru/.claude/plans/ecosystem-points-ledger-refactor.md` (anchor-from-latest-snapshot 원칙)
- [x] **Phase 1 — 스키마**: `ecosystem_score_snapshots`에 6개 nullable 컬럼 + CHECK 제약 + 부분 인덱스 추가. prod psql 적용 완료.
  - `all_time_score`, `all_time_base`, `all_time_bonus`, `all_time_gov`, `all_time_referral_scaled`, `all_time_staking_scaled`
- [x] **Phase 2 — Bootstrap anchor**: prod 55,492 identities의 MAX snapshot row에 anchor 값 기록. `activity_points` 직접 aggregation(snapshot 델타 SUM이 아닌)으로 governance/referral 누락 방지. Synthetic bonus 포함.
  - 검증: Top 1 `481=481` / User 2 `287+8=295=LIVE` / sum mismatch 0건 / negative 0건
- [x] **Phase 3 — daily-snapshot.ts**: cron INSERT에 cumulative 6컬럼 추가. `prev + today_delta` 로직. Synthetic-INCLUSIVE 보너스 aggregation 분리. Staking-v2 post-cutoff 대응. `pm2 restart explorer-api` 완료.
- [x] **커밋·푸시**: `59cee070 feat(explorer-api): ecosystem points ledger refactor (Phase 1-3)`

## 미완료 작업

- [ ] **Phase 4 — API swap** (`routes/ecosystem.ts`)
  - 현재 계산식: `SUM(past snapshot base×mult) + today base×mult + LIVE SUM(bonus/gov/ref/staking)`
  - 신 계산식: `latest_snapshot.all_time_score + post-anchor LIVE delta`
  - **중요**: 24h 대기는 불필요. Anchor만 쓰이므로 Phase 3 cron 실행 전에도 Phase 4 검증 가능.
  - **dual-compute log 권장**: `if |new - old| > 0.01 console.warn(...)` 추가해 회귀 자동 감지
- [ ] **Phase 5 — 관찰/정리**: 3~7일 divergence 로그 모니터링 → 이상 없으면 구 LIVE 경로 삭제

## 중요 컨텍스트

### 설계 원칙 (사용자 승인)
- **Anchor = 각 사용자의 MAX(snapshot_date) 행**. 과거 재구성 안 함.
- **오늘 이후**: 카테고리별 delta 계산이 정확하면 됨 (synthetic/penalty/scalingFactor 과거 재평가 이슈는 의도적으로 수용)
- **Never-reduce**: `anchor + post-anchor delta ≥ 현재 LIVE 값` (Phase 2 검증 완료)

### 왜 v3로 단순화됐는가 (v2 대비 폐기 항목)
- ❌ JSONB breakdown → 평탄 컬럼 4개로 충분 (카테고리 고정 소수)
- ❌ Feature flag + 2주 dual-write → 직접 swap + git revert 롤백
- ❌ Ratchet 카테고리 `ecosystem-bonus-ledger-adjustment` → anchor 정확성으로 대체
- ❌ `is_opening_balance` 플래그 → 매 cron row가 cumulative 보유
- ❌ GREATEST(cumulative, live) flooring → 자가 참조 문제. Anchor 정확성으로 해결

### Phase 4 구현 힌트
- `ecosystem.ts` 290~303번 라인 `allTimeCumulative` 계산 블록 교체
- Latest snapshot with `all_time_score IS NOT NULL AND snapshot_date < today` 쿼리
- Post-anchor LIVE delta: `tx_timestamp > anchor.snapshot_date + interval '1 day'` 필터로 기존 bonus/gov/referral 쿼리 재활용
- Fallback: anchor row 없으면 기존 LIVE 공식 유지 (첫 활동 유저 등)

### 주의사항
- **STAKING_V2_CUTOFF_DATE = 2026-04-14** (내일 00:00 UTC). 내일부터 staking-daily 행이 쌓임 → Phase 3 cron이 `all_time_staking_scaled`에 누적
- **`activity_points` 트리거**는 INSERT만 허용. cumulative 계산 중 실수 UPDATE/DELETE 시도하면 P0001 exception. 의도대로 동작함.
- **linear-skipping-harp Phase 1 (matview refresh 안정화)** 선행 완료됨. 현재 `[Ecosystem] Materialized view refreshed in Xms` 정상. Scanner stability 확보된 기반.
- **DB 슈퍼유저 필요**: 스키마/함수 생성 시 `sudo -u postgres psql` 사용. 앱 role은 INSERT/SELECT만. 파일을 `/tmp`에 복사 후 `chmod 644`로 처리 (postgres가 `~ubuntu/explorer-api/` 접근 불가)

### 핵심 파일 위치
- 플랜: `/home/naru/.claude/plans/ecosystem-points-ledger-refactor.md`
- 스키마 SQL: `apps/network-explorer/api-server/src/scripts/add-cumulative-snapshot-cols.sql`
- Bootstrap SQL: `apps/network-explorer/api-server/src/scripts/bootstrap-cumulative-anchor.sql`
- Cron 수정: `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts`
- API (수정 대상): `apps/network-explorer/api-server/src/routes/ecosystem.ts` (290~303번 라인)

## 최근 변경 파일 (커밋된 것)

`59cee070` commit:
- `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts` (modified)
- `apps/network-explorer/api-server/src/scripts/add-cumulative-snapshot-cols.sql` (new)
- `apps/network-explorer/api-server/src/scripts/bootstrap-cumulative-anchor.sql` (new)

## 현재 워킹 트리 (본 세션 외)

```
M apps/pado/frontend/src/features/earn/hooks/useLendingActions.ts
M apps/pado/frontend/src/features/earn/lib/lending-client.ts
```
다른 세션의 pado 작업 — 터치 안 함.

## 즉시 다음 단계

1. **Phase 4 구현**: `ecosystem.ts` `allTimeCumulative` 계산 블록 교체. Latest snapshot with cumulative 조회 + post-anchor LIVE delta 합산. **dual-compute log 포함** (`if (|new - old| > 0.01) console.warn('[LEDGER-DIVERGE]', ...)`)
2. **검증**: Top 10 사용자 대상 Phase 4 응답 = 현재 LIVE 응답 (0.01 오차) 확인
3. **배포**: rsync + `pm2 restart explorer-api` + 15분 관찰 (pm2 logs에 `LEDGER-DIVERGE` 0건 목표)
4. **커밋·푸시**: `feat(explorer-api): swap All Time API to cumulative ledger (Phase 4)`
5. **내일 09:05 KST (UTC 00:05) 이후**: 첫 cumulative-enabled cron 실행. 검증 쿼리:
   ```sql
   -- 새 snapshot row 생성 + 체인 정합
   SELECT snapshot_date, all_time_score, ecosystem_score AS delta,
          all_time_base, all_time_bonus, all_time_gov, all_time_staking_scaled
   FROM ecosystem_score_snapshots
   WHERE identity_id = 'ap-northeast-2:6cb1e654-bad5-c2db-7893-1adbedee93ae'
     AND snapshot_date >= '2026-04-12'
   ORDER BY snapshot_date;
   -- 2026-04-12: 481 anchor
   -- 2026-04-13: 481 + today's delta
   -- 2026-04-14 (내일): 2026-04-13.score + today's delta (+ staking if applicable)
   ```
6. **staking-v2 연동 확인**: 내일 이후 `all_time_staking_scaled > 0`인 사용자 샘플링
7. **Phase 5**: 3~7일 LEDGER-DIVERGE 로그 0건 지속 → 구 LIVE 공식 제거 + 플랜 완료
