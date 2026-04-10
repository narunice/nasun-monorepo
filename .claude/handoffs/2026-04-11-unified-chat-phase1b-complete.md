# Handoff: Nasun Unified Chat Server (Phase 1b Complete)

**생성**: 2026-04-11 14:30
**브랜치**: main
**이전 핸드오프**: [2026-04-10-unified-chat-phase1b.md](2026-04-10-unified-chat-phase1b.md)

## 현재 상태 요약

Phase 1b (닉네임 + 팔로우 + GP 뱃지 + @mention) 완료. staging 배포 및 검증 완료. 프로덕션 chat-server .env만 수정됨 (NASUN_PROFILE_API_URL DNS 수정). 프로덕션 코드 배포는 미완료.

## 완료된 작업

### Phase 1b: 닉네임 + 팔로우 + 추가 기능
- [x] store.ts: 닉네임 테이블 + 함수 이식 (validate/get/set/clear/batch/rateLimit)
- [x] store.ts: 팔로우 테이블 + 함수 이식 (toggle/getFollowing/getFollowerCounts)
- [x] store.ts: Genesis Pass badge (has_genesis_pass 컬럼 + batch 조회)
- [x] types.ts: nickname/follow/clear_nickname 메시지 타입, senderBadge 필드
- [x] server.ts: 닉네임/팔로우 핸들러 + 세션 토큰 + GP 체크
- [x] server.ts: client-provided displayName 지원 (auth_response.displayName)
- [x] 프론트엔드: SetNicknameModal (set/change/reset) + 설명 문구
- [x] 프론트엔드: chat-service.ts nickname/follow/GP 프로토콜
- [x] 프론트엔드: useChat hook - nickname state, displayName 해석 (linkedAccounts.twitter.username)
- [x] 프론트엔드: MessageList - senderNickname#suffix 표시, GP 뱃지
- [x] 프론트엔드: @mention (이름 클릭 -> 입력창에 @[이름] 자동 삽입)
- [x] 프론트엔드: 이모지 picker - 2행 7열 grid, fixed positioning (z-56)
- [x] 프론트엔드: 모바일 채팅창 좌측 잘림 수정 (480px 미만 left:8/right:8)
- [x] 프론트엔드: ChatWidget 연필 아이콘으로 닉네임 편집
- [x] useDailyMissions.ts: explorer API 중복 경로 수정 (/api/v1/api/v1 -> /api/v1)
- [x] 테스트: nickname 25개 + follow 20개 + store 25개 + sanitize 27개 = 97개 통과
- [x] staging 배포 + 검증

## 미완료 작업

### 프로덕션 배포
- [ ] chat-server 빌드 + rsync + pm2 restart
- [ ] frontend production build + rsync
- [ ] prod .env에 GENESIS_PASS_API_URL 추가
- [ ] 프로덕션 검증

### Phase 2: pado 프론트엔드 전환 (미착수)
- [ ] pado frontend의 chat을 nasun-website chat-server로 전환
- [ ] pado chat-server 비활성화

### Phase 3: AI 봇 (미착수)

## 중요 컨텍스트

### 결정사항
- **닉네임 UX**: 자동 모달 제거, 헤더 연필 아이콘으로 선택적 설정
- **displayName 우선순위**: customDisplayName > linkedAccounts.twitter.username > username > walletAddress
- **displayName 전달**: 클라이언트가 auth_response에 displayName 포함 (서버 프로필 API 실패 시 fallback)
- **@mention 형식**: 공백 있는 이름은 `@[Display Name]`, 단순 닉네임은 `@nick#suffix`
- **GP 뱃지**: 서버가 auth 시 genesis-pass/check API 호출, DB에 캐싱, 메시지에 senderBadge:"GP" 포함
- **이모지 picker**: fixed positioning (z-56)으로 overflow 문제 해결, 클릭 시 위치 계산

### 주의사항
- **NASUN_PROFILE_API_URL DNS 문제**: EC2에서 api.nasun.io/api-dev.nasun.io 해석 불가. API Gateway 직접 URL 사용 필수
  - staging: `https://wqf1gach3k.execute-api.ap-northeast-2.amazonaws.com/prod`
  - prod: `https://aanboqet5i.execute-api.ap-northeast-2.amazonaws.com/prod` (이미 수정됨)
- **GENESIS_PASS_API_URL**: staging에만 설정됨, prod 배포 시 추가 필요
  - staging: `https://nxp9xya9rk.execute-api.ap-northeast-2.amazonaws.com/prod`
  - prod: `https://hntjvkuyvk.execute-api.ap-northeast-2.amazonaws.com/prod`
- **better-sqlite3**: Node 22로 rebuild 필요 (`npm run build-release`)
- **useEffect dependency**: user?.walletAddress + customDisplayName + twitterHandle + username (displayName 비동기 로드 대응)

### 핵심 파일 (이번 세션 변경)
- `apps/nasun-website/chat-server/src/store.ts` - 닉네임/팔로우/GP 테이블 + 함수
- `apps/nasun-website/chat-server/src/server.ts` - 핸들러, auth displayName, GP 체크
- `apps/nasun-website/chat-server/src/types.ts` - 메시지 타입, config
- `apps/nasun-website/frontend/src/lib/chat-service.ts` - WS 프로토콜 + 이벤트
- `apps/nasun-website/frontend/src/features/chat/hooks/useChat.ts` - nickname state, displayName 해석
- `apps/nasun-website/frontend/src/features/chat/components/ChatWidget.tsx` - 모바일 수정, 닉네임 UI
- `apps/nasun-website/frontend/src/features/chat/components/MessageList.tsx` - GP 뱃지, @mention, emoji picker
- `apps/nasun-website/frontend/src/features/chat/components/MessageInput.tsx` - insertMention (forwardRef)
- `apps/nasun-website/frontend/src/features/chat/components/SetNicknameModal.tsx` - 신규 컴포넌트
- `apps/nasun-website/frontend/src/hooks/useDailyMissions.ts` - explorer API 경로 수정

### 배포 명령어
```bash
# chat-server build + deploy (staging)
cd apps/nasun-website/chat-server && npx tsc
cd /home/naru/my_apps/nasun-monorepo && rsync -avz --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' -e "ssh -i ~/.ssh/.awskey/naru_seoul.pem" apps/nasun-website/chat-server/ ubuntu@15.165.19.180:~/nasun-chat-server/
ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180 "pm2 restart nasun-chat-server --update-env"

# chat-server deploy (prod)
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/nasun-website/chat-server/ ec2-user@43.200.67.52:~/nasun-chat-server/
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 "pm2 restart nasun-chat-server --update-env"

# frontend build + deploy (staging)
export PATH="/home/naru/.nvm/versions/node/v22.14.0/bin:$PATH"
VITE_NASUN_CHAT_WS_URL=wss://staging.nasun.io/ws/chat pnpm --filter @nasun/nasun-website exec -- vite build --mode development
rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/naru_seoul.pem" apps/nasun-website/frontend/dist/ ubuntu@15.165.19.180:/var/www/staging.nasun.io/

# frontend build + deploy (prod)
VITE_NASUN_CHAT_WS_URL=wss://nasun.io/ws/chat pnpm --filter @nasun/nasun-website exec -- vite build
rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/nasun-website/frontend/dist/ ec2-user@43.200.67.52:/var/www/nasun/dist/
```

## 즉시 다음 단계

1. 프로덕션 배포: chat-server + frontend (prod .env에 GENESIS_PASS_API_URL 추가)
2. 프로덕션 검증: 닉네임, GP 뱃지, @mention, 이모지 picker, displayName 표시
3. Phase 2 계획: pado 프론트엔드 chat을 nasun-website chat-server로 전환
