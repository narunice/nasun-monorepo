---
name: nasun-user-stats
description: Nasun 웹사이트 전체 가입자 중 X(Twitter), Google, Telegram 중 하나 이상을 연결한 사용자 수를 DynamoDB에서 직접 조회합니다. "소셜 연결 통계", "X 연결 사용자", "텔레그램 가입자 수", "nasun user stats", "소셜 계정 현황" 등의 요청에 사용합니다.
argument-hint: ""
---

# Social Stats

Nasun 웹사이트 `UserProfiles` DynamoDB 테이블에서 소셜 계정 연결 현황을 조회합니다.

## 중복 제거 원칙 (중요)

DynamoDB에 두 종류의 identity가 공존한다:

| provider | 설명 | 포함 여부 |
|----------|------|----------|
| `Nasun Wallet` | 현재 방식 (wallet 보유) | 포함 |
| `Twitter` | 레거시 Twitter OAuth identity (wallet 없음) | **제외** |

X 연결 사용자를 `attribute_exists(twitterHandle)` 로 COUNT하면 레거시 Twitter identity가 중복 집계된다.
정확한 수치는 테이블 전체를 scan해 Python으로 중복 제거 후 집계해야 한다.

중복 현황 (2026-04-17 기준):
- X: provider=Twitter 레거시 identity 7,376개 중복 존재 (동일 twitterHandle이 Wallet identity에도 있음)
- Google: 2건 중복 (무시 가능 수준)
- Telegram: 중복 없음

## 데이터 원본

- **AWS**: prod 계정 (`nasun-prod` profile), `ap-northeast-2`
- **Table**: `UserProfiles`
- **조회 방식**: 전체 scan + Python 로컬 중복 제거

## 집계 항목

| 항목 | 기준 |
|------|------|
| 전체 가입자 | provider != Twitter (레거시 제외) |
| X 연결 | unique twitterHandle (Nasun Wallet identity 기준) |
| Google 연결 | unique linkedAccounts.google.email |
| Telegram 가입 | unique telegramUserId (isTelegramMember=true) |
| 소셜 연결 (union) | 셋 중 하나라도 연결된 Nasun Wallet identity 수 |

## 실행

단일 scan으로 전체 테이블을 내려받아 Python으로 처리한다 (페이지네이션 자동 처리).

```bash
python3 << 'EOF'
import subprocess, json
from collections import defaultdict

def scan_all(extra_args=None):
    items = []
    last_key = None
    base = [
        "aws", "dynamodb", "scan",
        "--table-name", "UserProfiles",
        "--profile", "nasun-prod",
        "--region", "ap-northeast-2",
        "--projection-expression", "identityId, #p, twitterHandle, linkedAccounts, telegramUserId, isTelegramMember",
        "--expression-attribute-names", '{"#p":"provider"}',
        "--output", "json",
    ]
    if extra_args:
        base += extra_args
    while True:
        cmd = base[:]
        if last_key:
            cmd += ["--exclusive-start-key", json.dumps(last_key)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        items.extend(data.get("Items", []))
        last_key = data.get("LastEvaluatedKey")
        if not last_key:
            break
    return items

print("Scanning UserProfiles... (this may take a moment)")
items = scan_all()

total_all = len(items)
twitter_handles = set()   # unique X handles (Wallet identity 기준)
google_emails = set()     # unique Google emails
telegram_ids = set()      # unique Telegram user IDs
wallet_identities = 0     # 레거시 Twitter identity 제외한 실제 가입자
any_social_wallets = set() # union: identityId of Wallet users with any social

for item in items:
    iid   = item.get("identityId", {}).get("S", "")
    prov  = item.get("provider", {}).get("S", "")
    th    = item.get("twitterHandle", {}).get("S", "")
    tg_id = item.get("telegramUserId", {}).get("S", "")
    tg_member = item.get("isTelegramMember", {}).get("BOOL", False)
    la    = item.get("linkedAccounts", {}).get("M", {})
    g_email = la.get("google", {}).get("M", {}).get("email", {}).get("S", "")

    # 레거시 Twitter OAuth identity는 모든 집계에서 제외
    if prov == "Twitter":
        continue

    wallet_identities += 1
    has_social = False

    if th:
        twitter_handles.add(th)
        has_social = True
    if g_email:
        google_emails.add(g_email)
        has_social = True
    if tg_id and tg_member:
        telegram_ids.add(tg_id)
        has_social = True

    if has_social:
        any_social_wallets.add(iid)

x_count    = len(twitter_handles)
g_count    = len(google_emails)
tg_count   = len(telegram_ids)
union_count = len(any_social_wallets)
total      = wallet_identities

def pct(n, d): return f"{n/d*100:.1f}%" if d else "N/A"

print(f"\n==== Nasun Social Stats ====")
print(f"Total users (excl. legacy):  {total:,}")
print(f"  (legacy Twitter identities excluded: {total_all - total:,})")
print(f"----------------------------")
print(f"X connected:      {x_count:,}  ({pct(x_count, total)})")
print(f"Google connected: {g_count:,}  ({pct(g_count, total)})")
print(f"Telegram joined:  {tg_count:,}  ({pct(tg_count, total)})")
print(f"----------------------------")
print(f"Any social:       {union_count:,}  ({pct(union_count, total)})")
EOF
```
