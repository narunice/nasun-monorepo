# Points 누락 보고 처리 절차

사용자가 포인트 누락을 보고할 때 24h 내 인지 + 복구하기 위한 runbook.

> **민감 정보 마스킹 원칙**: 이 문서에 실제 wallet/identity_id를 첨부할 때는 마지막 6자리만 노출 (`0x...abc123`). 외부 공유 시 항상 마스킹.

## 1. 보고 확인

`nasun-bug-reports` DynamoDB 테이블에서 신규 리포트 조회. 추출:

- `wallet` (또는 `walletAddress`) — 사용자 지갑 주소
- `identity` (또는 `identityId`) — Cognito identity
- 활동 시점 (날짜, UTC) — 사용자 진술 기반
- 미션/카테고리 — Spot Trade, Lottery, Chat 등
- 기대 점수 vs 실제 점수

DynamoDB 스키마 참조: [bug-report-stack.ts:48-114](apps/nasun-website/cdk/lib/bug-report-stack.ts#L48-L114)

## 2. 사례 재현 (DB 확인)

```bash
ssh node-3 "set -a && source ~/explorer-api/.env && set +a && \
  psql \"\$POINTS_DATABASE_URL\" -c \"
SELECT tx_timestamp::date AS day, category, activity_type, base_points, final_points, tx_digest
FROM activity_points
WHERE wallet_address = '0x...' AND tx_timestamp >= 'YYYY-MM-DD'::date
ORDER BY tx_timestamp DESC LIMIT 30;
\""
```

```bash
# 7개 UI mission 활동 요약 (해당 일자)
ssh node-3 "set -a && source ~/explorer-api/.env && set +a && \
  psql \"\$POINTS_DATABASE_URL\" -c \"
SELECT category, activity_type, COUNT(*) AS cnt
FROM activity_points
WHERE identity_id = '...' AND tx_timestamp::date = 'YYYY-MM-DD'::date
GROUP BY 1, 2 ORDER BY 1, 2;
\""
```

## 3. RPC source-of-truth 직접 조회 (on-chain)

```bash
# 사용자 wallet의 최근 50개 이벤트 (descending)
curl -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"suix_queryEvents","params":[{"Sender":"0x..."}, null, 50, true]}' \
  | python3 -m json.tool | head -100
```

특정 미션 카테고리만 보려면 `Sender` 대신 `MoveEventType`을 사용.

## 4. 누락 발견 시 카테고리별 backfill

> ⚠️ Backfill 전 scanner 정지 권장 (`pm2 stop explorer-api`) — race 회피.
> 모든 backfill 도구는 `ON CONFLICT DO NOTHING` 패턴이라 idempotent.

| 카테고리 | 도구 | 명령 |
|---------|------|------|
| pado-dex (limit/market/cancel) | `backfill-dex.ts` | `npx tsx src/scripts/backfill-dex.ts <date_from> <date_to>` |
| pado-lottery / -scratchcard / -games / -prediction / -perp / baram-ai 등 | `backfill-from-indexer.ts` | `npx tsx src/scripts/backfill-from-indexer.ts --start <date> --end <date> --apply` (dry-run 우선!) |
| faucet | `backfill-from-indexer.ts` | (위와 동일, faucet은 indexer tx_calls_fun에서 자동 처리) |
| wallet-transfer | `daily-nft-check.ts` 재실행 | digest=`wt:${identityId}:${dateStr}` 자연 idempotent |
| chat | chat-scanner 재시작 또는 manual INSERT | chat-scanner는 today만 fetch, 과거는 manual |

### 4.1 Backfill dry-run 우선

```bash
# 1. Scanner 정지
ssh node-3 "pm2 stop explorer-api"

# 2. Dry-run audit
ssh node-3 "cd ~/explorer-api && npx tsx src/scripts/backfill-from-indexer.ts \
  --start 2026-04-01 --end 2026-04-13 --dry-run"

# 3. 결과 검토 후 live (--dry-run 제거)
ssh node-3 "cd ~/explorer-api && npx tsx src/scripts/backfill-from-indexer.ts \
  --start 2026-04-01 --end 2026-04-13"

# 4. Scanner 재시작
ssh node-3 "pm2 start explorer-api"
```

### 4.2 Backfill 후 검증

```bash
# Row count 비교
ssh node-3 "set -a && source ~/explorer-api/.env && set +a && \
  psql \"\$POINTS_DATABASE_URL\" -c \"
SELECT category, COUNT(*) FROM activity_points
WHERE tx_timestamp::date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
GROUP BY category ORDER BY category;
\""

# 사용자별 score 확인
curl -s "https://explorer.nasun.io/api/v1/ecosystem/score/<identityId>" | python3 -m json.tool
```

## 5. 결과 기록

### 5.1 nasun-bug-reports DynamoDB 업데이트

`reportId` PK로 resolution status 업데이트:

```bash
aws dynamodb update-item --profile nasun-prod --region ap-northeast-2 \
  --table-name nasun-bug-reports \
  --key '{"reportId": {"S": "<reportId>"}}' \
  --update-expression "SET #s = :s, resolution = :r, resolvedAt = :t" \
  --expression-attribute-names '{"#s": "status"}' \
  --expression-attribute-values '{
    ":s": {"S": "resolved"},
    ":r": {"S": "<one-line description, masked wallets>"},
    ":t": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }'
```

### 5.2 incident log 작성

`apps/network-explorer/api-server/docs/points-incidents.md` (append-only):

```markdown
## YYYY-MM-DD: <카테고리> 누락 (<영향 user 수>)

- **Reported**: YYYY-MM-DD HH:MM UTC by <wallet 마스킹>
- **Acknowledged**: YYYY-MM-DD HH:MM UTC (24h SLO check)
- **Resolved**: YYYY-MM-DD HH:MM UTC (24h SLO check)
- **Root cause**: <e.g., 매핑 누락, scanner downtime, 인덱서 lag>
- **Action**: <e.g., backfill-dex.ts 4/1~4/12 실행, 854건 복구>
- **Follow-up**: <필요 시 plan 항목 또는 후속 조사>
```

## 6. 사전 감지: scanner WARN 로그 모니터링

새 컨트랙트 배포 후 1h 내 PM2 로그 확인 (사용자 보고 전 인지 가능):

```bash
ssh node-3 "pm2 logs explorer-api --lines 500 --nostream | grep '\[Points\] UNMAPPED'"
```

WARN 발견 시:
1. `package_hex::module::type_name` 식별
2. `apps/network-explorer/api-server/src/config/points.ts` `EVENT_MAP_ENTRIES`에 매핑 추가 (forward-only)
3. 배포 후 backfill (위 §4 절차)

## 7. 주요 데이터 source 매핑

| Source | 위치 | 검증 도구 |
|--------|------|----------|
| RPC events (대부분 카테고리) | `https://rpc.devnet.nasun.io` `suix_queryEvents` | backfill-from-indexer.ts |
| Indexer DB (faucet, tx 메타) | `DATABASE_URL` PostgreSQL | backfill-from-indexer.ts (Phase 1B) |
| chat-server REST (chat) | nasun: 3101, pado: 3100 (내부망) | chat-scanner.ts (today only) |
| activationsCache diff (wallet-transfer) | NFT activation 기반 | daily-nft-check.ts |
| activity_points (집계) | `POINTS_DATABASE_URL` PostgreSQL | psql 직접 |
| ecosystem_score_snapshots (일일 집계) | 동일 DB | snapshot UPDATE는 backfill 도구 자동 처리 |

## 8. 백업 위치 (복구 시)

- pg_dump full backup: `/backup/nasun_points-YYYYMMDD.sql.gz` (14일 retention, 18:00 UTC)
- ecosystem_score_snapshots CSV: `~/explorer-api/backups/snapshots/snapshot_YYYY-MM-DD.csv` (영구, 01:00 UTC)
- restore drill: 분기 1회 manual (별도 runbook)
