#!/usr/bin/env bash
# Stage 3: apply approved resolutions by invoking the bug-report-admin Lambda directly.
# Reads drafts/pending.json entries that have { "approved": true } and not yet applied.
# Writes cache/applied.json on success (idempotency at skill level).
#
# Env:
#   APPLY_DRY_RUN=1  (default)  - print payloads, do not invoke
#   APPLY_DRY_RUN=0             - actually invoke Lambda
#   BUG_ADMIN_FN                 - Lambda function name (required when not dry-run)
#   ADMIN_SUB                    - admin Cognito sub for requestContext.authorizer (required when not dry-run)

set -euo pipefail

PROFILE="${AWS_PROFILE_OVERRIDE:-nasun-prod}"
REGION="${AWS_REGION:-ap-northeast-2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PENDING="$ROOT/drafts/pending.json"
APPLIED="$ROOT/cache/applied.json"
LEDGER="$ROOT/cache/budget-ledger.jsonl"
DRY="${APPLY_DRY_RUN:-1}"

if [[ ! -f "$PENDING" ]]; then
  echo "[apply] $PENDING not found. Run Stage 3 draft generation first." >&2
  exit 1
fi

[[ -f "$APPLIED" ]] || echo '{}' > "$APPLIED"

if [[ "$DRY" == "0" ]]; then
  : "${BUG_ADMIN_FN:?set BUG_ADMIN_FN to the admin Lambda function name}"
  : "${ADMIN_IDENTITY_ID:?set ADMIN_IDENTITY_ID to the admin Cognito identityId (role=ADMIN in UserProfiles)}"
fi

python3 - "$PENDING" "$APPLIED" "$DRY" "$PROFILE" "$REGION" "${BUG_ADMIN_FN:-}" "${ADMIN_IDENTITY_ID:-}" "$LEDGER" <<'PY'
import json, sys, subprocess, base64, datetime, os

pending_path, applied_path, dry, profile, region, fn, admin_id, ledger = sys.argv[1:9]
dry = dry != "0"

pending = json.load(open(pending_path))
applied = json.load(open(applied_path))

ok, skip, fail = 0, 0, 0
for item in pending:
    rid = item["reportId"]
    if not item.get("approved"):
        skip += 1; continue
    if applied.get(rid, {}).get("applied"):
        skip += 1; continue
    body = {
        "timestamp": item["timestamp"],
        "status": item["status"],
        "adminNote": item["adminNote"],
        "bonusPoints": int(item["bonusPoints"]),
    }
    event = {
        "httpMethod": "PATCH",
        "path": f"/admin/bug-reports/{rid}",
        "pathParameters": {"reportId": rid},
        "body": json.dumps(body),
        "requestContext": {"authorizer": {"identityId": admin_id}},
    }
    payload = json.dumps(event)
    if dry:
        print(f"[dry] {rid}  status={body['status']}  pts={body['bonusPoints']}")
        print(f"       note: {body['adminNote'][:80]}...")
        continue

    # Invoke Lambda
    out = f"/tmp/bug-triage-{rid}.json"
    cmd = [
        "aws", "lambda", "invoke",
        "--profile", profile, "--region", region,
        "--function-name", fn,
        "--cli-binary-format", "raw-in-base64-out",
        "--payload", payload,
        out,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        resp = json.load(open(out))
        if resp.get("statusCode") == 200:
            ok += 1
            applied[rid] = {"applied": True, "at": datetime.datetime.utcnow().isoformat() + "Z", "bonusPoints": body["bonusPoints"], "status": body["status"]}
            print(f"[ok]  {rid}  pts={body['bonusPoints']}")
        else:
            fail += 1
            print(f"[FAIL] {rid}  statusCode={resp.get('statusCode')}  body={resp.get('body','')[:200]}")
    except subprocess.CalledProcessError as e:
        fail += 1
        print(f"[FAIL] {rid}  {e.stderr.decode()[:200]}")

json.dump(applied, open(applied_path, "w"), indent=2)

with open(ledger, "a") as f:
    f.write(json.dumps({"ts": datetime.datetime.utcnow().isoformat()+"Z", "stage": "apply", "dry": dry, "ok": ok, "skip": skip, "fail": fail}) + "\n")

print(f"\n[apply] ok={ok} skip={skip} fail={fail} (dry_run={dry})")
PY
