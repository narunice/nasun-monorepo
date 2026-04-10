# Handoff: Nasun Ecosystem Unified Chat Server (Phase 1a)

**생성**: 2026-04-10 20:30
**브랜치**: main
**롤백 포인트**: `6132887b`
**플랜 파일**: `~/.claude/plans/abstract-meandering-lovelace.md`
**이전 핸드오프**: 없음

## 현재 상태 요약

nasun-website chat-server를 생태계 공용 채팅 서버로 승격하는 작업 중. Phase 1a (인증 전환: Cognito JWT -> 지갑 서명)의 auth.ts와 types.ts 교체를 완료했고, store.ts와 server.ts 변경 + 프론트엔드 적응이 남아있다.

## 완료된 작업

### 이전 세션 (Unified Profile API)
- [x] nasun-website `GET /user-profile?walletAddress=` Public Profile API 구현 (WALLET_OWNER sentinel)
- [x] pado chat-server에 nasun profile 캐시 연동 (getDisplayName/getDisplayNamesBatch)
- [x] API Gateway throttling 추가 (burst 50, rate 20)
- [x] customDisplayName 입력 검증 강화 (RTL, zero-width, @/0x 접두사 거부)
- [x] CDK 배포 완료 (dev + prod)
- [x] pado chat-server 프로덕션 배포 완료 (PM2, NASUN_PROFILE_API_URL 설정)

### 이번 세션 (Chat 기능)
- [x] 채팅 멘션 알림 (소리 + 뱃지 + ON/OFF 토글)
- [x] 내 메시지 오른쪽 정렬 + 배경색
- [x] 리액션 + 버튼 항상 보이기 + 메시지 왼쪽 배치
- [x] chat-server dev 환경 설정 (.env 로더, Node 22 호환, graceful shutdown)
- [x] AuthProvider에 customDisplayName 매핑 추가
- [x] display name 폴백 체인 (customDisplayName > Twitter > Google email > username)

### Phase 1a 진행 중
- [x] auth.ts 교체: Cognito JWT -> 지갑 서명 (personal_sign only, ~75줄)
- [x] types.ts 교체: challenge-response 프로토콜 (AuthMessage -> AuthResponseMessage, auth_required -> auth_challenge)
- [x] package.json: jose 제거, @mysten/sui 추가

## 미완료 작업

### Phase 1a (인증 전환) - 잔여
- [ ] store.ts 스키마 변경: identity_id -> address PK, sender_id -> sender
- [ ] server.ts 인증 플로우 전환: challenge-response + 비동기 프로필 fetch
- [ ] 프론트엔드 chat-service.ts: challenge-response 인증
- [ ] 프론트엔드 useChat.ts: cognitoToken -> wallet signer
- [ ] TypeScript 컴파일 + 로컬 테스트
- [ ] 배포 시 기존 chat.db 삭제 (fresh DB)

### Phase 1b (닉네임 + 팔로우) - 미착수
- [ ] store.ts: 닉네임 함수 이식 (~133줄 from pado)
- [ ] store.ts: 팔로우 함수 이식 (~65줄 from pado)
- [ ] server.ts: 닉네임/팔로우 핸들러
- [ ] types.ts: set_nickname, check_nickname, toggle_follow, get_following
- [ ] 프론트엔드: SetNicknameModal 이식
- [ ] 세션 토큰 시스템 (~60줄)

### Phase 2 (pado 전환) - 미착수
### Phase 3 (AI 봇) - 미착수

## 중요 컨텍스트

### 결정사항
- **인증**: 지갑 서명 전용 (Cognito JWT 레거시, Google/Twitter 전용 계정 없음)
- **Ephemeral key (zkLogin)**: 제거 (nasun-website 미사용, 향후 필요 시 추가)
- **통합 식별자**: walletAddress (Phase 1부터 최종 키 스키마)
- **프로필 연동**: 인증 시 비동기 fetch (인증 latency 영향 0)
- **DB 마이그레이션**: fresh DB (기존 chat.db 삭제)

### 주의사항
- **Node 버전 차이**: WSL 터미널은 v22.22.2, Claude Bash tool은 v18.19.1. better-sqlite3 네이티브 모듈이 Node 버전에 따라 segfault 발생. `npm rebuild better-sqlite3` 필요.
- **tsx segfault**: tsx가 foreground에서 segfault 발생. dev 스크립트는 `tsc && node --env-file=.env dist/server.js`로 우회.
- **MetaMask SES**: MetaMask 확장의 SES lockdown이 키보드 이벤트 가로챔. 시크릿 모드에서 테스트 권장.
- **pnpm dev 좀비 프로세스**: chat-server 프로세스가 포트 3101을 점유한 채 남을 수 있음. `fuser -k 3101/tcp`로 정리.

### 핵심 파일 (이식 소스)
- `apps/pado/chat-server/src/auth.ts` -- personal_sign 분기 (이미 이식 완료)
- `apps/pado/chat-server/src/store.ts:164-296` -- 닉네임 시스템 (~133줄, Phase 1b)
- `apps/pado/chat-server/src/store.ts:405-469` -- 팔로우 시스템 (~65줄, Phase 1b)
- `apps/pado/chat-server/src/server.ts:68-133` -- 세션 토큰 (~60줄, Phase 1b)

### 핵심 파일 (수정 대상)
- `apps/nasun-website/chat-server/src/auth.ts` -- 교체 완료
- `apps/nasun-website/chat-server/src/types.ts` -- 교체 완료
- `apps/nasun-website/chat-server/src/store.ts` -- 스키마 변경 필요
- `apps/nasun-website/chat-server/src/server.ts` -- 인증 플로우 전환 필요
- `apps/nasun-website/chat-server/package.json` -- 의존성 변경 완료
- `apps/nasun-website/frontend/src/lib/chat-service.ts` -- 프로토콜 변경 필요
- `apps/nasun-website/frontend/src/features/chat/hooks/useChat.ts` -- signer 연동 필요

### 프론트엔드 signing 방법
- `packages/wallet/src/core/signer/types.ts`의 `SignerAdapter.signPersonal(message: Uint8Array)` 사용
- 모든 signer 타입 (LocalSigner, ZkLoginSigner, PasskeySigner 등)에서 지원 확인됨

## 최근 변경 파일 (미커밋)

```
M apps/nasun-website/chat-server/package.json  -- jose 제거, @mysten/sui 추가
M apps/nasun-website/chat-server/src/auth.ts   -- Cognito JWT -> 지갑 서명으로 교체
M apps/nasun-website/chat-server/src/types.ts  -- challenge-response 프로토콜
```

## 즉시 다음 단계

1. `store.ts` 스키마 변경: `identity_id` -> `address`, `sender_id` -> `sender`, `user_id` -> `address`
2. `server.ts` 인증 플로우 전환: `handleAuth` -> challenge-response, 비동기 프로필 fetch
3. 프론트엔드 `chat-service.ts`: `auth` 메시지 -> `auth_response` + wallet signPersonal
4. 프론트엔드 `useChat.ts`: cognitoToken 의존성 -> wallet signer 의존성
5. `pnpm install` (새 @mysten/sui 의존성)
6. TypeScript 컴파일 확인 + 로컬 테스트
7. 커밋 + 푸시
