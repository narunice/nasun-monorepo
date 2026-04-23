---
name: env-verify
description: Vite 빌드 산출물(dist/assets/*.js)의 VITE_* 환경변수가 현재 .env 파일 값과 일치하는지 검증합니다. 빌드 후 env 누락/outdated 문제를 사전 탐지. "env verify", "빌드 검증", "embed 확인", "환경변수 검증" 등의 요청에 사용합니다.
---

# env-verify: Vite 빌드 env embed 검증

Vite는 `VITE_*` 변수를 빌드 타임에 JS 번들에 embed합니다. `.env`를 고쳐도 재빌드 전까지는 옛 값이 남아 있어 "env 업데이트가 안 먹힌다"의 주 원인이 됩니다. 이 스킬은 현재 `.env` 값이 `dist/assets/*.js`에 실제로 embed되었는지 대조합니다.

## 실행 절차

### 1단계: 인자 파싱

`$ARGUMENTS`에서 앱 이름 추출.

| 인자 | 필수 | 값 |
| ---- | ---- | -- |
| `app` | O | `nasun-website`, `pado`, `gensol-website`, `network-explorer`, `baram` |
| `--mode` | X | `development` 또는 `production` (기본: production) |

앱이 목록에 없으면 에러. 인자가 없으면 사용자에게 앱 이름을 묻는다.

### 2단계: 경로 결정

아래 매핑 표에 따라 `.env` 파일 경로와 `dist/assets` 경로를 결정한다. **envDir 설정을 반드시 반영한다.**

| 앱 | env 디렉토리 | dist 경로 | 비고 |
| -- | ------------ | --------- | ---- |
| nasun-website | `apps/nasun-website/frontend/` | `apps/nasun-website/frontend/dist/` | 기본 |
| pado | `apps/pado/` | `apps/pado/frontend/dist/` | envDir: `../` |
| gensol-website | `apps/gensol-website/frontend/` | `apps/gensol-website/frontend/dist/` | 기본 |
| network-explorer | `apps/network-explorer/` | `apps/network-explorer/dist/` | 단일 레벨 |
| baram | `apps/baram/frontend/` | `apps/baram/frontend/dist/` | 기본 |

**mode별 파일 우선순위 (Vite 표준)**: `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env`
- `--mode production` (기본): `.env.production.local`, `.env.local`, `.env.production`, `.env`
- `--mode development`: `.env.development.local`, `.env.local`, `.env.development`, `.env`

### 3단계: 사전 체크

- `dist/` 디렉토리가 없거나 `dist/assets/*.js`가 비어있으면 "빌드부터 해야 함"이라고 알린 뒤 중단
- `.env` 관련 파일이 하나도 없으면 "검증할 env 없음"으로 중단

### 4단계: VITE_* 키/값 수집

해당 디렉토리에서 Vite 우선순위대로 `.env*`를 로드한다. 같은 키가 여러 파일에 있으면 우선순위 높은 값만 사용.

```bash
# 예시 로직 (bash)
KEYS_FILE=$(mktemp)
for f in ${ENV_DIR}/.env ${ENV_DIR}/.env.${MODE} ${ENV_DIR}/.env.local ${ENV_DIR}/.env.${MODE}.local; do
  [ -f "$f" ] && grep -E '^VITE_[A-Za-z0-9_]+=' "$f" >> "$KEYS_FILE"
done
# 뒤에 등장한 값이 이기도록 dedup (우선순위 낮은 것부터 append했으므로 마지막이 최우선)
awk -F= '{k=$1; $1=""; v=substr($0,2); map[k]=v} END{for(k in map) print k"="map[k]}' "$KEYS_FILE"
```

### 5단계: embed 값 조회

각 `VITE_KEY=expected_value`에 대해:

1. `grep -oh -E "\"${expected_value}\"" ${DIST}/assets/*.js | head -1`로 embed 문자열 탐색
2. 값이 URL/UUID/토큰 등이라 문자열로 그대로 박혀있을 것이다. 따옴표로 감싼 완전일치 기준으로 판정.
3. 결과 분류:
   - **MATCH**: dist에 해당 문자열 존재
   - **MISSING**: dist 어디에도 없음 (빌드 시점에 env가 없었거나, 해당 코드 경로가 tree-shake됨)
   - **STALE 의심**: 같은 키 이름이 들어간 다른 값이 dist에 존재 (예: `VITE_API_URL` 옛 URL이 박혀있음)

STALE 의심을 감지하려면 `grep -oh -E "[a-zA-Z0-9_.:/-]{10,}" dist/assets/*.js | sort -u` 같은 방식으로 근접 후보 값을 뽑아 `.env` 값과 대조한다. 완벽하진 않지만 URL/호스트 변경 감지에 유용.

### 6단계: 리포트 출력

테이블로 정리하여 사용자에게 보고:

```
env-verify: apps/pado/frontend/dist (mode=production)
env source: apps/pado/.env.production (envDir:'../')

 KEY                              STATUS    DETAIL
 VITE_API_URL                     MATCH     https://api.pado.finance
 VITE_SUI_RPC_URL                 MISSING   expected https://rpc.devnet.nasun.io — not found in any bundle
 VITE_TPSL_KEEPER_ADDRESS         STALE?    .env says 0x74a7daf4..., bundle contains 0x9b21...
 VITE_UMAMI_HOST                  MATCH     https://analytics.nasun.io
 (5 keys checked: 3 match, 1 missing, 1 stale)
```

STATUS가 MATCH가 아닌 게 하나라도 있으면 **"재빌드 필요"** 문구를 마지막에 덧붙인다.

### 7단계: 후속 조치 제안

- MISSING/STALE가 있으면:
  1. 어느 env 파일이 로드되었는지, 어느 값이 우선되는지 진단 (step 4의 로직 참조)
  2. `.env.local`이 `.env.production`을 오버라이드하는 중인지 확인
  3. 사용자에게 재빌드 또는 `.env` 수정 여부를 물음

## 안전 규칙

- 이 스킬은 **읽기 전용**이다. `.env`나 `dist/`를 수정하지 않는다.
- 문자열 매칭이므로 매우 짧은 값(예: `VITE_DEBUG=1`)은 false positive가 날 수 있다. 10자 미만 값은 "검증 생략"으로 표시.
- 토큰/시크릿성 값이라도 `VITE_*`는 이미 클라이언트 번들에 embed되므로 추가 유출 위험은 없다(이미 public). 다만 출력에서 긴 값은 앞 12자만 표시한다.

## 예시 호출

```
/env-verify pado
/env-verify nasun-website --mode development
/env-verify network-explorer
```
