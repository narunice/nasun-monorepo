---
name: bug-triage
description: 미처리 버그 리포트를 유사 사례별로 묶어 시급성/중요도 순으로 정리하고, 디버그 후 사용자에게 답장과 포인트(1~5점)를 일괄 부여합니다. "버그 트리아지", "bug triage", "버그 리포트 정리", "리포트 답장", "bug report 대응" 등의 요청에 사용합니다.
argument-hint: "[stage] (fetch | draft | apply)"
---

# Bug Report Triage & Response

버그 리포트 대응 파이프라인. **주간 토큰 예산 7% 상한**을 준수해야 하므로 토큰 절약이 최우선이다.

## 파이프라인 개요

3단계로 분리. 각 단계는 명시적 인자 또는 사용자 지시로만 진행한다.

1. **fetch** — 미처리 리포트 수집 + 비-LLM 클러스터링 + 랭킹 (쉘/파이썬만, LLM 호출 없음)
2. **debug** — 사용자와 함께 실제 조치 (Explore 서브에이전트 위임, 클러스터당 ~15k 토큰 soft cap)
3. **apply** — 답장 초안 검토 후 일괄 적용 (Haiku로 초안 생성, Lambda invoke로 일괄 PATCH)

## 운영 원칙 (토큰 절약)

- 입력은 항상 `ProjectionExpression`으로 필드 제한. 본문은 300자 truncate.
- 1차 클러스터링은 **LLM 없이**: `category + 제목 키워드 bag` 해시로 그룹화.
- 2차 정교화가 필요할 때만 **Haiku 4.5**로 그룹 검증 (Opus 금지).
- 답장 초안은 템플릿 치환 + Haiku 1회 배치 호출.
- 메인 컨텍스트 오염 방지: 대량 탐색은 Explore 서브에이전트에 위임하고 요약만 받는다.
- 예산 계측: `cache/budget-ledger.jsonl`에 stage·추정 토큰 기록. 누적 7% 근접 시 중단 경고.

## 데이터 원본

- **AWS**: `nasun-prod` profile, `ap-northeast-2`
- **DynamoDB**: `nasun-bug-reports` (PK: `reportId`, SK: `timestamp`, GSI: `status-index`)
- **Admin Lambda**: PATCH /admin/bug-reports/{reportId} — `aws lambda invoke`로 우회 호출
  - Lambda 함수명은 최초 실행 시 확인: `aws lambda list-functions --profile nasun-prod --region ap-northeast-2 | grep bug-report-admin`

## 인자 처리

`$ARGUMENTS`:
- `fetch` (기본) — Stage 1 실행
- `debug` — Stage 2 (클러스터 번호 같이 받음, 예: `debug 3`)
- `apply` — Stage 3 (`drafts/pending.json` 기반)

## Stage 1: fetch

```bash
bash .claude/skills/bug-triage/scripts/fetch-open-reports.sh
```

출력: 클러스터별 요약표 (우선순위 점수 내림차순), 각 리포트는 `reportId` + 제목 + 제출일 + walletAddress 유무 정도만. 본문 샘플은 클러스터당 1건만.

우선순위 점수 = `severity_weight × log2(1 + frequency) × recency_factor`
- severity: Security=5, Wallet Issue=4, Performance=3, UI Bug=2, Other/Feedback=1.5, Feature Request=1
- recency_factor: 7일 내=1.0, 30일 내=0.7, 그 이상=0.4

## Stage 2: debug

사용자가 선택한 클러스터에 대해:

1. 대표 리포트 1건의 재현 경로 확인 (필요 시 스크린샷 S3 URL presigned)
2. **Explore 서브에이전트** 호출해서 관련 코드 경로 찾기. 메인은 파일 경로 + 증거만 받는다.
3. 사용자와 대화로 원인 합의 → 수정은 별도 세션(새 `/code-review` 또는 수동)로 분리 권장
4. 결과를 `cache/debug-log.json`에 요약 저장:
   - cluster_id, rootCause, fixCommit (있으면), replyGist, proposedPoints

클러스터당 토큰 soft cap 15k. 초과 시 사용자에게 계속할지 확인.

## Stage 3: apply

1. `cache/debug-log.json` 읽어 리포트별 답장 초안 생성 (Haiku 배치)
2. 템플릿: `templates/reply.md`
   - **반드시 "We"로 운영자 지칭, em dash 금지**
   - 상태: `fixed`(bug 카테고리) / `accepted`(feedback 카테고리) / `duplicate`
3. 포인트 매핑 (duplicate도 중요도 기준으로 지급):
   - Security 재현됨: 5
   - Wallet Issue 재현됨: 4~5
   - Performance / UI Bug 재현됨: 3~4
   - 유효한 Feedback / Feature Request: 2~3
   - 정보 부족/재현 불가지만 성의 있는 리포트: 1~2
4. 초안을 `drafts/pending.json`에 저장 후 사용자에게 표로 제시 → 승인
5. 승인된 항목만 `scripts/apply-resolutions.sh` 실행 (Lambda invoke 루프)

## Lambda 호출 포맷

```bash
aws lambda invoke --profile nasun-prod --region ap-northeast-2 \
  --function-name "<bug-report-admin-fn>" \
  --payload "$(cat <<EOF | base64 -w0
{
  "httpMethod": "PATCH",
  "path": "/admin/bug-reports/$REPORT_ID",
  "pathParameters": {"reportId": "$REPORT_ID"},
  "body": "{\"timestamp\":\"$TS\",\"status\":\"fixed\",\"adminNote\":\"...\",\"bonusPoints\":3}",
  "requestContext": {"authorizer": {"claims": {"sub": "claude-triage-agent"}}}
}
EOF
)" /tmp/bug-triage-resp.json
```

> 주의: Lambda가 JWT claims에서 admin 권한을 확인하는 경우 `authorizer.claims`에 ADMIN role 있는 계정의 `sub`가 필요할 수 있다. 최초 apply 시 Lambda 403 응답이면 사용자에게 admin identityId를 요청한다.

## 멱등성

- DynamoDB: Lambda가 기존 `rewardStatus === 'rewarded'` 체크.
- Explorer API: `tx_digest = bugreport:{reportId}` / `feedback:{reportId}` 중복 삽입 차단.
- 스킬: 적용 성공한 reportId를 `cache/applied.json`에 기록. 재실행 시 skip.

## 주의

- **문체**: 운영자는 "We". em dash 금지. 영어로 작성.
- **절대 작업하지 않는 것**: 사용자 승인 없이 apply 실행, 포인트 5점 초과 부여, `bug-report-admin` Lambda 외 경로로 DynamoDB 직접 수정.
- prod 환경이므로 dry-run 모드(`APPLY_DRY_RUN=1`)를 기본값으로 한다.
