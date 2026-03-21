---
name: leaderboard-export
description: 리더보드 참여자 및 X 연결 가입자 전체 목록을 클릭 가능한 HTML로 내보냅니다. 프로필 방문 추적, 색상 플래그(주황/노랑), Export 기능을 포함합니다. "리더보드 내보내기", "X 프로필 리스트", "leaderboard export" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD]"
---

# Leaderboard Export: X 프로필 HTML 생성

리더보드 참여자 및 나선 웹사이트 X 연결 가입자의 프로필을 클릭 가능한 HTML로 내보냅니다.

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| (없음) | 최신 리더보드 스냅샷 기준으로 생성 |
| `YYYY-MM-DD` | 해당 날짜의 스냅샷 기준으로 생성 |

## 실행

아래 Python 스크립트를 Bash로 실행합니다. `$SNAPSHOT_DATE` 변수를 인자에 맞게 설정하세요 (없으면 빈 문자열).

```bash
SNAPSHOT_DATE="$ARGUMENTS 에서 YYYY-MM-DD 추출, 없으면 빈 문자열"
```

```python
import json, subprocess, os, sys
from datetime import datetime

SNAPSHOT_DATE = os.environ.get('SNAPSHOT_DATE', '').strip()
DOCS_DIR = '/home/naru/my_apps/nasun-monorepo/apps/nasun-website/docs'
API_URL = 'https://auzo707xql.execute-api.ap-northeast-2.amazonaws.com/prod/v3/leaderboard'
AWS_PROFILE = 'nasun-prod'
AWS_REGION = 'ap-northeast-2'

def aws_scan_all(table, projection, filter_expr=None, expr_names=None):
    """Paginated DynamoDB scan via AWS CLI."""
    items = []
    start_key = None
    while True:
        cmd = [
            'aws', 'dynamodb', 'scan',
            '--table-name', table,
            '--profile', AWS_PROFILE,
            '--region', AWS_REGION,
            '--projection-expression', projection,
        ]
        if filter_expr:
            cmd += ['--filter-expression', filter_expr]
        if expr_names:
            cmd += ['--expression-attribute-names', json.dumps(expr_names)]
        if start_key:
            cmd += ['--exclusive-start-key', json.dumps(start_key)]
        result = json.loads(subprocess.check_output(cmd))
        items.extend(result.get('Items', []))
        start_key = result.get('LastEvaluatedKey')
        if not start_key:
            break
    return items

def dynamo_str(item, key):
    return (item.get(key) or {}).get('S', '')

def dynamo_num(item, key):
    try:
        return int((item.get(key) or {}).get('N', '0'))
    except:
        return 0

# ── Step 1: Fetch leaderboard top 500 ──
params = f'limit=500'
if SNAPSHOT_DATE:
    params += f'&snapshotDate={SNAPSHOT_DATE}'
lb_json = json.loads(subprocess.check_output(['curl', '-s', f'{API_URL}?{params}']))

entries = lb_json.get('entries', [])
if not entries:
    print(f'ERROR: No leaderboard data found' + (f' for {SNAPSHOT_DATE}' if SNAPSHOT_DATE else ''))
    sys.exit(1)

season_name = lb_json.get('season', {}).get('name', 'Season')
snapshot_date = lb_json.get('snapshotDate') or datetime.now().strftime('%Y-%m-%d')
total_lb = lb_json.get('totalCount', len(entries))
print(f'Leaderboard: {total_lb} entries, season={season_name}, date={snapshot_date}')

# Build top 500 username set (lowercase for dedup)
top500_usernames = set()
top500_list = []
for e in entries:
    username = e.get('originalUsername') or e.get('username', '')
    top500_usernames.add(username.lower())
    top500_list.append(username)

# ── Step 2: Scan UserProfiles for X-linked registered users ──
print('Scanning UserProfiles...')
user_items = aws_scan_all(
    'UserProfiles',
    'twitterHandle, originalTwitterHandle, createdAt, linkedToPrimaryId',
    'attribute_exists(twitterHandle) AND attribute_not_exists(linkedToPrimaryId)',
)
print(f'UserProfiles: {len(user_items)} X-linked primary accounts')

# ── Step 3: Scan leaderboard accounts for postCount ──
print('Scanning leaderboard accounts...')
account_items = aws_scan_all(
    'leaderboard-v3-accounts',
    'username, originalUsername, postCount, platform',
)
# Build username -> postCount map (lowercase key)
post_count_map = {}
original_name_map = {}
for item in account_items:
    u = dynamo_str(item, 'username')
    if u:
        post_count_map[u.lower()] = dynamo_num(item, 'postCount')
        orig = dynamo_str(item, 'originalUsername')
        if orig:
            original_name_map[u.lower()] = orig
print(f'Accounts: {len(post_count_map)} entries with postCount data')

# ── Step 4: Build section 2 list (exclude top 500) ──
section2 = []
for item in user_items:
    handle = dynamo_str(item, 'twitterHandle')
    if not handle or handle.lower() in top500_usernames:
        continue
    orig_handle = dynamo_str(item, 'originalTwitterHandle') or original_name_map.get(handle.lower()) or handle
    post_count = post_count_map.get(handle.lower(), 0)
    created_at = dynamo_str(item, 'createdAt')
    section2.append({
        'username': orig_handle,
        'postCount': post_count,
        'createdAt': created_at,
    })

# Sort: postCount > 0 first (desc), then postCount == 0 by createdAt (asc)
has_posts = sorted([x for x in section2 if x['postCount'] > 0], key=lambda x: -x['postCount'])
no_posts = sorted([x for x in section2 if x['postCount'] == 0], key=lambda x: x['createdAt'] or 'z')
section2_sorted = has_posts + no_posts
print(f'Section 2: {len(section2_sorted)} X-linked users (excl. top 500)')

# ── Step 5: Load flag files ──
def load_flags(path):
    flags = set()
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                u = line.strip()
                if u:
                    flags.add(u.lower())
    return flags

orange_flags = load_flags(f'{DOCS_DIR}/flagged-orange.txt')
yellow_flags = load_flags(f'{DOCS_DIR}/flagged-yellow.txt')
print(f'Flags: {len(orange_flags)} orange, {len(yellow_flags)} yellow')

# ── Step 6: Generate HTML ──
def get_flag_class(username):
    u = username.lower()
    if u in orange_flags:
        return 'flag-orange'
    if u in yellow_flags:
        return 'flag-yellow'
    return ''

def make_li(username, flag_class=''):
    cls = f' class="{flag_class}"' if flag_class else ''
    flag_attr = 'orange' if flag_class == 'flag-orange' else 'yellow' if flag_class == 'flag-yellow' else ''
    df_attr = f' data-flag="{flag_attr}"' if flag_attr else ''
    return (
        f'<li{cls}{df_attr}>'
        f'<span class="flags"><button class="fb fo" title="Orange flag">O</button>'
        f'<button class="fb fy" title="Yellow flag">Y</button></span>'
        f'<input type="checkbox" class="chk">'
        f'<a href="https://x.com/{username}" target="_blank" rel="noopener">@{username}</a>'
        f'</li>'
    )

lines = []
# Section 1
for username in top500_list:
    fc = get_flag_class(username)
    lines.append(make_li(username, fc))

# Section 2
for item in section2_sorted:
    fc = get_flag_class(item['username'])
    lines.append(make_li(item['username'], fc))

divider_after = len(top500_list)

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Nasun {season_name} Leaderboard - X Profiles ({snapshot_date})</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; background: #fafafa; color: #333; }}
  h1 {{ font-size: 1.3rem; border-bottom: 2px solid #1da1f2; padding-bottom: 8px; }}
  h2 {{ font-size: 1.1rem; color: #666; margin-top: 32px; }}
  p.meta {{ color: #666; font-size: 0.85rem; margin-bottom: 24px; }}
  .toolbar {{ margin-bottom: 16px; }}
  .toolbar button {{ padding: 6px 14px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 0.85rem; }}
  .toolbar button:hover {{ background: #f0f0f0; }}
  .divider {{ border: none; border-top: 2px dashed #ccc; margin: 32px 0; }}
  ol {{ padding-left: 120px; line-height: 2.2; }}
  li {{ padding: 2px 4px; border-radius: 3px; position: relative; }}
  li.flag-orange {{ background-color: #fff3e0; border-left: 3px solid #ff9900; padding-left: 8px; }}
  li.flag-yellow {{ background-color: #fffde7; border-left: 3px solid #fdd835; padding-left: 8px; }}
  .chk {{ margin-right: 10px; vertical-align: middle; cursor: pointer; }}
  .flags {{ position: absolute; right: calc(100% + 48px); top: 0; white-space: nowrap; }}
  .fb {{ border: none; background: none; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 22px; height: 22px; border-radius: 3px; margin-left: 4px; vertical-align: middle; opacity: 0.35; }}
  .fb:hover {{ opacity: 1; }}
  .fo {{ color: #cc7a00; }}
  .fy {{ color: #b8960f; }}
  li.flag-orange .fo, li.flag-yellow .fy {{ opacity: 1; }}
  a {{ color: #1da1f2; text-decoration: none; }}
  a.clicked {{ color: #999; }}
  a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<h1>Nasun {season_name} - X Profiles</h1>
<p class="meta">Snapshot: {snapshot_date} | Leaderboard: {total_lb} | X-linked registered: {len(section2_sorted)} | Total: {total_lb + len(section2_sorted)}</p>
<div class="toolbar">
  <button id="exportBtn">Export Progress</button>
  <span id="stats" style="margin-left:12px;font-size:0.8rem;color:#999;"></span>
</div>
<h2>Leaderboard Top {total_lb}</h2>
<ol>
'''

for i, li in enumerate(lines):
    html += li + '\n'
    if i + 1 == divider_after:
        html += f'</ol>\n<hr class="divider">\n<h2>X-Linked Registered Users ({len(section2_sorted)})</h2>\n<ol start="{divider_after + 1}">\n'

html += '''</ol>
<script>
const CK = 'nasun-lb-clicked';
const FK = 'nasun-lb-flags';
const clicked = new Set(JSON.parse(localStorage.getItem(CK) || '[]'));
const flagOverrides = JSON.parse(localStorage.getItem(FK) || '{}');

function applyFlag(li, flag) {
  li.classList.remove('flag-orange', 'flag-yellow');
  if (flag) li.classList.add('flag-' + flag);
  li.dataset.flag = flag || '';
}

function updateStats() {
  const all = document.querySelectorAll('li');
  const checked = document.querySelectorAll('.chk:checked').length;
  document.getElementById('stats').textContent = `Checked: ${checked}/${all.length}`;
}

document.querySelectorAll('li').forEach(li => {
  const chk = li.querySelector('.chk');
  const link = li.querySelector('a');
  const href = link?.href || '';
  const username = href.split('/').pop()?.toLowerCase();

  // Restore flags from localStorage overrides
  if (username && flagOverrides[username] !== undefined) {
    applyFlag(li, flagOverrides[username]);
  }

  // Restore clicked state
  if (clicked.has(href)) {
    link.classList.add('clicked');
    chk.checked = true;
  }

  // Link click
  link?.addEventListener('click', () => {
    link.classList.add('clicked');
    chk.checked = true;
    clicked.add(href);
    localStorage.setItem(CK, JSON.stringify([...clicked]));
    updateStats();
  });

  // Checkbox toggle
  chk?.addEventListener('change', () => {
    if (chk.checked) {
      clicked.add(href);
      link.classList.add('clicked');
    } else {
      clicked.delete(href);
      link.classList.remove('clicked');
    }
    localStorage.setItem(CK, JSON.stringify([...clicked]));
    updateStats();
  });

  // Flag buttons
  li.querySelector('.fo')?.addEventListener('click', () => {
    const current = li.dataset.flag;
    const next = current === 'orange' ? '' : 'orange';
    applyFlag(li, next);
    flagOverrides[username] = next;
    localStorage.setItem(FK, JSON.stringify(flagOverrides));
  });
  li.querySelector('.fy')?.addEventListener('click', () => {
    const current = li.dataset.flag;
    const next = current === 'yellow' ? '' : 'yellow';
    applyFlag(li, next);
    flagOverrides[username] = next;
    localStorage.setItem(FK, JSON.stringify(flagOverrides));
  });
});

updateStats();

// Export: download current state as new HTML
document.getElementById('exportBtn').addEventListener('click', () => {
  const clone = document.documentElement.cloneNode(true);
  // Bake checkbox states
  clone.querySelectorAll('.chk').forEach((chk, i) => {
    const orig = document.querySelectorAll('.chk')[i];
    if (orig.checked) chk.setAttribute('checked', '');
    else chk.removeAttribute('checked');
  });
  // Bake flag states
  clone.querySelectorAll('li').forEach((li, i) => {
    const origLi = document.querySelectorAll('li')[i];
    li.className = origLi.className;
    li.dataset.flag = origLi.dataset.flag || '';
  });
  // Bake clicked link states
  clone.querySelectorAll('a').forEach((a, i) => {
    const origA = document.querySelectorAll('ol a')[i];
    if (origA?.classList.contains('clicked')) a.classList.add('clicked');
  });
  const blob = new Blob(['<!DOCTYPE html>\\n' + clone.outerHTML], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'x-profiles-exported-' + new Date().toISOString().slice(0,10) + '.html';
  a.click();
  URL.revokeObjectURL(url);
});
</script>
</body>
</html>'''

out_file = f'{DOCS_DIR}/x-leaderboard-profiles-{snapshot_date}.html'
with open(out_file, 'w') as f:
    f.write(html)

print(f'''
Export complete:
  Season: {season_name}
  Snapshot: {snapshot_date}
  Section 1 (Leaderboard): {total_lb}
  Section 2 (X-linked registered): {len(section2_sorted)}
  Flags: {len(orange_flags)} orange, {len(yellow_flags)} yellow
  File: {out_file}
''')
```

위 Python 스크립트를 Bash 도구로 실행합니다:

```bash
SNAPSHOT_DATE="..." python3 << 'PYEOF'
# (위 Python 스크립트 전체)
PYEOF
```

## 주의사항

- `--profile nasun-prod` 로 프로덕션 DynamoDB에 접근합니다 (read-only, 데이터 변경 없음)
- UserProfiles 테이블은 ~5000건, accounts는 ~900건이므로 full scan이 안전합니다
- `flagged-orange.txt`, `flagged-yellow.txt` 파일이 없으면 플래그 없이 정상 생성됩니다
- localStorage 키: `nasun-lb-clicked` (방문 추적), `nasun-lb-flags` (플래그 변경)
