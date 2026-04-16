---
name: pado-user-export
description: Pado 런칭 이후 날짜별 unique traders(스팟 트레이딩)와 unique gamers(lottery/number match/scratch cards) 숫자를 CSV로 내보냅니다. "unique traders", "unique gamers", "pado 사용자 통계", "트레이더 수", "게이머 수" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD to YYYY-MM-DD]"
---

# Pado User Export

Pado 런칭 이후 날짜별 unique traders / unique gamers 데이터를 CSV로 추출합니다.
데이터 원본은 node-3의 `nasun_points.activity_points` DB입니다.

## 변수 정의

### Unique Traders
해당 날짜에 **스팟 트레이딩(DEX 스왑)**을 한 번이라도 수행한 고유 지갑 주소 수.
- 카테고리: `pado-dex`

### Unique Gamers
해당 날짜에 **lottery, number match, scratch cards** 중 하나라도 참여한 고유 지갑 주소 수.
- 카테고리: `pado-lottery`, `pado-games`, `pado-scratchcard`

## 데이터 원본

- **DB**: node-3 (`54.180.61.196`) `nasun_points.activity_points`
- **SSH 키**: `~/.ssh/.awskey/nasun-devnet-key.pem`
- **데이터 범위**: 2026-02-05 ~ 현재 (Pado 런칭일 기준)

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| (없음) | 전체 기간 (2026-02-05 ~ 오늘) |
| `YYYY-MM-DD to YYYY-MM-DD` | 해당 기간만 추출 |

## 실행

아래 순서로 실행한다:

1. `$ARGUMENTS`에서 날짜 범위 파싱 (없으면 전체 기간)
2. node-3에 SSH로 접속하여 쿼리 실행
3. 결과를 `stats/pado-user-export-YYYY-MM-DD.csv`로 저장
4. 주요 통계 요약 출력

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

OUTPUT_FILE="stats/pado-user-export-$(date +%Y-%m-%d).csv"

ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o StrictHostKeyChecking=no ubuntu@54.180.61.196 \
  "sudo -u postgres psql -d nasun_points -t -A -F',' -c \"
WITH date_series AS (
  SELECT generate_series(
    '$DATE_FROM'::date,
    '$DATE_TO'::date,
    '1 day'::interval
  )::date AS day
),
traders AS (
  SELECT
    tx_timestamp::date AS day,
    COUNT(DISTINCT wallet_address) AS unique_traders
  FROM activity_points
  WHERE category = 'pado-dex'
    AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY tx_timestamp::date
),
gamers AS (
  SELECT
    tx_timestamp::date AS day,
    COUNT(DISTINCT wallet_address) AS unique_gamers
  FROM activity_points
  WHERE category IN ('pado-lottery', 'pado-games', 'pado-scratchcard')
    AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY tx_timestamp::date
)
SELECT
  ds.day,
  COALESCE(t.unique_traders, 0) AS unique_traders,
  COALESCE(g.unique_gamers, 0) AS unique_gamers
FROM date_series ds
LEFT JOIN traders t ON ds.day = t.day
LEFT JOIN gamers g ON ds.day = g.day
ORDER BY ds.day ASC;\"" > /tmp/pado_user_raw.csv

# 헤더 추가
echo "date,unique_traders,unique_gamers" > "$OUTPUT_FILE"
cat /tmp/pado_user_raw.csv >> "$OUTPUT_FILE"

echo "Saved: $OUTPUT_FILE"
wc -l "$OUTPUT_FILE"
```

결과 파일 저장 후 아래 통계를 계산해서 출력한다:
- 추출 기간
- 총 행 수 (일수)
- 피크 unique_traders (날짜 포함)
- 피크 unique_gamers (날짜 포함)
- 최신 unique_traders / unique_gamers
- 전체 기간 평균 unique_traders / unique_gamers
