---
name: repost-bonus
description: 나선 공식 X 계정 게시물을 리포스트한 사용자들에게 ecosystem-bonus-repost 카테고리로 3포인트를 지급합니다. 트윗 URL/ID만 받으면 X API로 리포스터를 자동 fetch하여 dry-run 확인 후 실행합니다. "repost 보너스", "리포스트 포인트 지급", "repost-bonus" 등의 요청에 사용합니다.
argument-hint: "[tweet URL or ID]"
---

# Repost Bonus: 리포스트 사용자 포인트 지급

## 개요

트윗 URL 또는 ID를 받아 X API로 리포스터를 자동 조회한 뒤, `activity_points` 테이블에
`ecosystem-bonus-repost` 카테고리로 3pt를 지급합니다.

- 스크립트: `apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts`
- tx_digest 형식: `repost:{tweetId}:{xHandle}` (idempotent, 같은 트윗+핸들 중복 지급 자동 차단)
- 실행 위치: prod node-3 (`ubuntu@54.180.61.196`, key `~/.ssh/.awskey/nasun-devnet-key.pem`)
  - 로컬에는 POINTS_DATABASE_URL이 없으므로 반드시 node-3에서 실행

---

## 실행 절차

### 1단계: 트윗 ID 파싱

`$ARGUMENTS`에서 트윗 ID 추출:
- `https://x.com/.../status/{id}` URL → 숫자 부분
- 직접 제공된 숫자 ID도 OK
- URL/ID가 없으면 사용자에게 묻고 중단

### 2단계: X API Bearer Token 로드

```bash
BEARER=$(aws --profile nasun-prod secretsmanager get-secret-value \
  --secret-id pado/x-api-bearer-token --region ap-northeast-2 \
  --query SecretString --output text \
  | python3 -c "import sys,json;d=sys.stdin.read();
try:
  v=json.loads(d); print(v.get('bearerToken') or v.get('BEARER_TOKEN') or v.get('bearer_token') or list(v.values())[0])
except: print(d.strip())")
echo "$BEARER" > /tmp/.xbearer && chmod 600 /tmp/.xbearer
```

### 3단계: 리포스터 자동 조회 (페이지네이션 포함)

`/2/tweets/:id/retweeted_by` 엔드포인트는 한 페이지당 100명 cap.
`next_token`이 있으면 끝까지 페이지네이션해서 합치고, dedupe.

**quote tweet은 보너스 대상이 아니므로 절대 포함하지 말 것.** (only retweeted_by)

```bash
TID=<tweet_id>
BEARER=$(cat /tmp/.xbearer)
rm -f /tmp/rt_*.json
TOK=""; PAGE=0
while :; do
  PAGE=$((PAGE+1))
  URL="https://api.x.com/2/tweets/$TID/retweeted_by?max_results=100"
  [ -n "$TOK" ] && URL="$URL&pagination_token=$TOK"
  curl -s "$URL" -H "Authorization: Bearer $BEARER" -o /tmp/rt_$PAGE.json
  TOK=$(python3 -c "import json;print(json.load(open('/tmp/rt_$PAGE.json')).get('meta',{}).get('next_token',''))")
  CNT=$(python3 -c "import json;print(len(json.load(open('/tmp/rt_$PAGE.json')).get('data',[])))")
  echo "page $PAGE: $CNT users, next=$TOK"
  [ -z "$TOK" ] || [ "$CNT" = "0" ] && break
done
```

합쳐서 dedupe + 관리자 계정(@nasun_io, @naru010110, @overclocksalmon) case-insensitive 제외:

```bash
python3 <<'EOF' > /tmp/handles_clean.txt
import json, glob
excluded = {'nasun_io','naru010110','overclocksalmon'}
seen = {}
for f in sorted(glob.glob('/tmp/rt_*.json')):
    for u in json.load(open(f)).get('data', []):
        h = u['username']
        if h.lower() in excluded: continue
        seen[h.lower()] = h
print(' '.join('@'+h for h in sorted(seen.values(), key=str.lower)))
EOF
wc -w /tmp/handles_clean.txt
```

### 4단계: 스크립트 업데이트

`apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts`의
`TWEET_ID`와 `RAW_INPUT`을 업데이트:

```python
python3 <<EOF
import re
p = '/home/naru/my_apps/nasun-monorepo/apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts'
tid = '<TWEET_ID>'
handles = open('/tmp/handles_clean.txt').read().strip()
s = open(p).read()
s = re.sub(r"const TWEET_ID = '[^']*';", f"const TWEET_ID = '{tid}';", s, count=1)
s = re.sub(r'const RAW_INPUT = \`[\s\S]*?\`;',
          f'const RAW_INPUT = \`\n{handles}\n\`;', s, count=1)
open(p,'w').write(s)
EOF
```

### 5단계: node-3로 scp 후 dry-run

```bash
scp -i ~/.ssh/.awskey/nasun-devnet-key.pem \
  /home/naru/my_apps/nasun-monorepo/apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts \
  ubuntu@54.180.61.196:~/explorer-api/src/scripts/grant-repost-bonus.ts

ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
  'cd ~/explorer-api && set -a && source .env && set +a && npx tsx src/scripts/grant-repost-bonus.ts'
```

> `AWS_PROFILE=nasun-prod`는 붙이지 않는다. node-3 기본 credential에서 동작.

dry-run 결과 보고:
- 추출된 핸들 수 (X API 페이지네이션 총합)
- Mapped (top-level + linked wallet) / Missing / No-wallet
- 지급 예정 총 포인트

### 6단계: 사용자 승인 후 execute

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
  'cd ~/explorer-api && set -a && source .env && set +a && npx tsx src/scripts/grant-repost-bonus.ts --execute'
```

Inserted / Skipped 카운트 보고. tx_digest 멱등 처리로 동일 트윗 재실행 시 자동 skip.

---

## 주의사항

- **X API 페이지네이션 끝까지 돌릴 것.** 100명 cap에서 멈추면 사일런트 누락. `next_token` 없거나 `result_count=0`이면 종료.
- **Quote tweet은 포함하지 않는다.** 리포스트 보너스 대상이 아님.
- **관리자 계정 제외**: @nasun_io, @naru010110, @overclocksalmon (case-insensitive).
- **로컬 실행 금지**: POINTS_DATABASE_URL이 없으므로 반드시 node-3에서 실행.
- **AWS_PROFILE 미지정**: node-3는 IAM 또는 기본 credential 사용. `AWS_PROFILE=nasun-prod`로 실행 시 lookup error 44건 발생함.
- **TWEET_ID가 다르면 같은 핸들도 별도 tx_digest**로 처리됨 (다른 트윗 리포스트 = 별도 보너스 가능).
- Missing 사용자는 나선 미가입이므로 skip. no-wallet은 지갑 미연결.
- 실행 후 사용자들은 my-account Updates 캐러셀에서 파란색 "Repost Bonus" 카드로 수령 확인 가능.
