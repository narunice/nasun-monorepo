---
name: nasun-stats
description: Nasun 전체 현황 통계를 단일 실행으로 추출합니다. DynamoDB 소셜 연결 스냅샷 + 날짜별 DAU/traders/gamers/verified/social-breakdown/mission 시계열 CSV를 생성합니다. Lambda 한도 우회, DB 직접 쿼리 방식. "nasun stats", "전체 통계", "현황 보고", "통합 통계" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD to YYYY-MM-DD] [--include-banned]"
---

# Nasun Stats

Nasun 전체 현황을 단일 실행으로 추출합니다.

## 출력 파일 3개

- `stats/nasun-stats-snapshot-YYYY-MM-DD.txt` - 실행 시점 스냅샷 (DAA 요약 + DynamoDB 소셜 현황 + 오늘 신규 유입 품질 + 소셜 유저 top 활동)
- `stats/nasun-stats-YYYY-MM-DD.csv` - 날짜별 시계열 (raw)
- `stats/nasun-stats-YYYY-MM-DD.xlsx` - 동일 시계열 + snapshot을 2개 시트로 포맷팅 (`daily` / `snapshot`)

CSV 컬럼:
```
date,
dau, new_addresses, new_verified, returning_addresses, returning_pct,
unique_traders, unique_gamers,
verified_unique_traders, verified_unique_gamers,
dau_x_social, dau_google_social, dau_telegram_social, dau_any_social, dau_no_social,
mission_1, mission_2, mission_3, mission_4, mission_5, mission_6plus
```

Daily mission 7종: `faucet`, `wallet-transfer`, `pado-dex`, `scratchcard` (pado-scratchcard OR gostop-scratchcard), `games` (pado-games OR gostop-numbermatch), `lottery` (pado-lottery OR gostop-lottery), `chat`

gostop 마이그레이션(2026-04-30~) 이후 pado-* 카테고리가 gostop-*로 교체됨. 미션 카운트 시 두 카테고리를 동일 미션으로 취급.

`new_verified_rate` 및 소셜 유저 top 활동은 snapshot.txt에만 포함한다.

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| (없음) | 전체 기간 (2026-03-05 ~ 오늘), ban 필터 적용 |
| `YYYY-MM-DD to YYYY-MM-DD` | 해당 기간만 추출 |
| `--include-banned` | ban된 계정 포함 (필터 비활성화) |

## 실행

```bash
set -eo pipefail  # -u dropped: shell snapshot references ZSH_VERSION which is unbound in bash subshells, causing false-positive failures in CSV integrity check

ARGS="$ARGUMENTS"

# --include-banned flag: skip ban filtering by creating empty banned_wallets table
if echo "$ARGS" | grep -q '\-\-include-banned'; then
  INCLUDE_BANNED=true
  ARGS=$(echo "$ARGS" | sed 's/--include-banned//')
else
  INCLUDE_BANNED=false
fi

if echo "$ARGS" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2} to [0-9]{4}-[0-9]{2}-[0-9]{2}'; then
  DATE_FROM=$(echo "$ARGS" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  DATE_TO=$(echo "$ARGS" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)
else
  DATE_FROM="2026-03-05"
  DATE_TO=$(date +%Y-%m-%d)
fi

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)

# SQL snippet injected into both psql sessions
if [[ "$INCLUDE_BANNED" == "true" ]]; then
  BAN_LABEL="(ban filter: OFF)"
  BAN_SQL="CREATE TEMP TABLE banned_wallets (wallet_address TEXT PRIMARY KEY);"
else
  BAN_LABEL="(ban filter: ON)"
  BAN_SQL="CREATE TEMP TABLE banned_wallets AS SELECT wallet_address FROM banned_users WHERE unbanned_at IS NULL AND wallet_address IS NOT NULL;"
fi
echo "Mode: $BAN_LABEL"

SSH_KEY=~/.ssh/.awskey/nasun-devnet-key.pem
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
NODE3="ubuntu@54.180.61.196"

mkdir -p stats

BAN_SUFFIX=$([[ "$INCLUDE_BANNED" == "true" ]] && echo "-raw" || echo "")
SNAPSHOT_FILE="stats/nasun-stats-snapshot-$TODAY${BAN_SUFFIX}.txt"
CSV_FILE="stats/nasun-stats-$TODAY${BAN_SUFFIX}.csv"
XLSX_FILE="stats/nasun-stats-$TODAY${BAN_SUFFIX}.xlsx"

echo "=== Step 1: DynamoDB scan (24h cache check) ==="

CACHED=$(find /tmp/nasun_wallets_any_*.txt -mmin -1440 2>/dev/null | sort -r | head -1 || true)
if [[ -n "$CACHED" ]]; then
  TS=$(echo "$CACHED" | grep -oE '[0-9]+' | tail -1)
  WALLET_ANY="/tmp/nasun_wallets_any_$TS.txt"
  WALLET_X="/tmp/nasun_wallets_x_$TS.txt"
  WALLET_G="/tmp/nasun_wallets_google_$TS.txt"
  WALLET_TG="/tmp/nasun_wallets_telegram_$TS.txt"
  echo "Cache hit: TS=$TS"
else
  TS=$(date +%s)
  WALLET_ANY="/tmp/nasun_wallets_any_$TS.txt"
  WALLET_X="/tmp/nasun_wallets_x_$TS.txt"
  WALLET_G="/tmp/nasun_wallets_google_$TS.txt"
  WALLET_TG="/tmp/nasun_wallets_telegram_$TS.txt"
  echo "Running DynamoDB scan -> TS=$TS"
fi

python3 << PYEOF
import subprocess, json, sys, os

TS = "$TS"
WALLET_ANY  = f"/tmp/nasun_wallets_any_{TS}.txt"
WALLET_X    = f"/tmp/nasun_wallets_x_{TS}.txt"
WALLET_G    = f"/tmp/nasun_wallets_google_{TS}.txt"
WALLET_TG   = f"/tmp/nasun_wallets_telegram_{TS}.txt"

already_cached = os.path.exists(WALLET_ANY)

def scan_all():
    items, last_key = [], None
    base = [
        "aws", "dynamodb", "scan",
        "--table-name", "UserProfiles",
        "--profile", "nasun-prod",
        "--region", "ap-northeast-2",
        "--projection-expression",
        "identityId, walletAddress, #p, twitterHandle, linkedAccounts, telegramUserId, isTelegramMember",
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

if already_cached:
    counts = {}
    for name, path in [("any", WALLET_ANY), ("x", WALLET_X), ("google", WALLET_G), ("telegram", WALLET_TG)]:
        with open(path) as f:
            counts[name] = sum(1 for _ in f)
    print(f"[Cache] any={counts['any']}  x={counts['x']}  google={counts['google']}  telegram={counts['telegram']}")
    with open("/tmp/nasun_snapshot_data.txt", "w") as f:
        f.write(f"CACHED\n{counts['any']}\n")
    sys.exit(0)

print("Scanning DynamoDB UserProfiles...")
items = scan_all()

twitter_handles, google_emails, telegram_ids = set(), set(), set()
wallets_any = set()
wallets_x = set()
wallets_google = set()
wallets_telegram = set()
multi_social_wallets = set()
wallet_identities = 0

for item in items:
    prov = item.get("provider", {}).get("S", "")
    if prov == "Twitter":
        continue
    wallet_identities += 1
    wallet = item.get("walletAddress", {}).get("S", "")
    if not wallet:
        continue
    th    = item.get("twitterHandle", {}).get("S", "")
    tg_id = item.get("telegramUserId", {}).get("S", "")
    tg_member = item.get("isTelegramMember", {}).get("BOOL", False)
    la    = item.get("linkedAccounts", {}).get("M", {})
    g_email = la.get("google", {}).get("M", {}).get("email", {}).get("S", "")

    has_x  = bool(th)
    has_g  = bool(g_email)
    has_tg = bool(tg_id and tg_member)

    if has_x:
        twitter_handles.add(th)
        wallets_x.add(wallet)
    if has_g:
        google_emails.add(g_email)
        wallets_google.add(wallet)
    if has_tg:
        telegram_ids.add(tg_id)
        wallets_telegram.add(wallet)
    social_count = sum([has_x, has_g, has_tg])
    if social_count >= 1:
        wallets_any.add(wallet)
    if social_count >= 2:
        multi_social_wallets.add(wallet)

total      = wallet_identities
x_count    = len(twitter_handles)
g_count    = len(google_emails)
tg_count   = len(telegram_ids)
union_count = len(wallets_any)
multi_count = len(multi_social_wallets)

def pct(n, d): return f"{n/d*100:.1f}%" if d else "N/A"
print(f"Total: {total:,}  X: {x_count:,}  Google: {g_count:,}  Telegram: {tg_count:,}  Any: {union_count:,}  Multi2+: {multi_count:,}")

for path, wallet_set in [
    (WALLET_ANY,  wallets_any),
    (WALLET_X,    wallets_x),
    (WALLET_G,    wallets_google),
    (WALLET_TG,   wallets_telegram),
]:
    with open(path, "w") as f:
        f.write("\n".join(wallet_set) + "\n")

with open("/tmp/nasun_snapshot_data.txt", "w") as f:
    f.write(f"FRESH\n{total}\n{x_count}\n{g_count}\n{tg_count}\n{union_count}\n{multi_count}\n")
    f.write(f"{pct(x_count,total)}\n{pct(g_count,total)}\n{pct(tg_count,total)}\n{pct(union_count,total)}\n{pct(multi_count,total)}\n")

print(f"Wallet files written: any={union_count}  x={len(wallets_x)}  google={len(wallets_google)}  telegram={len(wallets_telegram)}")
PYEOF

echo "=== Step 2: SCP 4 wallet files to node-3 ==="

for WFILE in \
  "/tmp/nasun_wallets_any_$TS.txt" \
  "/tmp/nasun_wallets_x_$TS.txt" \
  "/tmp/nasun_wallets_google_$TS.txt" \
  "/tmp/nasun_wallets_telegram_$TS.txt"
do
  WBASE=$(basename "$WFILE")
  scp $SSH_OPTS "$WFILE" "$NODE3:/tmp/$WBASE"
  LOCAL_L=$(wc -l < "$WFILE")
  REMOTE_L=$(ssh $SSH_OPTS "$NODE3" "wc -l < /tmp/$WBASE")
  [[ "$LOCAL_L" -lt 1 ]] && { echo "ERROR: $WBASE is empty" >&2; exit 1; }
  [[ "$LOCAL_L" -ne "$REMOTE_L" ]] && { echo "ERROR: mismatch $WBASE local=$LOCAL_L remote=$REMOTE_L" >&2; exit 1; }
  echo "  OK $WBASE ($LOCAL_L wallets)"
done

echo "=== Step 3: psql - main daily stats ==="

# $DATE_FROM / $DATE_TO / $TS 는 로컬 셸 변수로 heredoc에서 확장됨 (의도된 동작)
# 모든 TEMP TABLE + SELECT 를 단일 psql 세션에서 실행
ssh $SSH_OPTS "$NODE3" "sudo -u postgres psql -d nasun_points -q -t -A -F','" << SQLEOF > /tmp/nasun_daily_raw.csv
CREATE TEMP TABLE verified_wallets   (wallet_address TEXT PRIMARY KEY);
CREATE TEMP TABLE x_wallets          (wallet_address TEXT PRIMARY KEY);
CREATE TEMP TABLE google_wallets     (wallet_address TEXT PRIMARY KEY);
CREATE TEMP TABLE telegram_wallets   (wallet_address TEXT PRIMARY KEY);
COPY verified_wallets  (wallet_address) FROM '/tmp/nasun_wallets_any_$TS.txt';
COPY x_wallets         (wallet_address) FROM '/tmp/nasun_wallets_x_$TS.txt';
COPY google_wallets    (wallet_address) FROM '/tmp/nasun_wallets_google_$TS.txt';
COPY telegram_wallets  (wallet_address) FROM '/tmp/nasun_wallets_telegram_$TS.txt';
$BAN_SQL
DELETE FROM verified_wallets WHERE wallet_address IN (SELECT wallet_address FROM banned_wallets);
DELETE FROM x_wallets        WHERE wallet_address IN (SELECT wallet_address FROM banned_wallets);
DELETE FROM google_wallets   WHERE wallet_address IN (SELECT wallet_address FROM banned_wallets);
DELETE FROM telegram_wallets WHERE wallet_address IN (SELECT wallet_address FROM banned_wallets);
-- Categories excluded from DAU/new-address tracking (bonuses, passive, mission-meta, faucet/chat)
CREATE TEMP TABLE excluded_cats (category TEXT PRIMARY KEY);
INSERT INTO excluded_cats VALUES
  ('faucet'),('chat'),('daily-mission'),('ecosystem-passive'),
  ('ecosystem-bonus-restoration'),('ecosystem-bonus-earlybird'),('ecosystem-bonus-admin'),
  ('ecosystem-bonus-game'),('ecosystem-bonus-creators-appreciation'),('ecosystem-bonus-bugreport'),
  ('ecosystem-bonus-creator-posts'),('ecosystem-bonus-alliance-airdrop'),
  ('ecosystem-bonus-genesis-pass-airdrop'),('ecosystem-bonus-feedback');
CREATE TEMP TABLE game_cats (category TEXT PRIMARY KEY);
INSERT INTO game_cats VALUES
  ('pado-lottery'),('pado-games'),('pado-scratchcard'),
  ('gostop-lottery'),('gostop-scratchcard'),('gostop-numbermatch'),
  ('gostop-mines'),('gostop-crash');
WITH
date_series AS (
  SELECT generate_series(
    '$DATE_FROM'::date, '$DATE_TO'::date, '1 day'::interval
  )::date AS day
),
onchain AS (
  SELECT wallet_address, tx_timestamp::date AS day
  FROM activity_points
  WHERE category NOT IN (SELECT category FROM excluded_cats)
  AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets)
),
first_seen AS (
  SELECT wallet_address, MIN(tx_timestamp::date) AS first_day
  FROM activity_points
  WHERE category NOT IN (SELECT category FROM excluded_cats)
  AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets)
  GROUP BY wallet_address
),
daily_dau AS (
  SELECT day, COUNT(DISTINCT wallet_address) AS dau FROM onchain GROUP BY day
),
new_per_day AS (
  SELECT first_day AS day, COUNT(*) AS new_addresses FROM first_seen
  WHERE first_day BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY first_day
),
new_verified_per_day AS (
  SELECT fs.first_day AS day, COUNT(*) AS new_verified
  FROM first_seen fs JOIN verified_wallets vw ON fs.wallet_address = vw.wallet_address
  WHERE fs.first_day BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY fs.first_day
),
traders AS (
  SELECT tx_timestamp::date AS day, COUNT(DISTINCT wallet_address) AS unique_traders
  FROM activity_points
  WHERE category = 'pado-dex'
  AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets)
  GROUP BY 1
),
gamers AS (
  SELECT tx_timestamp::date AS day, COUNT(DISTINCT wallet_address) AS unique_gamers
  FROM activity_points
  WHERE category IN (SELECT category FROM game_cats)
  AND tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets)
  GROUP BY 1
),
vtraders AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS verified_unique_traders
  FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category = 'pado-dex'
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
vgamers AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS verified_unique_gamers
  FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category IN (SELECT category FROM game_cats)
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
dau_x AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_x_social
  FROM activity_points ap JOIN x_wallets xw ON ap.wallet_address = xw.wallet_address
  WHERE ap.category NOT IN (SELECT category FROM excluded_cats)
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
dau_google AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_google_social
  FROM activity_points ap JOIN google_wallets gw ON ap.wallet_address = gw.wallet_address
  WHERE ap.category NOT IN (SELECT category FROM excluded_cats)
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
dau_telegram AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_telegram_social
  FROM activity_points ap JOIN telegram_wallets tw ON ap.wallet_address = tw.wallet_address
  WHERE ap.category NOT IN (SELECT category FROM excluded_cats)
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
dau_any AS (
  SELECT ap.tx_timestamp::date AS day, COUNT(DISTINCT ap.wallet_address) AS dau_any_social
  FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category NOT IN (SELECT category FROM excluded_cats)
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1
),
mission_per_user AS (
  SELECT ap.wallet_address, ap.tx_timestamp::date AS day,
    COUNT(DISTINCT
      CASE ap.category
        WHEN 'gostop-scratchcard'  THEN 'pado-scratchcard'
        WHEN 'gostop-numbermatch'  THEN 'pado-games'
        WHEN 'gostop-lottery'      THEN 'pado-lottery'
        ELSE ap.category
      END
    ) AS missions_done
  FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
  WHERE ap.category IN ('faucet','wallet-transfer','pado-dex','pado-scratchcard','gostop-scratchcard','pado-games','gostop-numbermatch','pado-lottery','gostop-lottery','chat')
  AND ap.tx_timestamp::date BETWEEN '$DATE_FROM'::date AND '$DATE_TO'::date
  GROUP BY 1, 2
),
missions AS (
  SELECT day,
    COUNT(*) FILTER (WHERE missions_done = 1) AS mission_1,
    COUNT(*) FILTER (WHERE missions_done = 2) AS mission_2,
    COUNT(*) FILTER (WHERE missions_done = 3) AS mission_3,
    COUNT(*) FILTER (WHERE missions_done = 4) AS mission_4,
    COUNT(*) FILTER (WHERE missions_done = 5) AS mission_5,
    COUNT(*) FILTER (WHERE missions_done >= 6) AS mission_6plus
  FROM mission_per_user GROUP BY day
)
SELECT
  ds.day,
  COALESCE(d.dau, 0),
  COALESCE(n.new_addresses, 0),
  COALESCE(nv.new_verified, 0),
  COALESCE(d.dau, 0) - COALESCE(n.new_addresses, 0),
  ROUND((COALESCE(d.dau,0) - COALESCE(n.new_addresses,0))::numeric / NULLIF(COALESCE(d.dau,0),0) * 100, 1),
  COALESCE(t.unique_traders, 0),
  COALESCE(g.unique_gamers, 0),
  COALESCE(vt.verified_unique_traders, 0),
  COALESCE(vg.verified_unique_gamers, 0),
  COALESCE(dx.dau_x_social, 0),
  COALESCE(dg.dau_google_social, 0),
  COALESCE(dtg.dau_telegram_social, 0),
  COALESCE(da.dau_any_social, 0),
  COALESCE(d.dau, 0) - COALESCE(da.dau_any_social, 0),
  COALESCE(m.mission_1, 0),
  COALESCE(m.mission_2, 0),
  COALESCE(m.mission_3, 0),
  COALESCE(m.mission_4, 0),
  COALESCE(m.mission_5, 0),
  COALESCE(m.mission_6plus, 0)
FROM date_series ds
LEFT JOIN daily_dau          d   ON ds.day = d.day
LEFT JOIN new_per_day        n   ON ds.day = n.day
LEFT JOIN new_verified_per_day nv ON ds.day = nv.day
LEFT JOIN traders            t   ON ds.day = t.day
LEFT JOIN gamers      g   ON ds.day = g.day
LEFT JOIN vtraders    vt  ON ds.day = vt.day
LEFT JOIN vgamers     vg  ON ds.day = vg.day
LEFT JOIN dau_x       dx  ON ds.day = dx.day
LEFT JOIN dau_google  dg  ON ds.day = dg.day
LEFT JOIN dau_telegram dtg ON ds.day = dtg.day
LEFT JOIN dau_any     da  ON ds.day = da.day
LEFT JOIN missions    m   ON ds.day = m.day
ORDER BY ds.day;
SQLEOF

FIRST_LINE=$(head -1 /tmp/nasun_daily_raw.csv)
if ! echo "$FIRST_LINE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2},'; then
  echo "ERROR: CSV corruption detected. First line: $FIRST_LINE" >&2; exit 1
fi
echo "CSV integrity OK  ($(wc -l < /tmp/nasun_daily_raw.csv) rows)"

echo "=== Step 4: psql - new_verified_rate + top activities ==="

TOP_AND_RATE=$(ssh $SSH_OPTS "$NODE3" "sudo -u postgres psql -d nasun_points -q -t -A -F'|'" << SQLEOF3
CREATE TEMP TABLE verified_wallets (wallet_address TEXT PRIMARY KEY);
COPY verified_wallets (wallet_address) FROM '/tmp/nasun_wallets_any_$TS.txt';
$BAN_SQL
DELETE FROM verified_wallets WHERE wallet_address IN (SELECT wallet_address FROM banned_wallets);
CREATE TEMP TABLE excluded_cats (category TEXT PRIMARY KEY);
INSERT INTO excluded_cats VALUES
  ('faucet'),('chat'),('daily-mission'),('ecosystem-passive'),
  ('ecosystem-bonus-restoration'),('ecosystem-bonus-earlybird'),('ecosystem-bonus-admin'),
  ('ecosystem-bonus-game'),('ecosystem-bonus-creators-appreciation'),('ecosystem-bonus-bugreport'),
  ('ecosystem-bonus-creator-posts'),('ecosystem-bonus-alliance-airdrop'),
  ('ecosystem-bonus-genesis-pass-airdrop'),('ecosystem-bonus-feedback');
-- Game categories (pado + gostop union)
CREATE TEMP TABLE game_cats (category TEXT PRIMARY KEY);
INSERT INTO game_cats VALUES
  ('pado-lottery'),('pado-games'),('pado-scratchcard'),
  ('gostop-lottery'),('gostop-scratchcard'),('gostop-numbermatch'),
  ('gostop-mines'),('gostop-crash');
-- new_verified_rate for today
SELECT 'RATE',
  COUNT(*) AS new_total,
  SUM(CASE WHEN vw.wallet_address IS NOT NULL THEN 1 ELSE 0 END) AS new_verified
FROM (
  SELECT wallet_address FROM activity_points
  WHERE category NOT IN (SELECT category FROM excluded_cats)
  AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets)
  GROUP BY wallet_address
  HAVING MIN(tx_timestamp::date) = CURRENT_DATE
) new_today
LEFT JOIN verified_wallets vw ON new_today.wallet_address = vw.wallet_address;
-- top 5 activities of social users (full period)
SELECT 'TOP', ap.category, COUNT(DISTINCT ap.wallet_address) AS unique_users
FROM activity_points ap JOIN verified_wallets vw ON ap.wallet_address = vw.wallet_address
WHERE ap.category NOT IN (
  'ecosystem-passive','ecosystem-bonus-restoration','ecosystem-bonus-earlybird',
  'ecosystem-bonus-admin','ecosystem-bonus-game','ecosystem-bonus-creators-appreciation',
  'ecosystem-bonus-bugreport','ecosystem-bonus-creator-posts','ecosystem-bonus-alliance-airdrop',
  'ecosystem-bonus-genesis-pass-airdrop','ecosystem-bonus-feedback'
)
GROUP BY ap.category ORDER BY unique_users DESC LIMIT 8;
-- yesterday per-category stats: total / social-verified / returning (used this cat before yday) / retention_d1 (used yday AND day-before)
CREATE TEMP TABLE yday_cat AS
  SELECT DISTINCT category, wallet_address FROM activity_points
  WHERE tx_timestamp::date = '$YESTERDAY'::date
    AND category NOT IN ('daily-mission','ecosystem-passive','ecosystem-bonus-restoration','ecosystem-bonus-earlybird','ecosystem-bonus-admin','ecosystem-bonus-game','ecosystem-bonus-creators-appreciation','ecosystem-bonus-bugreport','ecosystem-bonus-creator-posts','ecosystem-bonus-alliance-airdrop','ecosystem-bonus-genesis-pass-airdrop','ecosystem-bonus-feedback')
    AND wallet_address NOT IN (SELECT wallet_address FROM banned_wallets);
CREATE TEMP TABLE first_seen_cat AS
  SELECT category, wallet_address, MIN(tx_timestamp::date) AS first_day
  FROM activity_points
  WHERE category IN (SELECT DISTINCT category FROM yday_cat)
  GROUP BY 1, 2;
CREATE TEMP TABLE dbd_cat AS
  SELECT DISTINCT category, wallet_address FROM activity_points
  WHERE tx_timestamp::date = ('$YESTERDAY'::date - 1)
    AND category IN (SELECT DISTINCT category FROM yday_cat);
CREATE INDEX ON first_seen_cat (category, wallet_address);
CREATE INDEX ON dbd_cat (category, wallet_address);
SELECT 'CATSTAT',
  y.category,
  COUNT(*) AS total,
  COUNT(vw.wallet_address) AS verified,
  COUNT(CASE WHEN fsc.first_day < '$YESTERDAY'::date THEN 1 END) AS returning,
  COUNT(dbd.wallet_address) AS retention_d1
FROM yday_cat y
LEFT JOIN verified_wallets vw ON y.wallet_address = vw.wallet_address
LEFT JOIN first_seen_cat fsc ON fsc.category = y.category AND fsc.wallet_address = y.wallet_address
LEFT JOIN dbd_cat dbd ON dbd.category = y.category AND dbd.wallet_address = y.wallet_address
GROUP BY y.category ORDER BY total DESC;
-- GAMES group (union of lottery/games/scratchcard, wallet-level dedup)
WITH yg AS (
  SELECT DISTINCT wallet_address FROM yday_cat WHERE category IN (SELECT category FROM game_cats)
),
fsg AS (
  SELECT wallet_address, MIN(tx_timestamp::date) AS first_day FROM activity_points
  WHERE category IN (SELECT category FROM game_cats) GROUP BY 1
),
dbdg AS (
  SELECT DISTINCT wallet_address FROM activity_points
  WHERE tx_timestamp::date = ('$YESTERDAY'::date - 1) AND category IN (SELECT category FROM game_cats)
)
SELECT 'GRPSTAT', 'GAMES',
  COUNT(*) AS total,
  COUNT(vw.wallet_address) AS verified,
  COUNT(CASE WHEN fsg.first_day < '$YESTERDAY'::date THEN 1 END) AS returning,
  COUNT(dbdg.wallet_address) AS retention_d1
FROM yg
LEFT JOIN verified_wallets vw ON yg.wallet_address = vw.wallet_address
LEFT JOIN fsg ON fsg.wallet_address = yg.wallet_address
LEFT JOIN dbdg ON dbdg.wallet_address = yg.wallet_address;
-- DEX group (currently only pado-dex; kept for future perp/prediction cats)
WITH yd AS (
  SELECT DISTINCT wallet_address FROM yday_cat WHERE category IN ('pado-dex')
),
fsd AS (
  SELECT wallet_address, MIN(tx_timestamp::date) AS first_day FROM activity_points
  WHERE category IN ('pado-dex') GROUP BY 1
),
dbdd AS (
  SELECT DISTINCT wallet_address FROM activity_points
  WHERE tx_timestamp::date = ('$YESTERDAY'::date - 1) AND category IN ('pado-dex')
)
SELECT 'GRPSTAT', 'DEX',
  COUNT(*) AS total,
  COUNT(vw.wallet_address) AS verified,
  COUNT(CASE WHEN fsd.first_day < '$YESTERDAY'::date THEN 1 END) AS returning,
  COUNT(dbdd.wallet_address) AS retention_d1
FROM yd
LEFT JOIN verified_wallets vw ON yd.wallet_address = vw.wallet_address
LEFT JOIN fsd ON fsd.wallet_address = yd.wallet_address
LEFT JOIN dbdd ON dbdd.wallet_address = yd.wallet_address;
SQLEOF3
)

NEW_TOTAL=$(echo "$TOP_AND_RATE" | grep '^RATE' | cut -d'|' -f2)
NEW_VERIFIED=$(echo "$TOP_AND_RATE" | grep '^RATE' | cut -d'|' -f3)
TOP_ACTIVITIES=$(echo "$TOP_AND_RATE" | grep '^TOP')
CATSTATS=$(echo "$TOP_AND_RATE" | grep '^CATSTAT')
GRPSTATS=$(echo "$TOP_AND_RATE" | grep '^GRPSTAT')

echo "new_total=$NEW_TOTAL  new_verified=$NEW_VERIFIED"
echo "CATSTAT rows: $(echo "$CATSTATS" | wc -l)"
echo "GRPSTAT rows: $(echo "$GRPSTATS" | wc -l)"

echo "=== Step 5: Build output files ==="

echo "date,dau,new_addresses,new_verified,returning_addresses,returning_pct,unique_traders,unique_gamers,verified_unique_traders,verified_unique_gamers,dau_x_social,dau_google_social,dau_telegram_social,dau_any_social,dau_no_social,mission_1,mission_2,mission_3,mission_4,mission_5,mission_6plus" > "$CSV_FILE"
cat /tmp/nasun_daily_raw.csv >> "$CSV_FILE"

python3 << PYEOF2
import csv

lines = open("/tmp/nasun_snapshot_data.txt").read().strip().split("\n")
mode = lines[0]

def _i(s):
    s = s.strip()
    return int(s) if s.lstrip('-').isdigit() else 0

new_total   = _i("$NEW_TOTAL")
new_verified = _i("$NEW_VERIFIED")
new_rate = f"{new_verified/new_total*100:.1f}%" if new_total > 0 else "N/A"
today     = "$TODAY"
yesterday = "$YESTERDAY"
date_from = "$DATE_FROM"
date_to   = "$DATE_TO"

# Parse CATSTAT / GRPSTAT rows
# format per line: CATSTAT|category|total|verified|returning|retention_d1
cat_stats = {}
for line in """$CATSTATS""".strip().split("\n"):
    parts = line.split("|")
    if len(parts) >= 6 and parts[0] == "CATSTAT":
        cat_stats[parts[1]] = tuple(_i(x) for x in parts[2:6])
grp_stats = {}
for line in """$GRPSTATS""".strip().split("\n"):
    parts = line.split("|")
    if len(parts) >= 6 and parts[0] == "GRPSTAT":
        grp_stats[parts[1]] = tuple(_i(x) for x in parts[2:6])

# DAA stats
dau_rows = []
with open("$CSV_FILE") as f:
    reader = csv.DictReader(f)
    for r in reader:
        if int(r['dau']) > 0:
            dau_rows.append(r)

if dau_rows:
    # always use yesterday (execution date - 1) as reference — today is partial
    ymatch = [r for r in dau_rows if r['date'] == yesterday]
    if ymatch:
        latest = ymatch[0]
    else:
        # yesterday had no activity (or out of range) — fall back to last non-today row
        completed_rows = [r for r in dau_rows if r['date'] != today]
        latest = completed_rows[-1] if completed_rows else dau_rows[-1]
    peak   = max(dau_rows, key=lambda r: int(r['dau']))
    active_days = len(dau_rows)
    avg_ret = sum(float(r['returning_pct']) for r in dau_rows if r['returning_pct']) / active_days
    avg_dau = sum(int(r['dau']) for r in dau_rows) / active_days
    v_traders = int(latest.get('verified_unique_traders', 0))
    v_gamers  = int(latest.get('verified_unique_gamers', 0))
    y_new     = int(latest.get('new_addresses', 0))
    y_new_v   = int(latest.get('new_verified', 0))
    y_new_v_pct = f"{y_new_v/y_new*100:.1f}%" if y_new else "N/A"
    rows_with_new = [r for r in dau_rows if int(r.get('new_addresses', 0)) > 0]
    avg_new_v_pct = (
        sum(int(r['new_verified'])/int(r['new_addresses'])*100 for r in rows_with_new)
        / len(rows_with_new)
    ) if rows_with_new else 0.0
    total_new_all = sum(int(r['new_addresses']) for r in dau_rows)
    total_new_v_all = sum(int(r['new_verified']) for r in dau_rows)
    total_new_v_pct = f"{total_new_v_all/total_new_all*100:.1f}%" if total_new_all else "N/A"
    daa_section = (
        f"-- Devnet DAA ({date_from} ~ {date_to}, {active_days} active days) --\n"
        f"Yesterday DAA ({latest['date']}):      {int(latest['dau']):,}\n"
        f"  Returning:                         {int(latest['returning_addresses']):,}  ({latest['returning_pct']}%)\n"
        f"  New:                               {y_new:,}\n"
        f"Peak DAA   ({peak['date']}):         {int(peak['dau']):,}\n"
        f"Avg DAA:                             {avg_dau:,.0f}\n"
        f"Avg returning rate:                  {avg_ret:.1f}%\n"
        f"Yesterday DEX traders   (social verified): {v_traders:,}\n"
        f"Yesterday game players  (social verified): {v_gamers:,}"
    )
    new_user_quality_section = (
        f"-- Yesterday First-Time On-chain Active Wallets ({latest['date']}) --\n"
        f"  (wallets whose first non-faucet/chat/bonus activity was yesterday)\n"
        f"  New active wallets:                {y_new:,}\n"
        f"  Social connected (any):            {y_new_v:,}  ({y_new_v_pct})\n"
        f"  No social:                         {y_new - y_new_v:,}\n"
        f"\n"
        f"-- Cumulative First-Time On-chain Active Wallets ({date_from} ~ {date_to}) --\n"
        f"  (excludes wallets active before {date_from}; excludes faucet/chat/bonus-only)\n"
        f"  Total new active wallets:          {total_new_all:,}\n"
        f"  Social connected (any):            {total_new_v_all:,}  ({total_new_v_pct})\n"
        f"  Avg daily social verify rate:      {avg_new_v_pct:.1f}%  (unweighted daily mean)"
    )
else:
    daa_section = f"-- Devnet DAA ({date_from} ~ {date_to}) --\nNo active days in this period."
    new_user_quality_section = ""

# Top activities
top_lines = [l for l in """$TOP_ACTIVITIES""".strip().split("\n") if l.strip()]
top_section_lines = ["-- Social Users Top Activities --"]
for line in top_lines:
    parts = line.split("|")
    if len(parts) >= 3:
        cat, cnt = parts[1], parts[2]
        top_section_lines.append(f"  {cat:<32} {int(cnt):>8,} unique users")
top_section = "\n".join(top_section_lines)

if mode == "FRESH":
    total = int(lines[1])
    x_count, g_count, tg_count, union_count, multi_count = int(lines[2]), int(lines[3]), int(lines[4]), int(lines[5]), int(lines[6])
    x_pct, g_pct, tg_pct, union_pct, multi_pct = lines[7], lines[8], lines[9], lines[10], lines[11]
    users_section = (
        f"-- Website Users (DynamoDB, live) --\n"
        f"  X connected:               {x_count:,}  ({x_pct})\n"
        f"  Google connected:          {g_count:,}  ({g_pct})\n"
        f"  Telegram joined:           {tg_count:,}  ({tg_pct})\n"
        f"  Any social (union):        {union_count:,}  ({union_pct})\n"
        f"  2+ social connected:       {multi_count:,}  ({multi_pct})\n"
        f"Verified wallets (for pado): {union_count:,}"
    )
else:
    wallet_count = int(lines[1])
    users_section = (
        f"-- Website Users (DynamoDB, 24h cache) --\n"
        f"Verified wallets (cached):   {wallet_count:,}"
    )

# Mission distribution for yesterday
mission_section = ""
if dau_rows:
    ymatch2 = [r for r in dau_rows if r['date'] == yesterday]
    if ymatch2:
        mrow = ymatch2[0]
    else:
        completed_rows = [r for r in dau_rows if r['date'] != today]
        mrow = completed_rows[-1] if completed_rows else dau_rows[-1]
    m1  = int(mrow.get('mission_1', 0))
    m2  = int(mrow.get('mission_2', 0))
    m3  = int(mrow.get('mission_3', 0))
    m4  = int(mrow.get('mission_4', 0))
    m5  = int(mrow.get('mission_5', 0))
    m6p = int(mrow.get('mission_6plus', 0))
    total_mission = m1 + m2 + m3 + m4 + m5 + m6p
    def mpct(n): return f"{n/total_mission*100:.1f}%" if total_mission else "N/A"
    mission_section = (
        f"-- Yesterday Mission Distribution by Verified Users ({mrow['date']}) --\n"
        f"  1 mission:   {m1:>6,}  ({mpct(m1)})\n"
        f"  2 missions:  {m2:>6,}  ({mpct(m2)})\n"
        f"  3 missions:  {m3:>6,}  ({mpct(m3)})\n"
        f"  4 missions:  {m4:>6,}  ({mpct(m4)})\n"
        f"  5 missions:  {m5:>6,}  ({mpct(m5)})\n"
        f"  6+ missions: {m6p:>6,}  ({mpct(m6p)})\n"
        f"  Total active: {total_mission:,}"
    )

def rpct(n, d): return f"{n/d*100:.0f}%" if d else "N/A"

def fmt_stat_row(label, tup):
    total, verified, returning, retention = tup
    return (
        f"  {label:<26} "
        f"total {total:>7,}  |  "
        f"social {verified:>6,} ({rpct(verified,total):>4})  |  "
        f"returning {returning:>6,} ({rpct(returning,total):>4})  |  "
        f"d-1 retained {retention:>6,} ({rpct(retention,total):>4})"
    )

cat_section_lines = [
    f"-- Yesterday Category Breakdown ({yesterday}) --",
    "  (returning = used this category before yesterday; d-1 retained = also used day-before-yesterday)",
]
# Groups first
if "DEX" in grp_stats:
    cat_section_lines.append(fmt_stat_row("[group] DEX", grp_stats["DEX"]))
if "GAMES" in grp_stats:
    cat_section_lines.append(fmt_stat_row("[group] GAMES", grp_stats["GAMES"]))
# Individual categories in preferred order, then the rest by total desc
preferred = ["pado-dex","pado-lottery","pado-scratchcard","pado-games","faucet","wallet-transfer","chat","staking","staking-daily","staking-reward"]
seen = set()
for cat in preferred:
    if cat in cat_stats:
        cat_section_lines.append(fmt_stat_row(cat, cat_stats[cat]))
        seen.add(cat)
for cat, tup in sorted(cat_stats.items(), key=lambda kv: -kv[1][0]):
    if cat not in seen:
        cat_section_lines.append(fmt_stat_row(cat, tup))
yesterday_pado_section = "\n".join(cat_section_lines)

snapshot = f"""==== Nasun Stats Snapshot ({today}, report base = {yesterday}) ====

{daa_section}

{new_user_quality_section}

{users_section}

{yesterday_pado_section}

{top_section}

{mission_section}

-- Today's New User Quality (partial day, {today}) --
New DAA today:               {new_total:,}
  Social verified:           {new_verified:,}  ({new_rate})
"""

with open("$SNAPSHOT_FILE", "w") as f:
    f.write(snapshot)
print(snapshot)
PYEOF2

echo "=== Step 5b: Build XLSX (daily + snapshot sheets) ==="
python3 << PYEOF_XLSX
import csv, sys
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:
    print("openpyxl not installed; skipping xlsx generation. Install with: pip3 install --user --break-system-packages openpyxl", file=sys.stderr)
    sys.exit(0)

csv_path = "$CSV_FILE"
snap_path = "$SNAPSHOT_FILE"
xlsx_path = "$XLSX_FILE"

wb = Workbook()

# Sheet 1: daily time series
ws = wb.active
ws.title = "daily"
header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill("solid", fgColor="2F5496")
with open(csv_path, newline="") as f:
    reader = csv.reader(f)
    for r_idx, row in enumerate(reader, 1):
        for c_idx, val in enumerate(row, 1):
            cell = ws.cell(row=r_idx, column=c_idx, value=val if r_idx == 1 else (int(val) if val.lstrip("-").isdigit() else (float(val) if val.replace(".", "", 1).lstrip("-").isdigit() else val)))
            if r_idx == 1:
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")
            else:
                if isinstance(cell.value, int):
                    cell.number_format = "#,##0"
                elif isinstance(cell.value, float):
                    cell.number_format = "0.0"
ws.freeze_panes = "B2"
for col in range(1, ws.max_column + 1):
    letter = get_column_letter(col)
    max_len = max((len(str(ws.cell(row=r, column=col).value or "")) for r in range(1, ws.max_row + 1)), default=10)
    ws.column_dimensions[letter].width = min(max(max_len + 2, 10), 28)

# Sheet 2: snapshot text (one line per row, monospace-ish)
ws2 = wb.create_sheet("snapshot")
mono = Font(name="Consolas", size=11)
with open(snap_path) as f:
    for r_idx, line in enumerate(f.read().splitlines(), 1):
        c = ws2.cell(row=r_idx, column=1, value=line)
        c.font = mono
ws2.column_dimensions["A"].width = 110

wb.save(xlsx_path)
print(f"XLSX saved: {xlsx_path}")
PYEOF_XLSX

echo "=== Step 6: Summary ==="
python3 << PYEOF3
import csv
rows = []
with open("$CSV_FILE") as f:
    reader = csv.DictReader(f)
    for r in reader:
        if int(r['dau']) > 0:
            rows.append(r)

if not rows:
    print("No data rows found."); exit()

import datetime
today_str = datetime.date.today().isoformat()
daus  = [(r['date'], int(r['dau'])) for r in rows]
peak  = max(daus, key=lambda x: x[1])
completed = [(d, v) for d, v in daus if d != today_str]
latest = completed[-1] if completed else daus[-1]
avg_ret = sum(float(r['returning_pct']) for r in rows if r['returning_pct']) / len(rows)
avg_t = sum(int(r['unique_traders'])  for r in rows) / len(rows)
avg_g = sum(int(r['unique_gamers'])   for r in rows) / len(rows)
avg_vs = sum(int(r['dau_any_social']) for r in rows) / len(rows)

print(f"Period:             $DATE_FROM ~ $DATE_TO ({len(rows)} days with activity)")
print(f"Peak DAA:           {peak[1]:,} ({peak[0]})")
print(f"Last completed DAA: {latest[1]:,} ({latest[0]})")
print(f"Avg returning:      {avg_ret:.1f}%")
print(f"Avg traders/day:    {avg_t:.0f}")
print(f"Avg gamers/day:     {avg_g:.0f}")
print(f"Avg social DAA/day: {avg_vs:.0f}")
print(f"\nSaved: $SNAPSHOT_FILE")
print(f"Saved: $CSV_FILE")
print(f"Saved: $XLSX_FILE")
PYEOF3

echo "=== Step 7: Cleanup remote temp files ==="
ssh $SSH_OPTS "$NODE3" "rm -f /tmp/nasun_wallets_any_$TS.txt /tmp/nasun_wallets_x_$TS.txt /tmp/nasun_wallets_google_$TS.txt /tmp/nasun_wallets_telegram_$TS.txt" || true
echo "Done"
```
