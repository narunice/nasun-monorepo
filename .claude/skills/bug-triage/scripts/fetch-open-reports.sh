#!/usr/bin/env bash
# Stage 1: fetch open bug reports, cluster (no LLM), rank, print summary.
# Zero LLM tokens consumed by this script.

set -euo pipefail

PROFILE="${AWS_PROFILE_OVERRIDE:-nasun-prod}"
REGION="${AWS_REGION:-ap-northeast-2}"
TABLE="nasun-bug-reports"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/cache"
mkdir -p "$CACHE_DIR"
OUT_RAW="$CACHE_DIR/open-reports.json"
OUT_CLUSTERS="$CACHE_DIR/clusters.json"

echo "[fetch] querying status-index for open reports (new, investigating)..."

# Query the GSI for each open status separately (GSI PK is 'status').
: > "$OUT_RAW.tmp"
for STATUS in new investigating; do
  aws dynamodb query \
    --profile "$PROFILE" --region "$REGION" \
    --table-name "$TABLE" \
    --index-name "status-index" \
    --key-condition-expression "#s = :st" \
    --expression-attribute-names '{"#s":"status","#ts":"timestamp"}' \
    --expression-attribute-values "{\":st\":{\"S\":\"$STATUS\"}}" \
    --projection-expression "reportId,#ts,title,category,#s,walletAddress,createdAt,identityId" \
    --output json >> "$OUT_RAW.tmp" || true
done

python3 - "$OUT_RAW.tmp" "$OUT_RAW" "$OUT_CLUSTERS" <<'PY'
import json, sys, re, hashlib, datetime, collections, math

raw_path, out_raw, out_clusters = sys.argv[1], sys.argv[2], sys.argv[3]

# Merge multiple query outputs.
items = []
with open(raw_path) as f:
    buf = ""
    for line in f:
        buf += line
# Split concatenated JSON documents.
docs = []
decoder = json.JSONDecoder()
idx = 0
s = buf.strip()
while idx < len(s):
    while idx < len(s) and s[idx].isspace():
        idx += 1
    if idx >= len(s): break
    obj, end = decoder.raw_decode(s, idx)
    docs.append(obj)
    idx = end

for d in docs:
    items.extend(d.get("Items", []))

def unwrap(v):
    if v is None: return None
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    return v

reports = []
for it in items:
    r = {k: unwrap(v) for k, v in it.items()}
    reports.append(r)

with open(out_raw, "w") as f:
    json.dump(reports, f, indent=2, ensure_ascii=False)

# --- Non-LLM clustering: category + title keyword bag ---
STOPWORDS = set("""the a an is are was were be been being of to in on at for and or not no do does did have has had it this that these those i you we they my your our their mine yours ours theirs me us them when where what why how with as by from into about over under again still just only too very can could would should may might must will shall into through during before after above below between inputs input error errors bug issue problem please when happens happen happened works work working doesn't doesnt don't dont isn't isnt""".split())

def keyset(title):
    t = (title or "").lower()
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    toks = [w for w in t.split() if len(w) > 2 and w not in STOPWORDS]
    return toks[:8]

def cluster_key(cat, toks):
    core = "|".join(sorted(set(toks[:4])))
    return f"{cat or 'Other'}::{core}" if core else f"{cat or 'Other'}::_misc"

SEVERITY = {"Security": 5, "Wallet Issue": 4, "Performance": 3, "UI Bug": 2, "Other": 1.5, "Feedback": 1.5, "Feature Request": 1}
def sev(cat): return SEVERITY.get(cat, 1.5)

def recency_factor(ts):
    if not ts: return 0.5
    try:
        dt = datetime.datetime.fromisoformat(ts.replace("Z","+00:00"))
        days = (datetime.datetime.now(datetime.timezone.utc) - dt).days
        if days <= 7: return 1.0
        if days <= 30: return 0.7
        return 0.4
    except Exception:
        return 0.5

clusters = {}
for r in reports:
    toks = keyset(r.get("title"))
    key = cluster_key(r.get("category"), toks)
    clusters.setdefault(key, {"category": r.get("category"), "keywords": toks[:4], "reports": []})
    clusters[key]["reports"].append(r)

ranked = []
for key, c in clusters.items():
    freq = len(c["reports"])
    recencies = [recency_factor(r.get("timestamp") or r.get("createdAt")) for r in c["reports"]]
    rec = max(recencies) if recencies else 0.5
    score = sev(c["category"]) * math.log2(1 + freq) * rec
    ranked.append({
        "cluster_id": hashlib.sha1(key.encode()).hexdigest()[:8],
        "key": key,
        "category": c["category"],
        "keywords": c["keywords"],
        "size": freq,
        "priority_score": round(score, 3),
        "sample_title": c["reports"][0].get("title"),
        "reports": [
            {
                "reportId": r.get("reportId"),
                "timestamp": r.get("timestamp"),
                "title": r.get("title"),
                "hasWallet": bool(r.get("walletAddress")),
                "status": r.get("status"),
            } for r in c["reports"]
        ],
    })

ranked.sort(key=lambda x: -x["priority_score"])

with open(out_clusters, "w") as f:
    json.dump(ranked, f, indent=2, ensure_ascii=False)

# Summary table
print(f"\n[fetch] total open reports: {len(reports)}, clusters: {len(ranked)}\n")
print(f"{'#':>3}  {'id':<8}  {'score':>6}  {'n':>3}  {'category':<16}  title")
print("-" * 90)
for i, c in enumerate(ranked[:30], 1):
    cat = (c["category"] or "-")[:16]
    title = (c["sample_title"] or "")[:48]
    print(f"{i:>3}  {c['cluster_id']:<8}  {c['priority_score']:>6}  {c['size']:>3}  {cat:<16}  {title}")

print(f"\n[fetch] raw:      {out_raw}")
print(f"[fetch] clusters: {out_clusters}")
PY

rm -f "$OUT_RAW.tmp"
