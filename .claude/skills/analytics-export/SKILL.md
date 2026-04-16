---
name: analytics-export
description: Nasun ecosystem의 Umami 웹 analytics 데이터를 날짜별 CSV로 내보냅니다. nasun.io, pado.finance 분리 또는 통합 조회 지원. "analytics 내보내기", "umami csv", "웹사이트 통계 다운로드", "visitors export" 등의 요청에 사용합니다.
argument-hint: "[nasun|pado|all] [YYYY-MM-DD to YYYY-MM-DD]"
---

# Analytics Export

Nasun ecosystem Umami analytics 데이터를 날짜별 CSV로 추출합니다.

## 데이터 원본 구조

**Umami DB**: staging EC2 (`15.165.19.180`) Docker PostgreSQL 15
- SSH 키: `~/.ssh/.awskey/naru_seoul.pem`
- 컨테이너: `umami-db-1`
- DB: `umami`, 유저: `umami`

### Website 이력 (중요)

| Website ID | Name | 기간 | 내용 |
|---|---|---|---|
| `9fea5a9d-feac-48a7-88e3-e87783f29b5b` | Nasun Ecosystem | 2026-02-27 ~ 현재 | nasun.io 전체 기간 + pado.finance 2026-04-14부터 |
| `fcf0ce34-acb4-4cee-b1db-f76a9ab28e69` | [Archive] Pado | 2026-03-29 ~ 현재 | pado.finance 별도 추적 시절 데이터 |

### 기간별 데이터 방법론 (중요)

| 기간 | 방법론 | 이유 |
|---|---|---|
| ~2026-04-13 | nasun.io / pado.finance 별도 파일 (합산 불가) | 별도 website로 추적 - session_id가 독립적이라 cross-site dedup 불가 |
| 2026-04-14~ | Nasun Ecosystem 단일 website dedup | 동일 website_id(9fea5a9d)에 두 hostname이 통합 - session_id 공유로 정확한 dedup 가능 |

**~2026-04-13 확정 데이터**는 이미 저장 완료 (재추출 불필요):
- `stats/analytics-history-nasun-thru-2026-04-13.csv` (nasun.io 확정, 46일)
- `stats/analytics-history-pado-thru-2026-04-13.csv` (pado.finance 확정, 14일)

### 지표 정의

- **visitors**: 날짜별 unique session 수 (distinct session_id)
- **visits**: 날짜별 unique visit 수 (distinct visit_id)
- **pageviews**: 날짜별 page view 이벤트 수 (event_type=1)
- **bounce_rate**: single-pageview visit 비율 (%) - visit 중 page 1개만 본 비율
- **avg_duration_sec**: visit당 평균 체류 시간 (초) - 첫 이벤트~마지막 이벤트 시간 차

## $ARGUMENTS 처리

| 입력 | 동작 |
|---|---|
| (없음) | 2026-04-14~ Nasun Ecosystem dedup 데이터 출력 |
| `YYYY-MM-DD to YYYY-MM-DD` | 해당 기간 (2026-04-14 이후만 유효) |

## 실행

아래 순서로 실행한다:

1. `$ARGUMENTS` 파싱: 날짜 범위 (기본값: 2026-04-14 ~ 오늘)
2. staging EC2에 SSH 접속, Docker psql로 쿼리 실행
3. `stats/analytics-export-all-$(date +%Y-%m-%d).csv` 저장
4. 주요 통계 요약 출력

### 통합 쿼리 (2026-04-14~, Nasun Ecosystem dedup)

duration 계산 방법론 (Umami 소스코드 getWebsiteStats.ts 기준):
- **visit 단위 MAX-MIN**: hostname 구분 없이 visit_id 기준으로 전체 이벤트의 MAX(created_at) - MIN(created_at). Umami UI와 동일.
- **event_type != 2**: custom event 제외, pageview + 기타 이벤트 포함.
- **bounce 포함**: pageview가 1개인 visit은 duration=0 (MAX=MIN). Umami와 동일하게 자연스럽게 0이 됨.
- **avg_duration = totaltime / visits**: bounce 포함 전체 visit 수로 나눔.

```sql
WITH visits AS (
  SELECT
    DATE(MIN(created_at) AT TIME ZONE 'UTC') AS day,
    session_id,
    visit_id,
    COUNT(*) FILTER (WHERE event_type = 1) AS pageviews,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS duration_sec
  FROM website_event
  WHERE website_id = '9fea5a9d-feac-48a7-88e3-e87783f29b5b'
    AND hostname IN ('nasun.io', 'pado.finance')
    AND DATE(created_at) BETWEEN '$DATE_FROM' AND '$DATE_TO'
    AND event_type != 2
  GROUP BY session_id, visit_id
)
SELECT
  day,
  COUNT(DISTINCT session_id) AS visitors,
  COUNT(DISTINCT visit_id) AS visits,
  SUM(pageviews) AS pageviews,
  ROUND(COUNT(*) FILTER (WHERE pageviews <= 1)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS bounce_rate,
  ROUND(SUM(duration_sec) / NULLIF(COUNT(*), 0), 0) AS avg_duration_sec
FROM visits
GROUP BY day
ORDER BY day ASC
```

### 실행 명령 (Bash)

```bash
DATE_FROM="2026-04-14"
DATE_TO=$(date +%Y-%m-%d)
OUTPUT="stats/analytics-export-all-$(date +%Y-%m-%d).csv"

ssh -i ~/.ssh/.awskey/naru_seoul.pem -o StrictHostKeyChecking=no ubuntu@15.165.19.180 \
  "sudo docker exec umami-db-1 psql -U umami -d umami -t -A -F',' -c \"$QUERY\"" \
  > /tmp/analytics_raw.csv

echo "date,visitors,visits,pageviews,bounce_rate,avg_duration_sec" > "$OUTPUT"
cat /tmp/analytics_raw.csv >> "$OUTPUT"
echo "Saved: $OUTPUT"
```

저장 후 아래 요약 출력:
- 추출 기간
- 총 일수
- 피크 visitors (날짜 포함)
- 전체 기간 평균 bounce rate
- 전체 기간 평균 avg_duration_sec
