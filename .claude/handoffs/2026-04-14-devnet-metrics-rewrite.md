# Handoff: Devnet Metrics Collector Rewrite (RPC → Explorer-API)

**생성**: 2026-04-14
**브랜치**: main
**배경**: 기존 Lambda가 24k+ 주소별 RPC 호출로 15분 타임아웃. Apr 13 데이터 누락. Apr 14도 자동 수집 실패 예정.

## 스코프

1. `address_first_seen` matview를 explorer-api PG(node-3)에 생성
2. explorer-api에 `/api/v1/stats/daily-metrics?date=YYYY-MM-DD` 엔드포인트 추가
3. Lambda 코드를 RPC 루프 → HTTP 단건 호출로 재작성 (CDK)
4. Historical backfill: explorer-api가 인덱싱한 가장 오래된 날짜부터 오늘까지
5. "new_addresses" 정의 변경: **이 주소가 sender로 최초 등장한 날** (기존 "faucet 수령 + 같은 날 전송"보다 넓음)

## 롤백 전략

### Phase 1 — Matview
- 롤백: `DROP MATERIALIZED VIEW address_first_seen;` (node-3에서 10초)
- 원본 테이블(`tx_affected_addresses`, `checkpoints`) 수정 없음
- 리스크: matview 생성 중 긴 ACCESS SHARE 락이 걸려도 writes는 계속 가능. 인덱서 영향 없음

### Phase 2 — Explorer-API endpoint
- 구현: 신규 route 파일 추가. 기존 route 수정 없음
- 롤백: route 등록 라인 제거 + 재배포
- 리스크: 배포 시 explorer-api PM2 재시작 2-3초 downtime

### Phase 3 — Lambda rewrite
- 백업: CDK 변경 전 현재 Lambda 코드를 git stash/branch
- 롤백: `git revert` + `pnpm cdk deploy NasunDevnetMetricsStack`
- 리스크: 배포 중 Lambda 교체 시점에 수집 실패 가능. EventBridge 00:30 UTC 전에 완료

### Phase 4 — Backfill
- 쓰기 대상: `devnet-metrics` DynamoDB. **기존 row 덮어쓰기**
- 백업: 백필 시작 전 `aws dynamodb scan > devnet-metrics-backup-$(date +%Y%m%d).json` 로 전체 export
- 롤백: backup json에서 각 item을 `put_item`으로 복구
- 안전 장치: dry-run 모드 (출력만, 쓰기 안 함) 먼저 실행

## 안전 장치

- matview 생성은 **현재 시점에 즉시** 실행 (트래픽 있어도 ACCESS SHARE만 걸림)
- Backfill은 **순차 호출 + 2초 sleep** → explorer-api 부담 최소
- Backfill 중 CloudWatch에서 explorer-api EC2 CPU 모니터링

## 상태 체크포인트

- [x] Lambda async retry 중단 (`--maximum-retry-attempts 0`)
- [ ] DynamoDB 전체 백업 (Phase 4 시작 전 필수)
- [ ] matview 생성 (Phase 1)
- [ ] endpoint 배포 (Phase 2)
- [ ] Lambda rewrite 배포 (Phase 3)
- [ ] Backfill 실행 (Phase 4)
- [ ] 검증: 대시보드에 Apr 13/14 표시 + 과거 데이터 재계산 값 합리성 확인
