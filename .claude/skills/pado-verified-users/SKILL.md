---
name: pado-verified-users
description: 소셜 계정(X/Google/Telegram) 연결이 확인된 사용자만 필터링한 daily unique gamers/traders를 CSV로 내보냅니다. 봇 파밍을 배제한 실제 사용자 기반 통계입니다. "verified gamers", "verified traders", "봇 제외 통계", "소셜 인증 사용자", "pado verified" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD to YYYY-MM-DD]"
---

# Pado Verified Users Export

소셜 계정 연결 여부를 봇 필터로 활용하여, 실제 web UI를 통해 가입한 사용자만 집계합니다.

## 정의

- **Verified Gamer**: `pado-lottery`, `pado-games`, `pado-scratchcard` 카테고리 트랜잭션을 발생시킨 지갑 중, UserProfiles에 소셜 계정(X/Google/Telegram)이 하나 이상 연결된 지갑
- **Verified Trader**: `pado-dex` 카테고리 트랜잭션을 발생시킨 지갑 중, 동일 조건

## 데이터 소스 및 조인 경로

```
DynamoDB UserProfiles (prod, ap-northeast-2)
  → walletAddress (provider != 'Twitter' AND any social connected)
  → /tmp/verified_wallets.txt (로컬 경유 → node-3 전송)

PostgreSQL nasun_points.activity_points (node-3)
  → temp table: verified_wallets
  → JOIN on wallet_address
  → GROUP BY date
```

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| (없음) | 전체 기간 (2026-02-05 ~ 오늘) |
| `YYYY-MM-DD to YYYY-MM-DD` | 해당 기간만 추출 |

## 실행

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

OUTPUT_FILE="stats/pado-verified-users-$(date +%Y-%m-%d).csv"

# Step 1: DynamoDB에서 소셜 인증된 wallet address 추출
echo "Fetching verified wallets from DynamoDB..."
python3 << 'PYEOF'
import subprocess, json

def scan_all():
    items, last_key = [], None
    base = [
        "aws", "dynamodb", "scan",
        "--table-name", "UserProfiles",
        "--profile", "nasun-prod",
        "--region", "ap-northeast-2",
        "--projection-expression", "walletAddress, #p, twitterHandle, linkedAccounts, telegramUserId, isTelegramMember",
        "--expression-attribute-names", '{"#p":"provider"}',
        "--output", "json",
    ]
    while True:
        cmd = base + (["--exclusive-start-key", json.dumps(last_key)] if last_key else [])
        data = json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)
        items.extend(data.get("Items", []))
        last_key = data.get("LastEvaluatedKey")
        if not last_key:
            break
    return items

items = scan_all()
wallets = set()
for item in items:
    if item.get("provider", {}).get("S", "") == "Twitter":
        continue
    wallet = item.get("walletAddress", {}).get("S", "")
    if not wallet:
        continue
    th = item.get("twitterHandle", {}).get("S", "")
    tg_id = item.get("telegramUserId", {}).get("S", "")
    tg_member = item.get("isTelegramMember", {}).get("BOOL", False)
    la = item.get("linkedAccounts", {}).get("M", {})
    g_email = la.get("google", {}).get("M", {}).get("email", {}).get("S", "")
    if th or g_email or (tg_id and tg_member):
        wallets.add(wallet)

with open("/tmp/verified_wallets.txt", "w") as f:
    f.write("\n".join(wallets))

print(f"Verified wallets: {len(wallets)}")
PYEOF

WALLET_COUNT=$(wc -l < /tmp/verified_wallets.txt)
echo "Verified wallets extracted: $WALLET_COUNT"

# Step 2: wallet 목록을 node-3으로 전송
scp -i ~/.ssh/.awskey/nasun-devnet-key.pem -o StrictHostKeyChecking=no \
  /tmp/verified_wallets.txt ubuntu@54.180.61.196:/tmp/verified_wallets.txt

# Step 3: node-3에서 temp table 생성 후 JOIN 쿼리 실행
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o StrictHostKeyChecking=no ubuntu@54.180.61.196 \
  "sudo -u postgres psql -d nasun_points -t -A -F',' -c \"
-- Load verified wallets into temp table
CREATE TEMP TABLE verified_wallets (wallet_address TEXT PRIMARY KEY);
COPY verified_wallets (wallet_address) FROM '/tmp/verified_wallets.txt';

-- Daily verified gamers & traders
WITH date_series AS (
  SELECT generate_series(
    '$DATE_FROM'::date,
    '$DATE_TO'::date,
    '1 day'::interval
  )::date AS day
),
verified_gamers AS (
  SELECT ap.tx_timestamp::date AS day,
         COUNT(DISTINCT ap.wallet_address) AS verified_unique_gamers
  FROM activity_points ap
  JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category IN ('pado-lottery', 'pado-games', 'pado-scratchcard')
    AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY ap.tx_timestamp::date
),
verified_traders AS (
  SELECT ap.tx_timestamp::date AS day,
         COUNT(DISTINCT ap.wallet_address) AS verified_unique_traders
  FROM activity_points ap
  JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category = 'pado-dex'
    AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY ap.tx_timestamp::date
)
SELECT
  ds.day,
  COALESCE(vt.verified_unique_traders, 0) AS verified_unique_traders,
  COALESCE(vg.verified_unique_gamers, 0)  AS verified_unique_gamers
FROM date_series ds
LEFT JOIN verified_traders vt ON ds.day = vt.day
LEFT JOIN verified_gamers  vg ON ds.day = vg.day
ORDER BY ds.day ASC;
\"" > /tmp/pado_verified_raw.csv

# Step 4: 헤더 추가 및 저장
echo "date,verified_unique_traders,verified_unique_gamers" > "$OUTPUT_FILE"
cat /tmp/pado_verified_raw.csv >> "$OUTPUT_FILE"

echo "Saved: $OUTPUT_FILE"
wc -l "$OUTPUT_FILE"
```

결과 파일 저장 후 아래 통계를 출력한다:
- 추출 기간 및 소셜 인증 지갑 수
- 피크 verified_unique_traders (날짜 포함)
- 피크 verified_unique_gamers (날짜 포함)
- 최신 verified_unique_traders / verified_unique_gamers
- 전체 기간 평균 verified_unique_traders / verified_unique_gamers
