---
name: env-verify
description: Vite 빌드 산출물(dist/assets/*.js)의 VITE_* 환경변수가 현재 .env 파일 값과 embed되었는지 검증합니다. 빌드 후 env 누락/outdated 문제를 사전 탐지. "env verify", "빌드 검증", "embed 확인", "환경변수 검증" 등의 요청에 사용합니다.
---

# env-verify: Vite 빌드 env embed 검증

프론트엔드 배포 스크립트도 빌드 후 이 검증을 자동으로 돌립니다. 이 스킬은 수동 호출용 wrapper입니다.

## 실행 절차

### 1단계: 인자 파싱

`$ARGUMENTS`에서 앱 이름과 모드를 추출한다.

형식: `<app> [mode]`

| 인자 | 필수 | 값 |
| ---- | ---- | -- |
| `app` | O | `nasun-website`, `pado`, `gensol-website`, `network-explorer`, `baram` |
| `mode` | X | `production` (기본), `staging`, `development` |

앱이 목록에 없으면 에러. 인자 없으면 사용자에게 앱 이름을 묻는다.

### 2단계: 검증 실행

Bash tool로 아래 명령을 실행한다:

```bash
bash scripts/env-verify.sh <app> --mode <mode>
```

스크립트가 모든 검증 로직을 담고 있다 (경로 매핑, Vite priority 로딩, grep 대조, MATCH/MISSING/SKIP 분류). exit code:
- 0: 모두 MATCH (또는 SKIP) → 성공
- 1: MISSING 발견 → 재빌드 필요 가능성
- 2: setup 에러 (앱 오타, dist 없음 등)

### 3단계: 결과 해석

스크립트 출력을 그대로 사용자에게 보여준 뒤, MISSING이 있으면 원인을 함께 설명한다:

1. **Stale build (가장 흔함)**: `.env`를 고친 뒤 재빌드를 안 한 경우. `pnpm build:<app>` 재실행 후 다시 env-verify.
2. **미사용 키**: `.env`에는 정의됐지만 소스코드에서 참조하지 않는 경우. tree-shaking으로 dist에서 제거됨. `.env`에서 제거해도 무방.
3. **`.env.local` 오버라이드**: `.env.production`과 `.env.local`에 같은 키가 다른 값으로 존재. `.env.local`이 우선하므로 이 값이 빌드에 반영됨.

MISSING 키별로 소스(.env 파일명)가 표시되므로, 어느 파일의 값이 빠졌는지 즉시 확인 가능.

### 4단계: 후속 조치

상황에 따라 사용자에게 선택지를 제안한다:
- Stale build로 판단되면: 재빌드 명령 안내 (`pnpm build:<app>`)
- 미사용 키로 판단되면: `.env` 정리 제안 (선택)
- `.env.local` 충돌로 판단되면: `.env.local` 확인 제안

## 안전 규칙

- 이 스킬은 읽기 전용이다. `.env`, `dist/`를 수정하지 않는다.
- 10자 미만 값은 false positive 우려로 검증 skip (스크립트가 자동 처리).
- 토큰/시크릿 값이라도 `VITE_*`는 이미 클라이언트 번들에 embed되므로 출력해도 유출 위험 없음 (이미 public). 48자 넘는 값은 앞자만 표시.

## 예시 호출

```
/env-verify pado
/env-verify nasun-website staging
/env-verify network-explorer
```
