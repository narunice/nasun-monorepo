# Handoff: Nasun Unified Chat Server (Phase 1b - Nickname + Follow)

**생성**: 2026-04-10 23:50
**브랜치**: main
**이전 핸드오프**: [2026-04-10-unified-chat-server.md](2026-04-10-unified-chat-server.md)
**플랜 파일**: `~/.claude/plans/abstract-meandering-lovelace.md`

## 현재 상태 요약

Phase 1a (인증 전환 + 채팅 UX) 완료 및 프로덕션 배포됨. nasun-website chat-server가 지갑 서명 인증 (personal_sign + zkLogin ephemeral) 기반으로 운영 중. Phase 1b (닉네임 + 팔로우 이식)가 다음 작업.

## 완료된 작업

### Phase 1a: 인증 전환 + 배포
- [x] auth.ts: Cognito JWT -> 지갑 서명 (personal_sign + ephemeral key)
- [x] store.ts: DB 스키마 변경 (sender_id->sender, identity_id->address)
- [x] types.ts: challenge-response 프로토콜, AuthResponseMessage에 authMethod/ephemeralPubKey
- [x] server.ts: challenge-response 인증 플로우, 비동기 프로필 fetch (await), per-client myReaction broadcast
- [x] chat-service.ts: ChatSignFn 콜백, auth_challenge 처리
- [x] useChat.ts: wallet signer (LocalSigner/PasskeySigner/ZkLoginSigner 모두 지원)
- [x] ChatWidget.tsx: 로그아웃 사용자에게 "Connect wallet to chat" 안내
- [x] MessageList.tsx: 메시지 클릭 -> 리액션 picker (리액션 버튼 제거)
- [x] ReactionBar.tsx: pills 전용 (add 버튼 제거), 이모지 14종
- [x] chatStore.ts: updateReaction에 myReaction 파라미터
- [x] auth.ts 보안 개선: ephemeral TOFU binding 전 프로필 API 주소 존재 검증
- [x] trustProxy 설정 추가 (X-Forwarded-For 신뢰 제어)
- [x] 테스트 파일 업데이트 (server.test.ts, store.test.ts)
- [x] staging 배포 + 검증 (staging.nasun.io)
- [x] 프로덕션 배포 + 검증 (nasun.io)

## 미완료 작업

### Phase 1b: 닉네임 + 팔로우 이식
- [ ] store.ts: 닉네임 테이블 + 함수 이식 (~133줄 from pado)
- [ ] store.ts: 팔로우 테이블 + 함수 이식 (~65줄 from pado)
- [ ] types.ts: set_nickname, check_nickname, toggle_follow, get_following 메시지 타입
- [ ] server.ts: 닉네임/팔로우 핸들러 + 세션 토큰 (~60줄 from pado)
- [ ] 프론트엔드: SetNicknameModal 컴포넌트 이식
- [ ] 프론트엔드: chatStore에 nickname/following 상태 추가
- [ ] staging 배포 + 검증
- [ ] 프로덕션 배포

### Phase 2: pado 프론트엔드 전환 (미착수)
### Phase 3: AI 봇 (미착수)

## 중요 컨텍스트

### 결정사항
- **인증**: 지갑 서명 전용 (personal_sign for LocalSigner/PasskeySigner, ephemeral for ZkLoginSigner)
- **ephemeral 보안**: TOFU + 프로필 API 주소 존재 검증 (devnet 수준)
- **리액션 UX**: 메시지 클릭으로 picker 열림, 별도 버튼 없음
- **서버 reaction broadcast**: per-client myReaction 포함 (N+1 쿼리, 현재 규모에서 OK)
- **DB 마이그레이션**: Phase 1b는 ALTER TABLE + CREATE IF NOT EXISTS (기존 데이터 유지)

### 주의사항
- **Node 버전**: Bash tool은 Node 18, 빌드는 Node 22 필요 (`export PATH="/home/naru/.nvm/versions/node/v22.14.0/bin:$PATH"`)
- **better-sqlite3**: 서버에서 pado-chat-server의 빌드된 바이너리를 복사 (npm rebuild 실패)
  - staging: `~/pado-chat-server/node_modules/better-sqlite3/build`
  - prod: `/var/www/pado-chat-server/node_modules/better-sqlite3/build`
- **rsync 경로**: 반드시 monorepo root에서 실행 (cd로 이동하면 상대경로 깨짐)
- **ecosystem.config.cjs**: `--env-file` 제거됨 (Node 18 미지원, env.ts 자체 로더 사용)
- **linter 수정**: auth.ts에 MAX_PENDING_CHALLENGES 추가, server.ts에 trustProxy + encodeURIComponent 적용, types.ts에 trustProxy 필드 추가됨

### 핵심 파일 (이식 소스 for Phase 1b)
- `apps/pado/chat-server/src/store.ts:164-296` -- 닉네임 시스템 (~133줄)
- `apps/pado/chat-server/src/store.ts:405-469` -- 팔로우 시스템 (~65줄)
- `apps/pado/chat-server/src/server.ts:68-133` -- 세션 토큰 (~60줄)
- `apps/pado/chat-server/src/server.ts:493+` -- 닉네임/팔로우 핸들러

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

## 최근 변경 파일 (미커밋 - linter 자동 수정)

```
M apps/nasun-website/chat-server/src/__tests__/server.test.ts  -- trustProxy 필드 추가
M apps/nasun-website/chat-server/src/__tests__/store.test.ts   -- trustProxy 필드 추가
M apps/nasun-website/chat-server/src/auth.ts                   -- MAX_PENDING_CHALLENGES 추가
M apps/nasun-website/chat-server/src/server.ts                 -- trustProxy, encodeURIComponent
M apps/nasun-website/chat-server/src/types.ts                  -- trustProxy config 필드
```

## 즉시 다음 단계

1. 미커밋 linter 수정사항 커밋 (`chore: apply linter fixes`)
2. pado store.ts에서 닉네임 함수 이식 (validateNickname, getNickname, setNickname, isNicknameAvailable, getNicknamesBatch, getNicknameRateLimit)
3. pado store.ts에서 팔로우 함수 이식 (toggleFollow, getFollowing, getFollowerCounts, getFollowingCount)
4. types.ts에 닉네임/팔로우 메시지 타입 추가
5. server.ts에 세션 토큰 + 핸들러 추가
6. 프론트엔드 SetNicknameModal + chatStore 확장
7. staging 배포 + 검증 -> 프로덕션 배포
