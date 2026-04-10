# Handoff: Unified Chat Phase 2a + Profile Image + GP Badge

**생성**: 2026-04-10 22:00
**브랜치**: main
**이전 핸드오프**: [2026-04-11-unified-chat-phase1b-complete.md](2026-04-11-unified-chat-phase1b-complete.md)

## 현재 상태 요약

Phase 2a (pado chat -> nasun chat-server 전환) 완료. 프로필 이미지, GP 뱃지, 아바타 통일 모두 staging 배포 및 검증 완료. 프로덕션 배포 미완료. 워킹 트리 clean, 모든 변경사항 push 완료.

## 완료된 작업

### 프로필 이미지 (nasun chat-server + frontend)
- [x] store.ts: profile_image_url 마이그레이션 + upsertUser 확장 + getProfileImagesBatch
- [x] types.ts: senderProfileImageUrl, profileImageUrl 필드 추가
- [x] server.ts: fetchDisplayName에서 profileImageUrl fetch (https only), storedToPayload options 패턴 리팩터
- [x] chat-service.ts: senderProfileImageUrl passthrough
- [x] MessageList.tsx: ChatAvatar 컴포넌트 (프로필 이미지 > boring-avatars fallback)
- [x] boring-avatars 패키지 설치 (nasun-website)
- [x] 내 메시지 양쪽에 아바타 표시 + 우측 정렬 유지
- [x] 내 메시지 말풍선 w-fit (텍스트 길이에 맞춤)

### 아바타 통일
- [x] ProfileHeroCard.tsx: identicon -> boring-avatars 교체
- [x] useProfileDisplay.ts: identicon 의존성 제거

### GP 뱃지
- [x] server.ts: checkGenesisPass 파싱 수정 (hasGenesisPass 필드 사용)
- [x] MessageList.tsx (nasun): 왕관 아이콘 + GP 뱃지 (amber/gold, rounded-full)
- [x] ChatMessage.tsx (pado): 동일 GP 뱃지 스타일
- [x] staging 검증: ETH#LATEST 테스트 데이터 삽입 후 GP 뱃지 표시 확인

### Phase 2a: pado chat -> nasun chat-server
- [x] pado types.ts: senderName, senderBadge, senderProfileImageUrl 추가, RoomInfo.description optional
- [x] pado chat-service.ts: 프로토콜 타입 확장, 새 필드 passthrough, myReaction 지원
- [x] pado ChatMessage.tsx: ChatAvatar + GP 뱃지 + senderName fallback
- [x] pado useChat.ts: reaction_update에서 myReaction 처리
- [x] staging nasun-chat-server ALLOWED_ORIGINS에 staging.pado.finance, localhost:5176 추가
- [x] pado .env.staging, .env.local: VITE_CHAT_WS_URL/HTTP_URL을 nasun chat-server로 변경

### 기타 (이전 세션 미커밋분)
- [x] ReactionBar: wave 이모지 추가
- [x] EcosystemStatusCard: NFT activated pending UX
- [x] pado ErrorBoundary: chunk error 자동 리로드
- [x] pado GettingStartedCard: spot trading 단계 제거
- [x] pado useLeaderboard: pnl 필드 추가
- [x] pado LeaderboardPage: activity 모드에서 PeriodSelector 표시

## 미완료 작업

### 프로덕션 배포
- [ ] prod nasun-chat-server ALLOWED_ORIGINS에 pado.finance 추가
- [ ] nasun-website frontend prod 빌드 + rsync
- [ ] nasun chat-server prod rsync + pm2 restart
- [ ] pado .env.production VITE_CHAT_WS_URL/HTTP_URL 변경
- [ ] pado frontend prod 빌드 + rsync
- [ ] 프로덕션 검증

### 통합 Display Name 시스템 (신규)
- [ ] My Account에서 displayName 직접 편집 UI
- [ ] Profile API customDisplayName 업데이트 엔드포인트
- [ ] Reset/Sync 버튼 (X/Twitter displayName으로 복원)
- [ ] 채팅 닉네임과 통합 display name 관계 정리
- [ ] 모든 생태계 앱에서 통합 displayName 사용

### Phase 2b: leaderboard indexer + market narrator 이식
- [ ] pado chat-server의 leaderboard indexer를 nasun chat-server로 이식
- [ ] pado chat-server의 market narrator를 nasun chat-server로 이식

### Phase 2c: pado chat-server 비활성화
- [ ] pado chat-server pm2 stop (prod/staging)

## 중요 컨텍스트

### 결정사항
- **아키텍처 방향**: nasun chat-server가 생태계 허브 역할. 향후 앱별 기능은 플러그인 패턴으로 연결
- **GP 뱃지 근본 원인**: checkGenesisPass() 파싱 버그 (registered+ACTIVE 대신 hasGenesisPass 필드). Lambda 3-hop lookup은 정상 동작
- **아바타 통일**: boring-avatars (beam variant)를 생태계 표준으로 채택
- **Display Name 순서**: 프로덕션 배포 -> 통합 Display Name -> Phase 2b -> Phase 2c
- **채팅 닉네임 vs Display Name**: 향후 통합 예정. 현재는 별개 시스템 (SQLite vs DynamoDB)

### 주의사항
- **staging ETH collector**: ALCHEMY_API_KEY가 비어있었음. 수동으로 Sepolia URL + key 설정함. CDK .env에 staging용 Alchemy key 추가 필요
- **staging ETH#LATEST**: 테스트 데이터를 수동 삽입함 (admin의 EVM 지갑 0xe682... GP 보유). ETH collector 정상 실행 시 덮어씌워짐
- **ETH collector Sepolia 에러**: `removeUndefinedValues` DynamoDB 에러 발생. Sepolia NFT 데이터에 undefined 필드 포함. 코드 수정 필요 (별도 이슈)
- **pado .env.production**: 아직 변경 안 함. prod 배포 시 변경 필요
- **pado HTTP 폴링**: nasun chat-server에 /api/messages 엔드포인트 없음. 미인증 사용자 읽기 전용 기능 미지원

### 핵심 파일
- `apps/nasun-website/chat-server/src/server.ts` - 프로필 이미지 fetch + GP 파싱 수정
- `apps/nasun-website/chat-server/src/store.ts` - profile_image_url 마이그레이션
- `apps/nasun-website/frontend/src/features/chat/components/MessageList.tsx` - ChatAvatar + GP 뱃지
- `apps/pado/frontend/src/lib/chat-service.ts` - nasun 프로토콜 호환
- `apps/pado/frontend/src/features/social/components/ChatMessage.tsx` - ChatAvatar + GP 뱃지
- `apps/nasun-website/cdk/lambda-src/genesis-pass/check/src/index.ts` - 3-hop GP lookup (참조용)

### 배포 명령어
```bash
# nasun chat-server (staging)
cd apps/nasun-website/chat-server && npx tsc
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' -e "ssh -i ~/.ssh/.awskey/naru_seoul.pem" apps/nasun-website/chat-server/ ubuntu@15.165.19.180:~/nasun-chat-server/
ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180 "pm2 restart nasun-chat-server --update-env"

# nasun chat-server (prod)
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='data/' --exclude='src/__tests__' -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/nasun-website/chat-server/ ec2-user@43.200.67.52:~/nasun-chat-server/
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 "pm2 restart nasun-chat-server --update-env"

# nasun-website frontend (prod)
export PATH="/home/naru/.nvm/versions/node/v22.14.0/bin:$PATH"
VITE_NASUN_CHAT_WS_URL=wss://nasun.io/ws/chat pnpm --filter @nasun/nasun-website exec -- vite build
rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/nasun-website/frontend/dist/ ec2-user@43.200.67.52:/var/www/nasun/dist/

# pado frontend (prod) - .env.production 변경 후
pnpm --filter @nasun/pado exec -- vite build
rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/pado/frontend/dist/ ec2-user@43.200.67.52:/var/www/pado.finance/
```

## 즉시 다음 단계

1. **프로덕션 배포**: prod nasun-chat-server ALLOWED_ORIGINS에 pado.finance 추가 -> chat-server rsync -> nasun-website frontend 빌드/배포 -> pado .env.production 변경 -> pado frontend 빌드/배포
2. **프로덕션 검증**: 프로필 이미지, GP 뱃지, 아바타 일관성, pado-nasun 통합 채팅
3. **통합 Display Name 시스템 설계**: My Account에서 displayName 편집 + 생태계 전체 반영
