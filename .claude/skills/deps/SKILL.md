---
name: deps
description: pnpm 모노레포의 의존성을 관리합니다. 업데이트, 보안 감사, 미사용 패키지 탐지를 수행합니다. "의존성 업데이트", "패키지 업데이트", "update deps", "outdated 확인", "보안 감사" 등의 요청에 사용합니다.
---

# Dependency Updater (pnpm Monorepo)

pnpm 모노레포의 의존성을 안전하게 관리합니다.
MINOR/PATCH는 자동 적용, MAJOR는 개별 확인 후 적용합니다.

## 업데이트 정책

| 업데이트 타입 | 버전 변경 | 처리 |
| ------------- | --------- | ---- |
| Fixed | `^`/`~` 없음 | 스킵 (의도적 고정) |
| PATCH | `x.y.z` -> `x.y.Z` | 자동 적용 |
| MINOR | `x.y.z` -> `x.Y.0` | 자동 적용 |
| MAJOR | `x.y.z` -> `X.0.0` | 개별 확인 필요 |

## 워크플로

### Step 1: 현황 확인

```bash
# 전체 모노레포에서 outdated 패키지 확인
pnpm outdated -r

# 또는 taze (더 깔끔한 출력)
npx taze -r
```

### Step 2: MINOR/PATCH 자동 적용

```bash
# taze로 minor/patch 자동 업데이트 (모노레포 전체)
npx taze minor -r --write

# 또는 특정 앱만
cd apps/pado/frontend && npx taze minor --write
```

### Step 3: MAJOR 업데이트 개별 확인

MAJOR 업데이트가 있으면 `AskUserQuestion`으로 각각 확인:

```
"@mysten/sui를 ^1.17.0 → ^2.0.0으로 업데이트하시겠습니까?
주요 변경사항: [breaking changes 요약]"
```

승인된 것만 적용:

```bash
npx taze major -r --write --include @mysten/sui,react
```

### Step 4: 설치 및 검증

```bash
# 의존성 설치
pnpm install

# 빌드 검증 (순차적으로, I/O 부하 방지)
pnpm build:pado
pnpm build:nasun-website
pnpm build:network-explorer
```

### Step 5: 보안 감사

```bash
pnpm audit

# 자동 수정 가능한 것
pnpm audit --fix
```

## 진단 모드

의존성 문제 발생 시:

### 일반적인 문제와 해결

| 문제 | 증상 | 해결 |
| ---- | ---- | ---- |
| 버전 충돌 | "Cannot resolve dependency tree" | `pnpm install --force` 또는 overrides 사용 |
| Peer dependency | "Peer dependency not satisfied" | 필요한 peer 버전 설치 |
| 중복 패키지 | 번들 크기 증가 | `pnpm dedupe` |
| 미사용 패키지 | 불필요한 용량 | `npx depcheck` |

### 긴급 복구

```bash
# 완전 초기화 (최후의 수단)
rm -rf node_modules apps/*/node_modules apps/*/frontend/node_modules packages/*/node_modules
rm pnpm-lock.yaml
pnpm install
```

## 미사용 패키지 탐지

```bash
# 특정 앱의 미사용 패키지 확인
cd apps/pado/frontend && npx depcheck

# 또는 knip (더 정확)
npx knip
```

## Anti-Patterns

| 금지 | 이유 | 대신 |
| ---- | ---- | ---- |
| Fixed 버전 업데이트 | 의도적 고정 | 스킵 |
| MAJOR 자동 적용 | Breaking changes | 개별 확인 |
| Lock 파일 무시 | 재현 불가 빌드 | 항상 커밋 |
| 보안 경고 무시 | 취약점 | 심각도별 대응 |
| 병렬 pnpm install | WSL2 I/O 병목 | 순차 실행 |

## 보안 심각도별 대응

| 심각도 | 조치 |
| ------ | ---- |
| Critical | 즉시 수정 |
| High | 24시간 내 수정 |
| Moderate | 1주 내 수정 |
| Low | 다음 릴리스에 포함 |

## Nasun 모노레포 특화

**워크스페이스 구조**:
- `packages/*` — 공유 패키지 (`@nasun/wallet`, `@nasun/devnet-config` 등)
- `apps/*/frontend/` — 프론트엔드 앱들
- `apps/pado/scripts/` — 스크립트 (별도 package.json)
- `apps/pado/bots/` — LP Bot (별도 package.json)

**내부 패키지** (`workspace:*`):
- 버전 업데이트 대상이 아님
- 의존성 그래프에서 제외

**WSL2 주의사항**:
- 병렬 `pnpm install`이나 `build`는 I/O 병목 유발
- 순차적으로 실행 권장
