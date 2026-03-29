---
name: leaderboard-export
description: 리더보드 참여자 및 X 연결 가입자 전체 목록을 클릭 가능한 HTML로 내보냅니다. 5개 섹션(Top 500, Posts, Registered, Yellow, Orange) 분류, 프로필 방문 추적, 색상 플래그(Green/Orange/Yellow), Export 기능을 포함합니다. _tmp/ 디렉토리의 *-done.html 및 x-flags-*.json 파일들을 자동 탐색하여 체크/플래그 상태를 병합합니다. "리더보드 내보내기", "X 프로필 리스트", "leaderboard export" 등의 요청에 사용합니다.
argument-hint: "[YYYY-MM-DD]"
---

# Leaderboard Export: X 프로필 HTML 생성

리더보드 참여자 및 나선 웹사이트 X 연결 가입자의 프로필을 클릭 가능한 HTML로 내보냅니다.
`_tmp/` 디렉토리의 `*-done.html` 및 `x-flags-*.json` 파일들을 자동 탐색하여 체크/플래그 상태를 병합(union)한 후, 신규 가입자를 추가합니다.

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
import json, subprocess, os, sys, re, glob
import html as html_mod
from datetime import datetime

SNAPSHOT_DATE = os.environ.get('SNAPSHOT_DATE', '').strip()
MONOREPO = '/home/naru/my_apps/nasun-monorepo'
DOCS_DIR = f'{MONOREPO}/apps/nasun-website/docs'
TMP_DIR = f'{MONOREPO}/_tmp'
API_URL = 'https://auzo707xql.execute-api.ap-northeast-2.amazonaws.com/prod/v3/leaderboard'
AWS_PROFILE = 'nasun-prod'
AWS_REGION = 'ap-northeast-2'

# ══════════════════════════════════════════════════
# Phase A: Merge previous *-done.html files
# ══════════════════════════════════════════════════

username_re = re.compile(r'href="https://x\.com/([^"]+)"')

def parse_done_html(filepath):
    """Extract per-username {checked, flag} from an exported HTML file."""
    with open(filepath) as f:
        html = f.read()
    states = {}
    for m in re.finditer(r'<li\s[^>]*data-flag="([^"]*)"[^>]*>(.*?)</li>', html, re.DOTALL):
        inner = m.group(2)
        um = username_re.search(inner)
        if not um:
            continue
        states[um.group(1).lower()] = {
            'checked': 'checked=""' in inner,
            'flag': m.group(1),
        }
    return states

# Find all *-done.html files in _tmp/
done_files = sorted(glob.glob(f'{TMP_DIR}/*-done.html'))
merged_states = {}  # username_lower -> {checked, flag}

if done_files:
    print(f'Found {len(done_files)} done file(s) to merge:')
    all_parsed = []
    for f in done_files:
        states = parse_done_html(f)
        checked_count = sum(1 for v in states.values() if v['checked'])
        flag_counts = {}
        for v in states.values():
            if v['flag']:
                flag_counts[v['flag']] = flag_counts.get(v['flag'], 0) + 1
        print(f'  {os.path.basename(f)}: {len(states)} profiles, {checked_count} checked, flags={flag_counts}')
        all_parsed.append(states)

    # Union merge: first file wins on flag conflicts
    all_users = set()
    for states in all_parsed:
        all_users |= set(states.keys())

    for u in all_users:
        checked = any(s.get(u, {}).get('checked', False) for s in all_parsed)
        # First file with a non-empty flag wins
        flag = ''
        for s in all_parsed:
            f = s.get(u, {}).get('flag', '')
            if f:
                flag = f
                break
        merged_states[u] = {'checked': checked, 'flag': flag}

    merged_checked = sum(1 for v in merged_states.values() if v['checked'])
    merged_flags = {}
    for v in merged_states.values():
        if v['flag']:
            merged_flags[v['flag']] = merged_flags.get(v['flag'], 0) + 1
    print(f'  Merged: {len(merged_states)} users, {merged_checked} checked, flags={merged_flags}')
else:
    print('No *-done.html files found in _tmp/ - generating fresh without merge')

old_users = set(merged_states.keys())

# ══════════════════════════════════════════════════
# Phase A2: Merge JSON flag overrides (highest priority)
# ══════════════════════════════════════════════════

json_flag_files = sorted(glob.glob(f'{TMP_DIR}/x-flags-*.json'))
if json_flag_files:
    print(f'\nFound {len(json_flag_files)} JSON flag file(s):')
    json_flags = {}
    for jf in json_flag_files:
        with open(jf) as f:
            data = json.load(f)
        flags = data.get('flags', {})
        non_empty = {k: v for k, v in flags.items() if v}
        flag_counts = {}
        for v in non_empty.values():
            flag_counts[v] = flag_counts.get(v, 0) + 1
        print(f'  {os.path.basename(jf)}: {len(non_empty)} non-empty flags, {flag_counts}')
        # Later files override earlier ones
        for k, v in flags.items():
            json_flags[k.lower()] = v

    json_applied = 0
    for u, flag in json_flags.items():
        if flag:
            if u in merged_states:
                if merged_states[u]['flag'] != flag:
                    json_applied += 1
                merged_states[u]['flag'] = flag
            else:
                merged_states[u] = {'checked': False, 'flag': flag}
                json_applied += 1
        elif u in merged_states and merged_states[u]['flag']:
            merged_states[u]['flag'] = ''
            json_applied += 1

    merged_flags_after = {}
    for v in merged_states.values():
        if v['flag']:
            merged_flags_after[v['flag']] = merged_flags_after.get(v['flag'], 0) + 1
    print(f'  JSON overrides applied: {json_applied} changes')
    print(f'  Merged (after JSON): flags={merged_flags_after}')

# ══════════════════════════════════════════════════
# Phase B: Fetch fresh data from API + DynamoDB
# ══════════════════════════════════════════════════

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

# Fetch leaderboard top 500
params = 'limit=500'
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

top500_map = {}
top500_ordered = []
for i, e in enumerate(entries):
    username = e.get('originalUsername') or e.get('username', '')
    rank = i + 1
    top500_map[username.lower()] = {'username': username, 'rank': rank}
    top500_ordered.append({'username': username, 'rank': rank})

print('Scanning UserProfiles...')
user_items = aws_scan_all(
    'UserProfiles',
    'twitterHandle, originalTwitterHandle, createdAt, linkedToPrimaryId',
    'attribute_exists(twitterHandle) AND attribute_not_exists(linkedToPrimaryId)',
)
print(f'UserProfiles: {len(user_items)} X-linked primary accounts')

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

# Load flag files (server-side baseline flags)
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
print(f'Flags (file): {len(orange_flags)} orange, {len(yellow_flags)} yellow, {len(green_flags)} green')

def get_baseline_flag(username):
    u = username.lower()
    if u in orange_flags: return 'orange'
    if u in yellow_flags: return 'yellow'
    if u in green_flags: return 'green'
    return ''

# ══════════════════════════════════════════════════
# Phase C: Classify with merged flags applied
# ══════════════════════════════════════════════════

# Build all profiles with effective flags
all_profiles = []

for item in top500_ordered:
    all_profiles.append({
        'username': item['username'],
        'username_lower': item['username'].lower(),
        'orig_section': 'lb',
        'postCount': post_count_map.get(item['username'].lower(), 0),
        'createdAt': '',
    })

for item in non_top500:
    all_profiles.append({
        'username': item['username'],
        'username_lower': item['username'].lower(),
        'orig_section': 'posts' if item['postCount'] > 0 else 'reg',
        'postCount': item['postCount'],
        'createdAt': item.get('createdAt', ''),
    })

# Classify into sections
s1, s2_existing, s2_new, s3, s4 = [], [], [], [], []

for p in all_profiles:
    u = p['username_lower']
    is_new = bool(old_users) and u not in old_users
    m = merged_states.get(u)

    # Effective flag: merged flag > baseline flag
    if m and m['flag']:
        eff_flag = m['flag']
    else:
        eff_flag = get_baseline_flag(p['username'])

    entry = {
        'username': p['username'],
        'username_lower': u,
        'flag': eff_flag,
        'orig_section': p['orig_section'],
        'checked': m['checked'] if m else False,
        'is_new': is_new,
    }

    # Route to section based on effective flag
    if eff_flag == 'orange':
        s4.append(entry)
    elif eff_flag == 'yellow':
        s3.append(entry)
    elif is_new:
        s2_new.append(entry)
    elif p['orig_section'] in ('lb', 'posts'):
        s1.append(entry)
    else:
        s2_existing.append(entry)

# Sort
s2_existing.sort(key=lambda x: x.get('createdAt', '') or 'z')
s2_new.sort(key=lambda x: x['username_lower'])
s2_combined = s2_existing + s2_new

origin_order = {'lb': 0, 'posts': 1, 'reg': 2}
s3.sort(key=lambda x: (origin_order.get(x['orig_section'], 9), x['username_lower']))
s4.sort(key=lambda x: (origin_order.get(x['orig_section'], 9), x['username_lower']))

total_users = len(s1) + len(s2_combined) + len(s3) + len(s4)
new_count = len(s2_new)
print(f'Sections: S1={len(s1)}, S2={len(s2_combined)} (existing={len(s2_existing)}, new={new_count}), S3(yellow)={len(s3)}, S4(orange)={len(s4)}, total={total_users}')

# ══════════════════════════════════════════════════
# Phase D: Generate HTML
# ══════════════════════════════════════════════════

def esc(s):
    return html_mod.escape(s)

SECTION_LABELS = {'lb': 'LB', 'posts': 'Posts', 'reg': 'Reg'}

def section_tag_html(section):
    return f'<span class="section-tag">[{SECTION_LABELS.get(section, "?")}]</span>'

def make_li(entry, show_tag=False):
    username = entry['username']
    flag = entry.get('flag', '')
    section = entry.get('orig_section', '')
    flag_attr = f' data-flag="{esc(flag)}"' if flag else ' data-flag=""'
    section_attr = f' data-section="{esc(section)}"'
    tag = section_tag_html(section) if show_tag and section else ''
    new_marker = '<span class="section-tag" style="color:#e65100;font-weight:bold;">[NEW]</span>' if entry.get('is_new') else ''
    return (
        f'<li{flag_attr}{section_attr}>'
        f'<button class="fb fg green-btn" title="Green (KOL)">G</button>'
        f'<div class="row">'
        f'<input type="checkbox" class="chk">'
        f'<a href="https://x.com/{esc(username)}" target="_blank" rel="noopener">@{esc(username)}</a>'
        f'{tag}{new_marker}'
        f'<span class="flag-btns">'
        f'<button class="fb fo" title="Orange flag">O</button>'
        f'<button class="fb fy" title="Yellow flag">Y</button>'
        f'</span>'
        f'</div>'
        f'</li>'
    )

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
const flagOverrides = JSON.parse(localStorage.getItem(FK) || '{{}}'  );

function applyFlag(li, flag) {{
  li.dataset.flag = flag || '';
}}

function toggleFlag(li, flag) {{
  const username = li.querySelector('a')?.href.split('/').pop()?.toLowerCase();
  if (!username) return;
  const current = li.dataset.flag;
  const next = current === flag ? '' : flag;
  applyFlag(li, next);
  if (next) {{
    flagOverrides[username] = next;
  }} else {{
    delete flagOverrides[username];
  }}
  localStorage.setItem(FK, JSON.stringify(flagOverrides));
}}

function updateStats() {{
  const all = document.querySelectorAll('li');
  const checked = document.querySelectorAll('.chk:checked').length;
  document.getElementById('stats').textContent = `Checked: ${{checked}}/${{all.length}}`;
}}

document.querySelectorAll('li').forEach(li => {{
  const chk = li.querySelector('.chk');
  const link = li.querySelector('a');
  const href = link?.href || '';
  const username = href.split('/').pop()?.toLowerCase();

  if (username && flagOverrides[username] !== undefined) {{
    applyFlag(li, flagOverrides[username]);
  }}

  if (clicked.has(href)) {{
    link.classList.add('clicked');
    chk.checked = true;
  }}

  link?.addEventListener('click', () => {{
    link.classList.add('clicked');
    chk.checked = true;
    clicked.add(href);
    localStorage.setItem(CK, JSON.stringify([...clicked]));
    updateStats();
  }});

  chk?.addEventListener('change', () => {{
    if (chk.checked) {{
      clicked.add(href);
      link.classList.add('clicked');
    }} else {{
      clicked.delete(href);
      link.classList.remove('clicked');
    }}
    localStorage.setItem(CK, JSON.stringify([...clicked]));
    updateStats();
  }});

  li.querySelector('.fg')?.addEventListener('click', () => toggleFlag(li, 'green'));
  li.querySelector('.fo')?.addEventListener('click', () => toggleFlag(li, 'orange'));
  li.querySelector('.fy')?.addEventListener('click', () => toggleFlag(li, 'yellow'));
}});

updateStats();

document.getElementById('exportBtn').addEventListener('click', () => {{
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('.chk').forEach((chk, i) => {{
    const orig = document.querySelectorAll('.chk')[i];
    if (orig.checked) chk.setAttribute('checked', '');
    else chk.removeAttribute('checked');
  }});
  clone.querySelectorAll('li').forEach((li, i) => {{
    const origLi = document.querySelectorAll('li')[i];
    li.className = origLi.className;
    li.dataset.flag = origLi.dataset.flag || '';
    li.dataset.section = origLi.dataset.section || '';
  }});
  clone.querySelectorAll('ol a').forEach((a, i) => {{
    const origA = document.querySelectorAll('ol a')[i];
    if (origA?.classList.contains('clicked')) a.classList.add('clicked');
  }});
  const blob = new Blob(['<!DOCTYPE html>\\n' + clone.outerHTML], {{type: 'text/html'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'x-profiles-exported-' + new Date().toISOString().slice(0,10) + '.html';
  a.click();
  URL.revokeObjectURL(url);
}});

document.getElementById('exportJsonBtn').addEventListener('click', () => {{
  const data = {{
    flags: {{...flagOverrides}},
    exportedAt: new Date().toISOString(),
  }};
  const blob = new Blob([JSON.stringify(data, null, 2)], {{type: 'application/json'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'x-flags-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}});
'''

s2_header = f'S2. Registered, No Posts ({len(s2_combined)})'
if new_count > 0:
    s2_header += f' - includes {new_count} new'

html_out = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>Nasun {season_name} Leaderboard - X Profiles ({snapshot_date})</title>
<style>{css}</style>
</head>
<body>
<h1>Nasun {season_name} - X Profiles</h1>
<p class="meta">Snapshot: {snapshot_date} | S1(LB): {len(s1)} | S2(Reg): {len(s2_combined)}{f" (+{new_count} new)" if new_count else ""} | S3(Yellow): {len(s3)} | S4(Orange): {len(s4)} | Total: {total_users}</p>
<div class="toolbar">
  <button id="exportBtn">Export Progress</button>
  <button id="exportJsonBtn">Export Flags JSON</button>
  <span id="stats" style="font-size:0.8rem;color:#999;">Checked: 0/{total_users}</span>
</div>
'''

n = 1
html_out += f'<h2>S1. Leaderboard Participants ({len(s1)})</h2>\n<ol>\n'
for entry in s1:
    html_out += make_li(entry) + '\n'
html_out += '</ol>\n'
n += len(s1)

html_out += f'<hr class="divider">\n<h2>{s2_header}</h2>\n<ol start="{n}">\n'
for entry in s2_combined:
    html_out += make_li(entry) + '\n'
html_out += '</ol>\n'
n += len(s2_combined)

html_out += f'<hr class="divider">\n<h2>S3. Yellow Flagged ({len(s3)})</h2>\n<ol start="{n}">\n'
for entry in s3:
    html_out += make_li(entry, show_tag=True) + '\n'
html_out += '</ol>\n'
n += len(s3)

html_out += f'<hr class="divider">\n<h2>S4. Orange Flagged ({len(s4)})</h2>\n<ol start="{n}">\n'
for entry in s4:
    html_out += make_li(entry, show_tag=True) + '\n'
html_out += '</ol>\n'

html_out += f'<script>{js}</script>\n</body>\n</html>'

out_file = f'{TMP_DIR}/x-profiles-exported-{snapshot_date}.html'
with open(out_file, 'w') as f:
    f.write(html_out)

print(f'''
Export complete:
  Season: {season_name}
  Snapshot: {snapshot_date}
  S1 (Leaderboard Participants): {len(s1)}
  S2 (Registered, no posts): {len(s2_combined)} (existing={len(s2_existing)}, new={new_count})
  S3 (Yellow flagged): {len(s3)}
  S4 (Orange flagged): {len(s4)}
  Total: {total_users}
  Merged from: {len(done_files)} done file(s)
  Flags (file): {len(orange_flags)} orange, {len(yellow_flags)} yellow, {len(green_flags)} green
  File: {out_file}
''')
```

위 Python 스크립트를 Bash 도구로 실행합니다:

```bash
SNAPSHOT_DATE="..." python3 << 'PYEOF'
# (위 Python 스크립트 전체)
PYEOF
```

## 병합 동작

스킬 실행 시 `_tmp/` 디렉토리에서 `*-done.html`과 `x-flags-*.json` 파일을 자동 탐색합니다.

| 소스 | 우선순위 | 설명 |
|------|----------|------|
| `x-flags-*.json` | 최우선 | 브라우저 Export Flags JSON으로 내보낸 localStorage 플래그 |
| `*-done.html` | 2순위 | Export Progress로 내보낸 HTML의 data-flag 속성 |
| `flagged-*.txt` | 3순위 (baseline) | 서버 측 기본 플래그 파일 |

**병합 규칙:**
- **checked**: 어느 done 파일에서든 체크되어 있으면 체크 처리
- **flag**: JSON > done HTML(첫 번째 파일, 알파벳순) > baseline txt
- **JSON 빈 문자열**: 해당 사용자의 플래그를 명시적으로 해제
- **신규 가입자**: 이전 done 파일에 없던 사용자는 S2 하단에 `[NEW]` 태그와 함께 배치
- **플래그 섹션 이동**: 병합된 orange/yellow 플래그에 따라 S3/S4로 자동 이동

**출력 파일:** `_tmp/x-profiles-exported-{snapshot_date}.html` (체크마크 초기화 상태)

## 섹션 구조

| 섹션 | 내용 | 정렬 | 번호 |
|------|------|------|------|
| S1 | 리더보드 참가자 (Top 500 + postCount > 0, orange/yellow 제외) | Top 500 순위 -> postCount 내림차순 | 1부터 연속 |
| S2 | postCount == 0, orange/yellow 없음 + 신규 가입자 (하단) | createdAt 오름차순, 신규는 알파벳순 | S1 이어서 연속 |
| S3 | Yellow 플래그 | 원래 섹션(LB/Posts/Reg) 1차, 알파벳 2차 | S2 이어서 연속 |
| S4 | Orange 플래그 | 원래 섹션(LB/Posts/Reg) 1차, 알파벳 2차 | S3 이어서 연속 |

- Green 플래그 사용자는 원래 섹션(S1/S2)에 유지 (organic KOL 표시용)
- S3/S4에서 `[LB]`/`[Posts]`/`[Reg]` 태그로 원래 소속 표시
- 런타임 플래그 토글은 시각적 표시만 변경 (섹션 이동은 다음 생성 시 반영)

## 주의사항

- `--profile nasun-prod` 로 프로덕션 DynamoDB에 접근합니다 (read-only, 데이터 변경 없음)
- UserProfiles 테이블은 ~5000건, accounts는 ~900건이므로 full scan이 안전합니다
- `flagged-orange.txt`, `flagged-yellow.txt`, `flagged-green.txt` 파일이 없으면 플래그 없이 정상 생성됩니다
- localStorage 키: `nasun-lb-clicked` (방문 추적), `nasun-lb-flags` (플래그 변경)
- Green/Orange/Yellow 플래그는 배타적 (하나만 선택 가능)
- Export Flags JSON으로 플래그 상태를 JSON 파일로 내보낼 수 있습니다 (`_tmp/x-flags-*.json`으로 저장하면 다음 생성 시 자동 병합)
- done HTML에는 localStorage 플래그가 완전히 반영되지 않을 수 있으므로, 리뷰어별 JSON 플래그 export를 권장
