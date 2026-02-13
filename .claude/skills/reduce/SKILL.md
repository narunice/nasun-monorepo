---
name: reduce
description: 코드베이스의 엔트로피를 줄입니다. 사용하지 않는 코드, 중복, 불필요한 추상화를 찾아 제거합니다. "코드 정리해줘", "dead code 제거", "중복 코드 찾아줘", "reduce entropy" 등의 요청에 사용합니다.
---

# Reduce: 코드베이스 엔트로피 감소

**핵심 원칙**: "Bias toward deletion. Measure the end state."

코드를 추가하는 것이 아니라 줄이는 것이 목표입니다.
50줄을 작성해서 200줄을 삭제하면 = net win.

## 사용자 요청 시에만 실행

이 스킬은 명시적 요청이 있을 때만 실행합니다. 프로액티브하게 코드를 삭제하지 않습니다.

## 분석 워크플로

### Step 1: 스코프 결정

사용자에게 확인하거나 컨텍스트에서 추론:

| 스코프 | 분석 대상 |
| ------ | --------- |
| 특정 파일 | 지정된 파일만 |
| 특정 feature | `features/{name}/` 디렉토리 전체 |
| 특정 앱 | `apps/{name}/` 전체 |
| 모노레포 전체 | 모든 앱과 패키지 |

### Step 2: Dead Code 탐지

**자동 도구 활용** (설치되어 있으면):

```bash
# 사용하지 않는 exports/imports/dependencies 탐지
npx knip --reporter compact

# 사용하지 않는 npm 패키지 탐지
npx depcheck

# TypeScript 미사용 exports
npx ts-prune
```

**수동 탐지** (도구 없이):

- `Grep`으로 export된 함수/컴포넌트의 import 여부 확인
- `Glob`으로 고아 파일(어디서도 import하지 않는 파일) 탐지
- 주석 처리된 코드 블록 찾기
- `TODO` 없는 임시 코드 찾기

### Step 3: 중복 코드 탐지

- 동일/유사 함수가 여러 파일에 존재하는지 확인
- 패키지 간 중복 유틸리티 찾기
- 인라인으로 충분한 불필요한 추상화 식별

### Step 4: 분석 보고

발견사항을 테이블로 정리:

```markdown
| 유형 | 파일 | 설명 | 삭제 가능 라인 |
|------|------|------|---------------|
| Dead export | src/utils/old.ts | 어디서도 import하지 않음 | 45 |
| 중복 함수 | src/a.ts, src/b.ts | formatDate 동일 구현 | 12 |
| 미사용 패키지 | package.json | lodash (사용처 없음) | - |
```

### Step 5: 삭제 실행

사용자 승인 후 삭제를 진행합니다.

**삭제 순서**:
1. 미사용 npm 패키지 제거 (`pnpm remove`)
2. 고아 파일 삭제
3. Dead export/함수 제거
4. 중복 코드 통합
5. `pnpm build` 또는 `tsc --noEmit`으로 검증

## Red Flags (피해야 할 사고 패턴)

| 함정 | 설명 |
| ---- | ---- |
| 현상 유지 편향 | "있으니까 남겨두자" → 사용 안 하면 삭제 |
| YAGNI 위반 | "나중에 쓸지도" → 지금 안 쓰면 삭제 |
| 과도한 분리 | "파일/함수가 많을수록 정리된 것" → 파일 수 = 복잡성 |
| 거짓 트레이드오프 | "정리 vs 엔트로피" → 정리가 곧 엔트로피 감소 |

## Nasun 모노레포 특화

**분석 제외 대상**:
- `node_modules/`, `dist/`, `build/`, `.next/`
- `apps/baram/` (LEGACY, 코드 변경 금지)
- `pnpm-lock.yaml`

**모노레포 경계 인식**:
- `packages/` 내 공유 코드는 모든 앱에서의 사용 여부를 확인
- 앱별 코드는 해당 앱 내에서만 확인
- `@nasun/*` 내부 패키지 간 의존성 그래프 고려

## 측정 기준

최종 결과를 수치로 보고:

```
Before: X files, Y lines
After:  X' files, Y' lines
Reduced: Z files, W lines (N% reduction)
```
