# Handoff: Chat & Leaderboard 최적화

**생성**: 2026-04-20
**브랜치**: main
**이전 핸드오프**: 없음 (신규 작업)

## 현재 상태 요약

nasun-website 채팅 위젯과 리더보드의 4가지 이슈(아바타 404 반복, 리렌더링 과다, Turnstile 경고, 서명 실패 UX)를 수정했다. 모든 코드 변경이 완료됐으나 아직 커밋/배포되지 않았다. Nginx Permissions-Policy 헤더는 이미 프로덕션에 적용됐다.

## 완료된 작업

- [x] `MessageList.tsx`: MessageItem 분리 + React.memo + picker 상태 내부화
- [x] `MessageList.tsx`: ChatAvatar 세션 블랙리스트(failedUrls Set) + memo
- [x] `useChat.ts`: Zustand activeRoomId 단일 셀렉터로 교체 (다른 방 메시지 수신 시 리렌더 차단)
- [x] `ChatWidget.tsx`: 드래그/리사이즈 imperative 최적화 (sizeRef, transform-based drag, 마우스업 시 단일 commit)
- [x] `chatStore.ts` + `useChat.ts` + `ChatWidget.tsx`: authError UX (서명 실패 배너)
- [x] 프로덕션 nginx `Permissions-Policy: xr-spatial-tracking=()` 헤더 추가 (이미 적용됨)
- [x] `LeaderboardV3Row.tsx`: RowAvatar 컴포넌트 분리 + failedAvatarUrls Set (TanStack Query refetch 후 404 반복 차단)
- [x] `.env.staging`: Turnstile site key 추가 (`0x4AAAAAAC_uuaHG1V3HYNUP`) - Cloudflare 위젯에 staging.nasun.io 등록 완료

## 미완료 작업

- [ ] 스테이징 빌드 및 배포 (사용자가 직접 진행 예정)
- [ ] 스테이징 검증 후 프로덕션 배포
- [ ] 커밋 생성 (사용자 요청 시)

## 중요 컨텍스트

- **결정사항**: Turnstile staging 이슈 - test key 대신 프로덕션 site key를 staging에도 사용. Cloudflare 위젯에 staging.nasun.io 도메인 추가로 해결.
- **결정사항**: Turnstile `isOpen` 조건 추가 안 함 - 채팅창 열고닫을 때마다 토큰 재발급되면 rate limit 위험
- **주의사항**: ChatWidget.tsx의 drag/resize 로직은 CSS transform 기반 imperative 방식으로 변경됨. `right`/`bottom` 스타일을 `onResizeStart`에서 명시적으로 클리어해야 `left`/`top` 기반 positioning과 충돌하지 않음.
- **주의사항**: LeaderboardV3Row의 `failedAvatarUrls`는 세션 범위(페이지 리로드 시 초기화). 영구 캐시 아님.
- **pbs.twimg 404 원인**: 리더보드 데이터에 삭제된 Twitter 계정의 프로필 이미지 URL이 포함되어 있음. TanStack Query refetch 시마다 새 img 엘리먼트 생성으로 재요청 발생했던 것.

## 최근 변경 파일

- `apps/nasun-website/frontend/src/features/chat/components/ChatWidget.tsx`
- `apps/nasun-website/frontend/src/features/chat/components/MessageList.tsx`
- `apps/nasun-website/frontend/src/features/chat/hooks/useChat.ts`
- `apps/nasun-website/frontend/src/features/leaderboard-v3/components/LeaderboardV3Row.tsx`
- `apps/nasun-website/frontend/src/store/chatStore.ts`
- `apps/nasun-website/frontend/.env.staging` (VITE_TURNSTILE_SITE_KEY 추가)
- 프로덕션 EC2 `/etc/nginx/conf.d/nasun.conf` (Permissions-Policy 헤더, 이미 적용됨)

## 즉시 다음 단계

1. 스테이징 빌드: `pnpm --filter @nasun/nasun-website exec -- vite build --mode staging`
2. 스테이징 배포: `rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/naru_seoul.pem" apps/nasun-website/frontend/dist/ ubuntu@15.165.19.180:/var/www/staging.nasun.io/`
3. 스테이징에서 검증: 채팅 연결(Turnstile 통과), 아바타 404 재발 없음, 드래그/리사이즈 동작
4. 검증 완료 후 프로덕션 빌드 및 배포
