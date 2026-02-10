---
name: ship
description: 변경사항을 논리적 커밋 단위로 분류하고, Conventional Commits 포맷으로 커밋 메시지를 작성한 뒤, security/code review를 거쳐 push합니다. "커밋 푸시해줘", "변경사항 올려줘", "ship it" 등의 요청에 사용합니다.
---

# Ship: 커밋 + 리뷰 + 푸시

모든 변경사항을 분석하여 논리적 커밋 단위로 나누고, 보안/코드 리뷰를 거쳐 push합니다.

## 실행 절차

### 1단계: 현황 파악

아래 명령어를 **병렬로** 실행하여 현재 상태를 파악합니다:

- `git status` — 변경/추가/삭제된 파일 목록 (절대 `-uall` 플래그 사용 금지)
- `git diff` + `git diff --staged` — staged/unstaged 변경사항
- `git log --oneline -10` — 최근 커밋 메시지 스타일 참조

### 2단계: 커밋 단위 분류

변경사항을 논리적 단위로 분류합니다:

- **앱/패키지별 분리**: 다른 앱의 변경사항은 별도 커밋
- **기능별 분리**: 새 기능, 버그 수정, 리팩토링은 별도 커밋
- **설정 파일**: root 설정 변경은 별도 `chore` 커밋

### 3단계: 커밋 메시지 작성

**Conventional Commits** 포맷을 따릅니다:

```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**type**: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `perf`
**scope**: 앱/패키지 이름 (예: `pado`, `baram-aer`, `wallet`)

규칙:
- 제목은 영어, 간결하게 (50자 이내 권장)
- "why"에 집중, "what"은 코드가 말해줌
- `add` = 완전히 새로운 기능, `update` = 기존 기능 개선, `fix` = 버그 수정
- `.env`, `credentials.json` 등 비밀 정보가 포함된 파일은 절대 커밋하지 않음. 발견 시 경고

### 4단계: 보안 + 코드 리뷰

`$ARGUMENTS`에 `--no-review`가 없으면 리뷰를 실행합니다:

- **security-reviewer** 에이전트: 보안 취약점 검사
- **code-reviewer** 에이전트: 코드 품질 검사

두 에이전트를 **병렬로** 실행합니다.
리뷰에서 critical/high 이슈가 발견되면 사용자에게 보고하고 push를 중단합니다.

### 5단계: 커밋 + 푸시

1. 파일별로 `git add` (구체적 파일 지정, `git add .` 사용 금지)
2. HEREDOC 형식으로 커밋 생성
3. `git push origin <current-branch>`

## $ARGUMENTS 처리

- **인자 없음**: 전체 변경사항을 커밋 + 리뷰 + 푸시
- **커밋 메시지 힌트**: `$ARGUMENTS`를 커밋 메시지의 힌트로 사용 (예: `/ship NETH decimal fix`)
- **`--no-review`**: security/code review 단계를 건너뜀 (급할 때만 사용)
- **`--dry-run`**: 커밋 메시지만 보여주고 실제 커밋/푸시는 하지 않음

## 주의사항

- `.env`, 비밀키, 인증서 파일은 절대 커밋하지 않음
- force push 절대 금지
- `--no-verify` 절대 사용 금지
- 커밋 전 반드시 변경사항이 있는지 확인 (빈 커밋 방지)
- main/master 브랜치에 force push 시도 시 경고 후 중단
