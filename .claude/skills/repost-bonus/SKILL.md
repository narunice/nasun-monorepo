---
name: repost-bonus
description: 나선 공식 X 계정 게시물을 리포스트한 사용자들에게 ecosystem-bonus-repost 카테고리로 3포인트를 지급합니다. 트윗 ID와 리포스트 사용자 목록(raw 텍스트, @handle 포함)을 받아 dry-run 확인 후 실행합니다. "repost 보너스", "리포스트 포인트 지급", "repost-bonus" 등의 요청에 사용합니다.
argument-hint: "[tweet_id] [handles or raw text with @mentions]"
---

# Repost Bonus: 리포스트 사용자 포인트 지급

## 개요

리포스트 대상 트윗 ID와 리포스트한 사용자 목록을 받아, `activity_points` 테이블에
`ecosystem-bonus-repost` 카테고리로 3pt를 지급합니다.

스크립트: `apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts`
tx_digest 형식: `repost:{tweetId}:{xHandle}` (idempotent — 같은 트윗+핸들은 중복 지급 안 됨)

---

## 실행 절차

### 1단계: 입력 수집

`$ARGUMENTS`에서 트윗 ID와 핸들 목록을 파악합니다.

- 트윗 ID: URL `https://x.com/.../status/{id}` 에서 숫자 부분, 또는 직접 제공
- 핸들 목록: 어떤 형식이든 `@handle` 패턴이 있으면 자동 추출

둘 중 하나라도 없으면 사용자에게 묻습니다.

### 2단계: 스크립트 수정

Read 후 Edit으로 스크립트의 두 상수를 업데이트합니다:

```typescript
const TWEET_ID = 'TWEET_ID_HERE';  // 실제 트윗 ID로 교체

const RAW_INPUT = `
@handle1 @handle2 ...  // 사용자가 준 텍스트 그대로 붙여넣기
`;
```

파일 경로: `apps/network-explorer/api-server/src/scripts/grant-repost-bonus.ts`

### 3단계: Dry-run 실행

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/network-explorer/api-server
set -a && source .env && set +a
AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-repost-bonus.ts
```

dry-run 결과를 사용자에게 보여줍니다:
- 추출된 핸들 수
- Mapped (eligible) / Missing / No-wallet 분류
- 지급 예정 총 포인트

### 4단계: 사용자 확인 후 실행

사용자가 결과를 확인하고 "실행" 또는 "yes" 등으로 승인하면:

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/network-explorer/api-server
set -a && source .env && set +a
AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-repost-bonus.ts --execute
```

실행 결과(Inserted / Skipped)를 보고합니다.

---

## 주의사항

- 스크립트 수정 후 반드시 dry-run 먼저 실행. 결과 확인 없이 --execute 금지.
- `TWEET_ID`가 다르면 같은 핸들도 별도 tx_digest로 처리됨 (다른 트윗 리포스트 = 별도 보너스 가능).
- Missing/no-wallet 사용자는 나선 계정이 없거나 지갑 미연결 상태. 지급 불가이므로 그냥 넘어감.
- 실행 후 사용자들은 my-account Updates 캐러셀에서 파란색 "Repost Bonus" 카드로 수령 확인 가능.
