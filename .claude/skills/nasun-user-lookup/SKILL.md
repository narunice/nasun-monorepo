---
name: nasun-user-lookup
description: X(Twitter) 핸들로 Nasun 사용자의 UserProfiles 및 leaderboard-v3-accounts 프로필을 DynamoDB에서 직접 조회합니다. "X 핸들로 사용자 찾아줘", "트위터 계정으로 나선 유저 조회", "nasun user lookup", "@xxx 사용자 프로필" 등의 요청에 사용합니다.
argument-hint: "@twitter_handle"
---

# Nasun User Lookup by X Handle

인자로 받은 X(Twitter) 핸들로 Nasun 사용자 프로필을 DynamoDB에서 조회한다.

## 인자 처리

- `$ARGUMENTS`에 핸들이 주어진다. `@` 접두사가 있으면 제거한다 (lowercase로 정규화).
- 인자가 없으면 사용자에게 핸들을 요청한다.

## 데이터 원본

- **AWS**: prod 계정 (`nasun-prod` profile), `ap-northeast-2`
- **UserProfiles**: 인증/계정 연결 정보 (walletAddress, linkedAccounts 등)
- **leaderboard-v3-accounts**: 리더보드 활동 통계 (postCount, totalPostScore 등)

## 실행

아래 Python 스크립트를 실행하여 두 테이블을 동시에 조회한다.

```python
import subprocess, json, sys

handle = "$ARGUMENTS".lstrip("@").strip().lower()
if not handle:
    print("ERROR: X handle required. Usage: /nasun-user-lookup @spiral_xx")
    sys.exit(1)

print(f"Looking up Nasun user for X handle: @{handle}\n")

# ── UserProfiles: scan with filter (twitterHandle or originalTwitterHandle) ──
def scan_profiles(handle):
    cmd = [
        "aws", "dynamodb", "scan",
        "--table-name", "UserProfiles",
        "--filter-expression", "twitterHandle = :h OR originalTwitterHandle = :h",
        "--expression-attribute-values", json.dumps({":h": {"S": handle}}),
        "--projection-expression",
            "identityId, #p, twitterHandle, originalTwitterHandle, twitterId, "
            "username, walletAddress, linkedAccounts, "
            "isTelegramMember, telegramUserId, telegramUsername, "
            "createdAt, updatedAt",
        "--expression-attribute-names", '{"#p":"provider"}',
        "--profile", "nasun-prod",
        "--region", "ap-northeast-2",
        "--output", "json",
    ]
    items = []
    last_key = None
    while True:
        c = cmd[:]
        if last_key:
            c += ["--exclusive-start-key", json.dumps(last_key)]
        r = subprocess.run(c, capture_output=True, text=True)
        data = json.loads(r.stdout)
        items.extend(data.get("Items", []))
        last_key = data.get("LastEvaluatedKey")
        if not last_key:
            break
    return items

# ── leaderboard-v3-accounts: GSI query ──
def query_leaderboard(handle):
    cmd = [
        "aws", "dynamodb", "query",
        "--table-name", "leaderboard-v3-accounts",
        "--index-name", "platform-username-index",
        "--key-condition-expression", "#p = :platform AND username = :uname",
        "--expression-attribute-names", '{"#p":"platform"}',
        "--expression-attribute-values", json.dumps({
            ":platform": {"S": "twitter"},
            ":uname":    {"S": handle},
        }),
        "--profile", "nasun-prod",
        "--region", "ap-northeast-2",
        "--output", "json",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(r.stdout)
    return data.get("Items", [])

profiles = scan_profiles(handle)
lb_accounts = query_leaderboard(handle)

if not profiles and not lb_accounts:
    print(f"No Nasun user found for X handle: @{handle}")
    sys.exit(0)

# ── Format UserProfiles ──
def s(field):
    return field.get("S", "") if isinstance(field, dict) else ""

def b(field):
    return field.get("BOOL", False) if isinstance(field, dict) else False

def n(field):
    return field.get("N", "0") if isinstance(field, dict) else "0"

# Primary identity = Nasun Wallet provider (prefer over legacy Twitter)
primary = next((p for p in profiles if s(p.get("provider", {})) != "Twitter"), None)
legacy  = [p for p in profiles if s(p.get("provider", {})) == "Twitter"]

print("=" * 55)
print(f"  Nasun User Profile: @{handle}")
print("=" * 55)

if primary:
    la = primary.get("linkedAccounts", {}).get("M", {})
    print(f"  Identity ID   : {s(primary.get('identityId', {}))}")
    print(f"  Provider      : {s(primary.get('provider', {}))}")
    wallet = s(primary.get("walletAddress", {}))
    if wallet:
        print(f"  Wallet (Nasun): {wallet}")
    print()
    print("  [ Connected Accounts ]")
    # Twitter (from root fields)
    tw_id  = s(primary.get("twitterId", {}))
    tw_name = s(primary.get("username", {}))
    if tw_id:
        print(f"  Twitter : @{handle}  (ID: {tw_id})  {tw_name}")
    # MetaMask
    mm = la.get("metamask", {}).get("M", {})
    if mm:
        print(f"  MetaMask: {s(mm.get('walletAddress', {}))}")
    # Google
    gg = la.get("google", {}).get("M", {})
    if gg:
        print(f"  Google  : {s(gg.get('email', {}))}")
    # Telegram (from root fields)
    if b(primary.get("isTelegramMember", {})):
        tg_user = s(primary.get("telegramUsername", {}))
        tg_id   = s(primary.get("telegramUserId", {}))
        print(f"  Telegram: @{tg_user}  (ID: {tg_id})  [member]")
    created = s(primary.get("createdAt", {}))
    updated = s(primary.get("updatedAt", {}))
    if created:
        print(f"\n  Created : {created}")
    if updated:
        print(f"  Updated : {updated}")

if legacy:
    print(f"\n  [Legacy Twitter Identity]")
    for leg in legacy:
        print(f"  identityId: {s(leg.get('identityId', {}))}")

# ── Format Leaderboard ──
if lb_accounts:
    lb = lb_accounts[0]
    print()
    print("-" * 55)
    print("  [ Leaderboard V3 ]")
    print(f"  accountId     : {s(lb.get('accountId', {}))}")
    print(f"  Display Name  : {s(lb.get('displayName', {}))}")
    print(f"  isRegistered  : {b(lb.get('isRegistered', {}))}")
    print(f"  Posts         : {n(lb.get('postCount', {}))}  (original: {n(lb.get('originalPostCount', {}))})")
    print(f"  Total Score   : {float(n(lb.get('totalPostScore', {}))):.4f}")
    print(f"  Followers     : {n(lb.get('followerCount', {}))}")
    print(f"  Language      : {s(lb.get('language', {}))}")
    print(f"  Active Days   : {n(lb.get('uniqueActiveDays', {}))}")
    tg_lb = s(lb.get("telegramUsername", {}))
    if tg_lb:
        print(f"  Telegram      : @{tg_lb}  (member: {b(lb.get('isTelegramMember', {}))})")
    first = s(lb.get("firstSeenAt", {}))
    last  = s(lb.get("lastSeenAt", {}))
    if first:
        print(f"  First Seen    : {first}")
    if last:
        print(f"  Last Seen     : {last}")

print("=" * 55)
```

## 출력 포맷

- `UserProfiles`: identityId, wallet address, 연결된 소셜 계정 (Twitter/MetaMask/Google/Telegram)
- `leaderboard-v3-accounts`: 포스트 수, 점수, 팔로워, 활동일 등
- 레거시 Twitter identity가 있으면 별도 표시
- 해당 핸들의 사용자가 없으면 "not found" 메시지 출력
