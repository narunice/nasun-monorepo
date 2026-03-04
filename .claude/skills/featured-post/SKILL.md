---
name: featured-post
description: Battalion NFT 페이지의 featured post(추천 트윗)를 변경합니다. "featured post 변경", "추천 트윗 바꿔줘", "이벤트 트윗 변경", "featured-post" 등의 요청에 사용합니다.
---

# Featured Post: Battalion NFT 추천 트윗 변경

Battalion NFT 페이지(Step1 Welcome, Step3 Task Verification)에서 사용자에게 보여주는 추천 트윗을 변경합니다.

## 구조

| 환경변수 | 역할 | 위치 |
|---------|------|------|
| `VITE_EVENT_TWEET_ID` | 추천 트윗 ID | `.env.production`, `.env.development`, `.env.staging` |
| `VITE_TARGET_TWEET_ACCOUNT` | X 계정 (변경 금지) | 동일 |

환경변수 파일 경로 (3개 모두 동일한 값으로 유지):

- `apps/nasun-website/frontend/.env.production`
- `apps/nasun-website/frontend/.env.development`
- `apps/nasun-website/frontend/.env.staging`

## $ARGUMENTS 처리

| 입력 | 동작 |
|------|------|
| 트윗 URL (`https://x.com/.../status/123...`) | URL에서 tweet ID 추출 후 3개 파일 업데이트 |
| 숫자 ID (`1234567890`) | 직접 tweet ID로 사용하여 3개 파일 업데이트 |
| 인자 없음 | 현재 설정 조회만 수행 |

## 실행 절차

### Step 1: 현재 설정 확인

`.env.production`에서 현재 `VITE_EVENT_TWEET_ID` 값을 읽어 표시합니다:

```
현재 Featured Post:
  Tweet ID: {current_id}
  URL: https://x.com/Nasun_io/status/{current_id}
```

인자가 없으면 여기서 종료합니다.

### Step 2: 새 Tweet ID 추출

- URL 형식 (`https://x.com/.../status/{id}` 또는 `https://twitter.com/.../status/{id}`): 마지막 path segment에서 ID 추출
- 숫자 형식: 그대로 사용
- 그 외: 에러 메시지 출력 후 중단

### Step 3: 환경변수 파일 업데이트

3개 파일에서 `VITE_EVENT_TWEET_ID=` 라인을 찾아 새 값으로 교체합니다.

**Edit 도구 사용** (sed 금지):

```
VITE_EVENT_TWEET_ID={old_id}  →  VITE_EVENT_TWEET_ID={new_id}
```

3개 파일 모두 동일하게 업데이트합니다.

### Step 4: 결과 확인

변경 결과를 요약합니다:

```
Featured Post 변경 완료:
  이전: https://x.com/Nasun_io/status/{old_id}
  변경: https://x.com/Nasun_io/status/{new_id}

  업데이트된 파일:
  - .env.production
  - .env.development
  - .env.staging

적용하려면 빌드 + 배포가 필요합니다.
```

## 주의사항

- `VITE_TARGET_TWEET_ACCOUNT`는 절대 변경하지 않음 (항상 `Nasun_io`)
- 백엔드 검증은 tweet ID와 무관 (UI 가이드 전용)
- 이 스킬은 `.env` 파일만 수정함. 빌드/배포는 별도 (`/ship` → 수동 배포 또는 `/deploy`)
- 3개 파일의 값은 항상 동일하게 유지
