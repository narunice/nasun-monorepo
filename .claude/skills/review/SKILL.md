---
name: review
description: 플랜 파일을 3개 독립 에이전트가 병렬로 리뷰합니다. 실현가능성, 아키텍처, 대안 관점에서 검증합니다. "리뷰해줘", "계획 검토", "review plan" 등의 요청에 사용합니다.
argument-hint: "[plan-file-path]"
---

# Review: 플랜 독립 리뷰

플랜 파일을 3개의 독립 에이전트가 병렬로 리뷰하여 다각도 검증을 수행합니다.

## 실행 절차

### 1단계: 플랜 파일 로드

1. `$ARGUMENTS`가 있으면 해당 경로의 파일을 Read로 읽음
2. `$ARGUMENTS`가 없으면 아래 순서로 탐색:
   - `ls -t ~/.claude/plans/*.md | head -1` 로 가장 최근 플랜 파일 선택
3. 파일을 찾지 못하면 사용자에게 경로를 요청
4. 파일이 비어있거나 의미 있는 내용이 없으면 "리뷰할 내용이 부족합니다" 메시지와 함께 중단

### 2단계: 병렬 리뷰 (3 에이전트)

> **Severity 기준**: Critical = 빌드 실패·보안 취약점·데이터 손실 | Warning = 기술부채·성능·유지보수 | Note = 개선 제안

플랜 파일의 전체 내용을 읽은 뒤, **3개 에이전트를 병렬로** 실행합니다.
각 에이전트에게 플랜 전문을 프롬프트에 포함하여 전달합니다.

#### 에이전트 1: 실현가능성 리뷰어

```
subagent_type: Plan
description: "Review plan feasibility"
```

프롬프트 지침:
- 계획이 실제로 실행 가능한지 검증
- 빠진 단계, 암묵적 가정, 엣지케이스 식별
- 의존성 순서가 올바른지 확인
- 검증/테스트 계획이 충분한지 확인
- 결과를 아래 형식으로 반환:

```
## Feasibility Review

| Severity | Step | Issue | Suggestion |
|----------|------|-------|------------|
| Critical/Warning/Note | 해당 단계 | 설명 | 제안 |
```

#### 에이전트 2: 아키텍처 리뷰어

```
subagent_type: Plan
description: "Review plan architecture"
```

프롬프트 지침:
- 플랜에서 언급된 파일과 주변 모듈을 중심으로 기존 패턴과의 정합성 검증
- 보안 고려사항 점검 (OWASP Top 10, 인증/인가, 입력 검증)
- 성능 영향 평가
- 기존 유틸리티/함수 재사용 가능성 확인
- 결과를 아래 형식으로 반환:

```
## Architecture Review

| Severity | Step | Issue | Suggestion |
|----------|------|-------|------------|
| Critical/Warning/Note | 해당 단계 | 설명 | 제안 |
```

#### 에이전트 3: 대안 리뷰어

```
subagent_type: Plan
description: "Review plan alternatives"
```

프롬프트 지침:
- 더 단순한 접근법이 존재하는지 검토
- 불필요한 복잡성(over-engineering) 식별
- 비용 영향 평가 (AWS 리소스 등)
- "이 계획이 최선인가?" 관점에서 대안 제시
- 결과를 아래 형식으로 반환:

```
## Alternatives Review

| Severity | Step | Issue | Suggestion |
|----------|------|-------|------------|
| Critical/Warning/Note | 해당 단계 | 설명 | 제안 |
```

### 3단계: 결과 종합

3개 에이전트 결과를 수집하여 아래 형식으로 사용자에게 보고합니다:

```markdown
# Plan Review Summary

## Critical Issues
(Critical 심각도 항목만 모아서 표시. 없으면 "None" 표시)

## Warnings
(Warning 심각도 항목만 모아서 표시)

## Notes
(Note 심각도 항목만 모아서 표시)

## Conflicts
(에이전트 간 상충되는 의견이 있을 경우 명시. 없으면 생략)

## Verdict
- Critical이 1개 이상: "BLOCK — 수정 필요"
- Warning만 있음: "PASS WITH WARNINGS — 검토 권장"
- Note만 있음: "PASS — 양호"
```

## 주의사항

- 에이전트는 읽기 전용으로만 동작 (코드 수정 금지)
- 리뷰는 플랜의 품질을 높이기 위한 것이지, 실행을 대체하지 않음
- Critical 이슈가 있어도 최종 판단은 사용자에게 맡김
