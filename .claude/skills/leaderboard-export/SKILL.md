---
name: leaderboard-export
description: 리더보드 참여자 및 X 연결 가입자 전체 목록을 클릭 가능한 HTML로 내보냅니다. 5개 섹션(Top 500, Posts, Registered, Yellow, Orange) 분류, 프로필 방문 추적, 색상 플래그(Green/Orange/Yellow), Export 기능을 포함합니다. "리더보드 내보내기", "X 프로필 리스트", "leaderboard export" 등의 요청에 사용합니다.
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
import json, subprocess, os, sys, html as html_mod
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

# Build top 500 data: rank -> username
top500_map = {}  # lowercase -> {username, rank}
top500_ordered = []
for i, e in enumerate(entries):
    username = e.get('originalUsername') or e.get('username', '')
    rank = i + 1
    top500_map[username.lower()] = {'username': username, 'rank': rank}
    top500_ordered.append({'username': username, 'rank': rank})

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

# ── Step 4: Build non-top500 user list ──
non_top500 = []
for item in user_items:
    handle = dynamo_str(item, 'twitterHandle')
    if not handle or handle.lower() in top500_map:
        continue
    orig_handle = dynamo_str(item, 'originalTwitterHandle') or original_name_map.get(handle.lower()) or handle
    post_count = post_count_map.get(handle.lower(), 0)
    created_at = dynamo_str(item, 'createdAt')
    non_top500.append({
        'username': orig_handle,
        'postCount': post_count,
        'createdAt': created_at,
    })

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
green_flags = load_flags(f'{DOCS_DIR}/flagged-green.txt')
print(f'Flags: {len(orange_flags)} orange, {len(yellow_flags)} yellow, {len(green_flags)} green')

def get_flag(username):
    u = username.lower()
    if u in orange_flags:
        return 'orange'
    if u in yellow_flags:
        return 'yellow'
    if u in green_flags:
        return 'green'
    return ''

def get_section_origin(username):
    """Determine which section a user would belong to without flags."""
    u = username.lower()
    if u in top500_map:
        return 'lb'
    if post_count_map.get(u, 0) > 0:
        return 'posts'
    return 'reg'

# ── Step 6: Classify users into 5 sections ──
s1, s2, s3, s4, s5 = [], [], [], [], []

# Top 500
for item in top500_ordered:
    flag = get_flag(item['username'])
    entry = {**item, 'flag': flag, 'section': 'lb'}
    if flag == 'orange':
        s5.append(entry)
    elif flag == 'yellow':
        s4.append(entry)
    else:
        s1.append(entry)

# Non-top500
for item in non_top500:
    flag = get_flag(item['username'])
    entry = {**item, 'flag': flag, 'section': 'posts' if item['postCount'] > 0 else 'reg'}
    if flag == 'orange':
        s5.append(entry)
    elif flag == 'yellow':
        s4.append(entry)
    elif item['postCount'] > 0:
        s2.append(entry)
    else:
        s3.append(entry)

# Sort sections
# S1: already in leaderboard rank order
s2.sort(key=lambda x: -x['postCount'])
s3.sort(key=lambda x: x.get('createdAt') or 'z')
# S4/S5: section origin first (lb=0, posts=1, reg=2), then alphabetical
origin_order = {'lb': 0, 'posts': 1, 'reg': 2}
s4.sort(key=lambda x: (origin_order.get(x['section'], 9), x['username'].lower()))
s5.sort(key=lambda x: (origin_order.get(x['section'], 9), x['username'].lower()))

total_users = len(s1) + len(s2) + len(s3) + len(s4) + len(s5)
print(f'Sections: S1={len(s1)}, S2={len(s2)}, S3={len(s3)}, S4(yellow)={len(s4)}, S5(orange)={len(s5)}, total={total_users}')

# ── Step 7: Generate HTML ──
def esc(s):
    return html_mod.escape(s)

def section_tag_html(section):
    labels = {'lb': 'LB', 'posts': 'Posts', 'reg': 'Reg'}
    return f'<span class="section-tag">[{labels.get(section, "?")}]</span>'

def make_li(entry, show_tag=False):
    username = entry['username']
    flag = entry.get('flag', '')
    section = entry.get('section', '')
    flag_attr = f' data-flag="{esc(flag)}"' if flag else ' data-flag=""'
    section_attr = f' data-section="{esc(section)}"'
    tag = section_tag_html(section) if show_tag and section else ''
    return (
        f'<li{flag_attr}{section_attr}>'
        f'<button class="fb fg green-btn" title="Green (KOL)">G</button>'
        f'<div class="row">'
        f'<input type="checkbox" class="chk">'
        f'<a href="https://x.com/{esc(username)}" target="_blank" rel="noopener">@{esc(username)}</a>'
        f'{tag}'
        f'<span class="flag-btns">'
        f'<button class="fb fo" title="Orange flag">O</button>'
        f'<button class="fb fy" title="Yellow flag">Y</button>'
        f'</span>'
        f'</div>'
        f'</li>'
    )

# Build HTML
css = '''
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #fafafa; color: #333; }
  h1 { font-size: 1.3rem; border-bottom: 2px solid #1da1f2; padding-bottom: 8px; }
  h2 { font-size: 1.1rem; color: #666; margin-top: 32px; }
  p.meta { color: #666; font-size: 0.85rem; margin-bottom: 24px; }
  .toolbar { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar button { padding: 6px 14px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 0.85rem; }
  .toolbar button:hover { background: #f0f0f0; }
  .divider { border: none; border-top: 2px dashed #ccc; margin: 32px 0; }
  ol { padding-left: 140px; line-height: 2.4; }
  li { padding: 2px 4px; border-radius: 3px; position: relative; }
  .row { display: flex; align-items: center; max-width: 250px; }
  .chk { margin-right: 8px; cursor: pointer; flex-shrink: 0; }
  .row a { color: #1da1f2; text-decoration: none; white-space: nowrap; }
  .row a:hover { text-decoration: underline; }
  .row a.clicked { color: #999; }
  .flag-btns { margin-left: auto; display: flex; gap: 3px; flex-shrink: 0; }
  .section-tag { font-size: 0.7rem; color: #999; margin-left: 6px; flex-shrink: 0; }
  /* Flag buttons */
  .fb { border: 2px solid; border-radius: 3px; background: transparent; cursor: pointer; font-size: 0.7rem; font-weight: bold; width: 22px; height: 22px; opacity: 0.5; display: flex; align-items: center; justify-content: center; }
  .fb:hover { opacity: 1; }
  .fg { border-color: #1b5e20; color: #1b5e20; }
  .fo { border-color: #e65100; color: #e65100; }
  .fy { border-color: #f9a825; color: #f9a825; }
  .green-btn { position: absolute; left: -70px; top: 50%; transform: translateY(-50%); }
  li[data-flag="green"] .fg { opacity: 1; background: #c8e6c9; }
  li[data-flag="orange"] .fo { opacity: 1; background: #ffe0b2; }
  li[data-flag="yellow"] .fy { opacity: 1; background: #fff9c4; }
  li[data-flag="green"] { background-color: #e8f5e9; border-left: 3px solid #1b5e20; padding-left: 8px; }
  li[data-flag="orange"] { background-color: #fff3e0; border-left: 3px solid #e65100; padding-left: 8px; }
  li[data-flag="yellow"] { background-color: #fffde7; border-left: 3px solid #f9a825; padding-left: 8px; }
'''

js = f'''
const CK = 'nasun-lb-clicked-{snapshot_date}';
const FK = 'nasun-lb-flags';
const clicked = new Set(JSON.parse(localStorage.getItem(CK) || '[]'));
const flagOverrides = JSON.parse(localStorage.getItem(FK) || '{}');

function applyFlag(li, flag) {
  li.dataset.flag = flag || '';
}

function toggleFlag(li, flag) {
  const username = li.querySelector('a')?.href.split('/').pop()?.toLowerCase();
  if (!username) return;
  const current = li.dataset.flag;
  const next = current === flag ? '' : flag;
  applyFlag(li, next);
  if (next) {
    flagOverrides[username] = next;
  } else {
    delete flagOverrides[username];
  }
  localStorage.setItem(FK, JSON.stringify(flagOverrides));
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

  // Flag buttons (exclusive toggle)
  li.querySelector('.fg')?.addEventListener('click', () => toggleFlag(li, 'green'));
  li.querySelector('.fo')?.addEventListener('click', () => toggleFlag(li, 'orange'));
  li.querySelector('.fy')?.addEventListener('click', () => toggleFlag(li, 'yellow'));
});

updateStats();

// Export Progress: download current state as new HTML
document.getElementById('exportBtn').addEventListener('click', () => {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('.chk').forEach((chk, i) => {
    const orig = document.querySelectorAll('.chk')[i];
    if (orig.checked) chk.setAttribute('checked', '');
    else chk.removeAttribute('checked');
  });
  clone.querySelectorAll('li').forEach((li, i) => {
    const origLi = document.querySelectorAll('li')[i];
    li.className = origLi.className;
    li.dataset.flag = origLi.dataset.flag || '';
    li.dataset.section = origLi.dataset.section || '';
  });
  clone.querySelectorAll('ol a').forEach((a, i) => {
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

// Export Flags JSON: download flag overrides as JSON
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const data = {
    flags: {...flagOverrides},
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'x-flags-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
});
'''

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Nasun {season_name} Leaderboard - X Profiles ({snapshot_date})</title>
<style>{css}</style>
</head>
<body>
<h1>Nasun {season_name} - X Profiles</h1>
<p class="meta">Snapshot: {snapshot_date} | S1(LB): {len(s1)} | S2(Posts): {len(s2)} | S3(Reg): {len(s3)} | S4(Yellow): {len(s4)} | S5(Orange): {len(s5)} | Total: {total_users}</p>
<div class="toolbar">
  <button id="exportBtn">Export Progress</button>
  <button id="exportJsonBtn">Export Flags JSON</button>
  <span id="stats" style="font-size:0.8rem;color:#999;"></span>
</div>
'''

# S1: Top 500 (unflagged + green)
n = 1
html += f'<h2>S1. Leaderboard Top {total_lb} ({len(s1)})</h2>\n<ol>\n'
for entry in s1:
    html += make_li(entry) + '\n'
html += '</ol>\n'
n += len(s1)

# S2: 501+ with posts
html += f'<hr class="divider">\n<h2>S2. Posts Collected ({len(s2)})</h2>\n<ol start="{n}">\n'
for entry in s2:
    html += make_li(entry) + '\n'
html += '</ol>\n'
n += len(s2)

# S3: No posts
html += f'<hr class="divider">\n<h2>S3. Registered, No Posts ({len(s3)})</h2>\n<ol start="{n}">\n'
for entry in s3:
    html += make_li(entry) + '\n'
html += '</ol>\n'
n += len(s3)

# S4: Yellow
html += f'<hr class="divider">\n<h2>S4. Yellow Flagged ({len(s4)})</h2>\n<ol start="{n}">\n'
for entry in s4:
    html += make_li(entry, show_tag=True) + '\n'
html += '</ol>\n'
n += len(s4)

# S5: Orange
html += f'<hr class="divider">\n<h2>S5. Orange Flagged ({len(s5)})</h2>\n<ol start="{n}">\n'
for entry in s5:
    html += make_li(entry, show_tag=True) + '\n'
html += '</ol>\n'

html += f'<script>{js}</script>\n</body>\n</html>'

out_file = f'{DOCS_DIR}/x-leaderboard-profiles-{snapshot_date}.html'
with open(out_file, 'w') as f:
    f.write(html)

print(f'''
Export complete:
  Season: {season_name}
  Snapshot: {snapshot_date}
  S1 (Leaderboard): {len(s1)}
  S2 (Posts collected): {len(s2)}
  S3 (Registered, no posts): {len(s3)}
  S4 (Yellow flagged): {len(s4)}
  S5 (Orange flagged): {len(s5)}
  Total: {total_users}
  Flags: {len(orange_flags)} orange, {len(yellow_flags)} yellow, {len(green_flags)} green
  File: {out_file}
''')
```

위 Python 스크립트를 Bash 도구로 실행합니다:

```bash
SNAPSHOT_DATE="..." python3 << 'PYEOF'
# (위 Python 스크립트 전체)
PYEOF
```

## 섹션 구조

| 섹션 | 내용 | 정렬 | 번호 |
|------|------|------|------|
| S1 | Top 500 (orange/yellow 제외) | 리더보드 순위 | 1부터 연속 |
| S2 | 501위 이하, postCount > 0 (orange/yellow 제외) | postCount 내림차순 | S1 이어서 연속 |
| S3 | postCount == 0, orange/yellow 없음 | createdAt 오름차순 | S2 이어서 연속 |
| S4 | Yellow 플래그 | 원래 섹션(LB/Posts/Reg) 1차, 알파벳 2차 | S3 이어서 연속 |
| S5 | Orange 플래그 | 원래 섹션(LB/Posts/Reg) 1차, 알파벳 2차 | S4 이어서 연속 |

- Green 플래그 사용자는 원래 섹션(S1/S2/S3)에 유지 (organic KOL 표시용)
- S4/S5에서 `[LB]`/`[Posts]`/`[Reg]` 태그로 원래 소속 표시
- 런타임 플래그 토글은 시각적 표시만 변경 (섹션 이동은 다음 생성 시 반영)

## 주의사항

- `--profile nasun-prod` 로 프로덕션 DynamoDB에 접근합니다 (read-only, 데이터 변경 없음)
- UserProfiles 테이블은 ~5000건, accounts는 ~900건이므로 full scan이 안전합니다
- `flagged-orange.txt`, `flagged-yellow.txt`, `flagged-green.txt` 파일이 없으면 플래그 없이 정상 생성됩니다
- localStorage 키: `nasun-lb-clicked` (방문 추적), `nasun-lb-flags` (플래그 변경)
- Green/Orange/Yellow 플래그는 배타적 (하나만 선택 가능)
- Export Flags JSON으로 플래그 상태를 JSON 파일로 내보낼 수 있습니다 (향후 병합에 활용)
