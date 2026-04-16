---
name: dau-export
description: Nasun devnet DAU(Daily Active Addresses) 데이터를 CSV로 내보냅니다. activity_points DB에서 직접 쿼리하므로 Lambda 한계 없이 전체 기간 데이터를 정확하게 추출합니다. "dau 내보내기", "dau export", "daa csv", "활성 주소 다운로드" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD to YYYY-MM-DD]"
---

# DAU Export

Nasun devnet의 Daily Active Addresses(DAA) 데이터를 CSV로 추출합니다.
데이터 원본은 node-3의 `nasun_points.activity_points` DB입니다.

## 변수 정의

### DAA (Daily Active Addresses)
해당 날짜에 **on-chain 활동**을 수행한 고유 지갑 주소 수.

포함 카테고리 (on-chain 실제 활동):
- `pado-dex` - DEX 스왑
- `pado-lottery` - 복권 참여
- `pado-games` - 게임
- `pado-scratchcard` - 스크래치카드
- `wallet-transfer` - 지갑 송금
- `staking` - 스테이킹
- `staking-daily` - 스테이킹 보상 클레임
- `governance` - 거버넌스 투표
- `baram-executor` - Baram executor 활동

제외 카테고리 (off-chain 또는 수동 부여):
- `faucet` - 파우셋 수령 (on-chain이지만 실제 사용 의도 없음)
- `chat` - 채팅 포인트
- `daily-mission` - 일일 미션 체크인
- `ecosystem-passive` - 시스템 자동 부여
- `ecosystem-bonus-*` - 관리자 수동 부여 보너스 전체

### New Addresses
해당 날짜가 해당 지갑의 **최초 on-chain 활동일**인 주소 수.

### Returning Addresses
`DAA - New Addresses`. 이전에 활동한 적 있는 주소가 해당 날짜에 재방문한 수.

## 데이터 원본

- **DB**: node-3 (`54.180.61.196`) `nasun_points.activity_points`
- **SSH 키**: `~/.ssh/.awskey/nasun-devnet-key.pem`
- **데이터 범위**: 2026-02-05 ~ 현재 (devnet 리셋 없이 연속)
- **주의**: `sui_indexer.tx_affected_addresses`는 인덱서 재시작으로 인해 최근 데이터만 존재하므로 사용하지 않는다.

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| (없음) | 전체 기간 (2026-02-05 ~ 오늘) |
| `YYYY-MM-DD to YYYY-MM-DD` | 해당 기간만 추출 |

## 실행

아래 순서로 실행한다:

1. `$ARGUMENTS`에서 날짜 범위 파싱 (없으면 전체 기간)
2. node-3에 SSH로 접속하여 쿼리 실행
3. 결과를 `stats/dau-export-YYYY-MM-DD.csv`로 저장
4. 주요 통계 요약 출력 (기간, 피크 DAU, 최신 DAU, 평균 returning 비율)

```bash
# Arguments 파싱
ARGS="$ARGUMENTS"
if echo "$ARGS" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2} to [0-9]{4}-[0-9]{2}-[0-9]{2}'; then
  DATE_FROM=$(echo "$ARGS" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  DATE_TO=$(echo "$ARGS" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)
else
  DATE_FROM="2026-02-05"
  DATE_TO=$(date +%Y-%m-%d)
fi

OUTPUT_FILE="stats/dau-export-$(date +%Y-%m-%d).csv"

ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o StrictHostKeyChecking=no ubuntu@54.180.61.196 \
  "sudo -u postgres psql -d nasun_points -t -A -F',' -c \"
WITH onchain AS (
  SELECT wallet_address, tx_timestamp::date AS day
  FROM activity_points
  WHERE category NOT IN (
    'faucet','chat','daily-mission','ecosystem-passive',
    'ecosystem-bonus-restoration','ecosystem-bonus-earlybird','ecosystem-bonus-admin',
    'ecosystem-bonus-game','ecosystem-bonus-creators-appreciation','ecosystem-bonus-bugreport',
    'ecosystem-bonus-creator-posts','ecosystem-bonus-alliance-airdrop',
    'ecosystem-bonus-genesis-pass-airdrop','ecosystem-bonus-feedback'
  )
  AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
),
first_seen AS (
  SELECT wallet_address, MIN(tx_timestamp::date) AS first_day
  FROM activity_points
  WHERE category NOT IN (
    'faucet','chat','daily-mission','ecosystem-passive',
    'ecosystem-bonus-restoration','ecosystem-bonus-earlybird','ecosystem-bonus-admin',
    'ecosystem-bonus-game','ecosystem-bonus-creators-appreciation','ecosystem-bonus-bugreport',
    'ecosystem-bonus-creator-posts','ecosystem-bonus-alliance-airdrop',
    'ecosystem-bonus-genesis-pass-airdrop','ecosystem-bonus-feedback'
  )
  GROUP BY wallet_address
),
daily AS (
  SELECT day, COUNT(DISTINCT wallet_address) AS dau
  FROM onchain
  GROUP BY day
),
new_per_day AS (
  SELECT first_day AS day, COUNT(*) AS new_addresses
  FROM first_seen
  WHERE first_day BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY first_day
)
SELECT
  d.day,
  d.dau,
  COALESCE(n.new_addresses, 0) AS new_addresses,
  d.dau - COALESCE(n.new_addresses, 0) AS returning_addresses,
  ROUND((d.dau - COALESCE(n.new_addresses, 0))::numeric / NULLIF(d.dau, 0) * 100, 1) AS returning_pct
FROM daily d
LEFT JOIN new_per_day n ON d.day = n.day
ORDER BY d.day ASC;\"" > /tmp/dau_raw.csv

# 헤더 추가
echo "date,dau,new_addresses,returning_addresses,returning_pct" > "$OUTPUT_FILE"
cat /tmp/dau_raw.csv >> "$OUTPUT_FILE"

echo "Saved: $OUTPUT_FILE"
wc -l "$OUTPUT_FILE"
```

결과 파일 저장 후 아래 통계를 계산해서 출력한다:
- 추출 기간
- 총 행 수 (일수)
- 피크 DAU (날짜 포함)
- 최신 DAU
- 전체 기간 평균 returning 비율
