#!/usr/bin/env python3
"""
Repost Bonus: local resolver + SQL emitter.

WHY THIS EXISTS (post AWS-exit / box migration):
  The live points DB (`activity_points`) now lives on box (Hetzner), which has
  NO AWS credentials and no `aws` CLI. Handle->wallet resolution needs DynamoDB
  `UserProfiles`, so the original TS resolver could no longer run on box. Local
  (2026PC) has aws CLI + nasun-prod profile + boto3 but NOT the
  api-server node_modules. So we SPLIT the work:
    - DDB handle->wallet resolution runs HERE (local, where AWS creds live) and
      emits idempotent SQL.
    - The SQL is applied on box via psql (where the live DB lives).
  This is the canonical resolver. The former grant-repost-bonus.ts was deleted
  (2026-06-25): it could no longer run anywhere (box has no AWS creds, local has
  no api-server node_modules), so this Python tool is the single source of truth.

ONLY reads prod (Secrets Manager, X API, DynamoDB). No DB writes happen here.

Usage (run locally on the host that has the nasun-prod AWS profile):
    python3 repost-grant-emit.py <tweetId> [<tweetId> ...]
    # writes /tmp/repost-grants.sql + prints a dry-run mapping summary

Then apply on box (set $BOX_SSH=user@host and $BOX_KEY=ssh key path; concrete
coordinates live in the private repost-bonus skill, not in this public repo):
    scp -i "$BOX_KEY" /tmp/repost-grants.sql "$BOX_SSH":/tmp/
    ssh -i "$BOX_KEY" "$BOX_SSH" 'cd <repo>/apps/network-explorer/api-server; \
             set -a; source .env; set +a; \
             psql "$POINTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/repost-grants.sql'
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error

import boto3
from boto3.dynamodb.conditions import Key

# ── CONFIG ───────────────────────────────────────────────────────────────────
AWS_PROFILE = "nasun-prod"
AWS_REGION = "ap-northeast-2"
SECRET_ID = "nasun-twitter-tokens-prod"   # bearerToken field (post 2026-05-27 rotation)
USER_PROFILES_TABLE = "UserProfiles"
BONUS_POINTS = 3
OUT_SQL = "/tmp/repost-grants.sql"

# Official Nasun accounts must never receive the bonus (case-insensitive).
ADMIN_EXCLUDE = {"nasun_io", "naru010110", "overclocksalmon"}

SUI_ADDR_OK = re.compile(r"^0x[a-fA-F0-9]{64}$")
HANDLE_OK = re.compile(r"^[a-z0-9_]{1,15}$")   # X handle grammar (lowercased); keeps ':' out of the digest
IDENT_OK = re.compile(r"^[A-Za-z0-9:_-]+$")    # Cognito identityId charset (defense-in-depth vs raw DDB value)

# ── AWS CLIENTS ──────────────────────────────────────────────────────────────
session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
sm = session.client("secretsmanager")
table = session.resource("dynamodb").Table(USER_PROFILES_TABLE)


def load_bearer() -> str:
    raw = sm.get_secret_value(SecretId=SECRET_ID)["SecretString"]
    tok = json.loads(raw)["bearerToken"]
    if not tok:
        sys.exit("empty bearerToken in secret")
    return tok


def x_get(url: str, bearer: str):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, json.loads(r.read().decode())


def fetch_reposters(tid: str, bearer: str):
    """retweeted_by only (NO quote tweets), full pagination, deduped lowercase."""
    seen = {}  # lower -> display
    token = None
    page = 0
    while True:
        page += 1
        url = f"https://api.x.com/2/tweets/{tid}/retweeted_by?max_results=100"
        if token:
            url += f"&pagination_token={token}"
        body = None
        for attempt in range(4):
            try:
                _, body = x_get(url, bearer)
                break
            except urllib.error.HTTPError as e:
                retryable = e.code == 429 or 500 <= e.code < 600
                if retryable and attempt < 3:
                    wait = 30 * (attempt + 1)
                    print(f"    [http {e.code}] retry {tid} p{page} in {wait}s")
                    time.sleep(wait)
                    continue
                print(f"    [http {e.code}] {tid} p{page}: {e.read().decode()[:200]}")
                return list(seen.values()), False
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                if attempt < 3:
                    wait = 10 * (attempt + 1)
                    print(f"    [neterr] retry {tid} p{page} in {wait}s: {e}")
                    time.sleep(wait)
                    continue
                print(f"    [neterr] {tid} p{page}: {e}")
                return list(seen.values()), False
        if body is None:
            return list(seen.values()), False
        data = body.get("data", []) or []
        for u in data:
            h = u["username"]
            if h.lower() in ADMIN_EXCLUDE:
                continue
            seen[h.lower()] = h
        token = body.get("meta", {}).get("next_token")
        print(f"    page {page}: {len(data)} users, next={'yes' if token else 'no'}")
        if not token:
            break
        if page >= 100:   # safety bound; real tweets here have <100 reposters (single page)
            print(f"    WARNING: hit page cap (100) for {tid}, pagination stopped")
            return list(seen.values()), False
        time.sleep(1)
    return list(seen.values()), True


def lookup_identity(handle_lower: str):
    res = table.query(
        IndexName="twitterHandle-index",
        KeyConditionExpression=Key("twitterHandle").eq(handle_lower),
    )
    items = res.get("Items", [])
    if not items:
        return None
    best = items[0]
    for it in items:
        un = it.get("username")
        if un and not str(un).startswith("0x"):
            best = it
            break
    return best.get("identityId")


def resolve_target(primary_id: str):
    res = table.get_item(Key={"identityId": primary_id})
    profile = res.get("Item")
    if not profile:
        return None
    wa = profile.get("walletAddress")
    if wa:
        return (primary_id, str(wa).lower(), "top-level")
    nl = (profile.get("linkedAccounts") or {}).get("nasun wallet")
    if nl and nl.get("identityId") and nl.get("walletAddress"):
        return (nl["identityId"], str(nl["walletAddress"]).lower(), "linked-nasun-wallet")
    return None


def sqlq(s: str) -> str:
    return s.replace("'", "''")


def main(tweet_ids):
    if not tweet_ids:
        sys.exit("usage: repost-grant-emit.py <tweetId> [<tweetId> ...]")
    if any(not re.fullmatch(r"\d{15,25}", t) for t in tweet_ids):
        sys.exit("tweet IDs must be numeric snowflake IDs (parse them from the URLs first)")

    bearer = load_bearer()
    # token sanity check (rotation guard)
    try:
        st, _ = x_get(f"https://api.x.com/2/tweets/{tweet_ids[0]}", bearer)
        print(f"token check: HTTP {st}")
    except urllib.error.HTTPError as e:
        sys.exit(f"token check failed HTTP {e.code}: secret may have rotated again: {e.read().decode()[:200]}")

    sql_lines = ["-- repost bonus grants (generated locally, apply on box)", "BEGIN;"]
    grand = {"fetched": 0, "mapped": 0, "missing": 0, "no_wallet": 0,
             "toplevel": 0, "linked": 0, "errors": 0, "invalid": 0}

    for tid in tweet_ids:
        print(f"\n=== tweet {tid} ===")
        handles, ok = fetch_reposters(tid, bearer)
        if not ok:
            print(f"  WARNING: fetch incomplete for {tid}; review before applying")
        print(f"  reposters (admins excluded): {len(handles)}")
        grand["fetched"] += len(handles)
        mapped = missing = nowallet = errors = invalid = 0
        for h in handles:
            hl = h.lower()
            if not HANDLE_OK.fullmatch(hl):
                invalid += 1
                print(f"    [bad-handle] {h}")
                continue
            try:
                pid = lookup_identity(hl)
                tgt = resolve_target(pid) if pid else None
            except Exception as e:
                errors += 1
                print(f"    [lookup-error] {h}: {e}")
                continue
            if not pid:
                missing += 1
                continue
            if not tgt:
                nowallet += 1
                continue
            ident, wallet, src = tgt
            if not SUI_ADDR_OK.fullmatch(wallet) or not IDENT_OK.fullmatch(ident):
                nowallet += 1
                print(f"    [bad-value] {h}: wallet={wallet} ident={ident}")
                continue
            mapped += 1
            grand["toplevel" if src == "top-level" else "linked"] += 1
            digest = f"repost:{tid}:{hl}"
            sql_lines.append(
                "INSERT INTO activity_points "
                "(wallet_address, identity_id, tx_digest, category, activity_type, "
                "base_points, volume_tier, genesis_multiplier, final_points, "
                "tx_timestamp, event_seq, tx_sequence_number) VALUES "
                f"('{sqlq(wallet)}', '{sqlq(ident)}', '{sqlq(digest)}', "
                "'ecosystem-bonus-repost', 'x-repost', "
                f"{BONUS_POINTS}, 1.0, 1.0, {BONUS_POINTS}, "
                "NOW()::timestamptz, 0, 0) "
                "ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING;"
            )
        grand["mapped"] += mapped
        grand["missing"] += missing
        grand["no_wallet"] += nowallet
        grand["errors"] += errors
        grand["invalid"] += invalid
        accounted = mapped + missing + nowallet + errors + invalid
        if accounted != len(handles):
            print(f"  WARNING: {len(handles) - accounted} handles unaccounted for {tid}")
        print(f"  mapped={mapped}  missing={missing}  no-wallet={nowallet}  "
              f"errors={errors}  invalid={invalid}  pts={mapped * BONUS_POINTS}")

    # built-in verification: count after apply (was 0 before if dedup-checked).
    ids_in = ",".join(f"'{t}'" for t in tweet_ids)
    sql_lines.append("COMMIT;")
    sql_lines.append(
        "SELECT count(*) AS granted_rows, sum(final_points) AS total_points "
        "FROM activity_points WHERE category='ecosystem-bonus-repost' "
        f"AND split_part(tx_digest,':',2) IN ({ids_in});"
    )

    with open(OUT_SQL, "w") as f:
        f.write("\n".join(sql_lines) + "\n")

    print("\n========== DRY-RUN SUMMARY ==========")
    print(f"  tweets:                {len(tweet_ids)}")
    print(f"  reposters fetched:     {grand['fetched']} (sum across tweets, admins excluded)")
    print(f"  mapped (eligible):     {grand['mapped']}  (top-level {grand['toplevel']}, linked {grand['linked']})")
    print(f"  missing (no profile):  {grand['missing']}")
    print(f"  no wallet:             {grand['no_wallet']}")
    print(f"  lookup errors:         {grand['errors']}")
    print(f"  invalid handle:        {grand['invalid']}")
    print(f"  TOTAL POINTS TO AWARD: {grand['mapped'] * BONUS_POINTS}")
    print(f"  SQL written:           {OUT_SQL}  ({len([l for l in sql_lines if l.startswith('INSERT')])} INSERTs)")
    print("  No DB writes happened. Review, then apply on box (psql).")


if __name__ == "__main__":
    main(sys.argv[1:])
