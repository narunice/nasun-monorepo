# Handoff: Unified Chat Phase 2b Complete + Phase 2c Done

**생성**: 2026-04-11 12:45
**브랜치**: main
**이전 핸드오프**: [2026-04-10-unified-chat-phase2a-deploy.md](2026-04-10-unified-chat-phase2a-deploy.md)

## 현재 상태 요약

Phase 2b (leaderboard indexer + aggregator + market narrator를 nasun chat-server로 통합) 완료. Phase 2c (pado chat-server 비활성화)도 완료. nasun chat-server가 WS 채팅 + leaderboard REST API + 인덱서 + 어그리게이터 + 나레이터를 모두 서빙하는 hub 역할을 담당.

## 완료된 작업

### Phase 2b: Leaderboard 통합
- [x] types.ts 확장 (ChatServerConfig + messageType 'reply')
- [x] rooms.ts 새로 작성 (nasun 100+ room ID 체계: NBTC->101, NASUN->100, NETH->103, NSOL->104)
- [x] 6개 모듈 복사 (leaderboard-types, leaderboard-store, price-tracker, indexer, aggregator, market-narrator)
- [x] store.ts에 getDisplayName/getDisplayNamesBatch 추가 (nickname > display_name 우선순위)
- [x] leaderboard-api.ts 신규 작성 (20+ REST 엔드포인트, deps injection 패턴, CORS per-route)
- [x] server.ts 통합 (broadcastSystemMessage, 조건부 startup, HTTP 라우팅, graceful shutdown)
- [x] package.json에 @anthropic-ai/sdk optionalDependencies 추가
- [x] 264개 유닛 테스트 통과, tsc 빌드 성공

### 배포
- [x] 스테이징 배포 + 검증 (staging.nasun.io)
- [x] staging nginx /chat/ HTTP 프록시 추가
- [x] leaderboard.db 이관 (pado -> nasun, 2.5GB, WAL checkpoint + integrity check)
- [x] 프로덕션 배포 (nasun chat-server code + env + nginx + pm2)
- [x] nasun.io CloudFront에 /chat/* behavior 추가 (CachingDisabled + AllMethods)
- [x] pado frontend VITE_CHAT_HTTP_URL을 nasun.io/chat으로 전환 + 배포

### Phase 2c
- [x] pado chat-server pm2 stop + save (프로덕션)

### E2E 검증
- [x] 25개 REST API 엣지케이스 테스트 (입력 검증, 경계값, 인증, CORS)
- [x] 에러 로그 확인 (에러 없음)
- [x] 인덱서 정합성 (nasun-pado fill count 동일: 22,329)
- [x] 나레이터 시스템 메시지 확인 (volume surge, momentum, large trade)
- [x] Graceful shutdown 순서 검증 (indexer -> aggregator -> narrator -> WS -> DB)

## 미완료 작업

### Phase 2b.5: Display Name 개선
- [ ] 채팅 미참여 트레이더의 leaderboard 표시가 truncated address
- [ ] nasun profile API에서 display name fetch 캐시 추가 (background job)
- [ ] pado의 nasun_profiles 테이블 로직 참고 (apps/pado/chat-server/src/store.ts line 99-107, 570-589)

### AI Chatbot
- [ ] nasun chat-server용 chatbot 새로 작성 (pado의 ai-chatbot.ts를 이식하지 않음, 타입 시스템 차이)
- [ ] @pado/@wavi 멘션 응답, 시스템 프롬프트 재설계

### 통합 Display Name 시스템
- [ ] My Account에서 displayName 직접 편집 UI
- [ ] Profile API customDisplayName 업데이트 엔드포인트

### 기타
- [ ] ETH collector removeUndefinedValues DynamoDB 에러 수정
- [ ] staging CDK .env에 Alchemy key 추가
- [ ] VITE_CHAT_HTTP_URL 환경변수 정리 (pado .env.production에서 미사용 레거시 삭제)
- [ ] CloudFront /chat/* 캐시 전파 최종 확인 (엣지케이스 GET에서 HTML 반환 문제, 핵심 경로는 정상)

## 중요 컨텍스트

### 아키텍처 결정사항
- **REST API 분리**: leaderboard-api.ts로 분리 (server.ts는 라우팅만). 향후 baram 등 다른 앱 API도 같은 패턴으로 확장 가능
- **deps injection**: handleLeaderboardRequest(req, res, url, corsHeaders, config, deps) 시그니처. resolveSessionToken을 콜백으로 주입하여 모듈 경계 유지
- **Display Name**: users 테이블의 nickname > display_name 우선순위. nasun_profiles 캐시는 Phase 2b.5에서 추가 예정
- **AI Chatbot 보류**: WS가 이미 nasun으로 전환되어 pado chatbot 비활성. nasun용은 별도 작성이 더 깔끔

### 프로덕션 인프라 상태
- **nasun chat-server**: PM2 online, 포트 3101, leaderboard.db 2.5GB
- **pado chat-server**: PM2 stopped (pm2 save 완료)
- **nginx**: nasun.io 두 server 블록 모두에 `/chat/` proxy 추가 (line 79, 186)
- **CloudFront**: E362CCGDH7WA7C, `/chat/*` behavior 추가 (CachingDisabled, AllViewer, 7 HTTP methods)
- **환경변수**: DEEPBOOK_PACKAGE, RPC_URL, POOL_*, ANTHROPIC_API_KEY 모두 nasun chat-server .env에 설정됨

### 주의사항
- CloudFront `/chat/*` 엣지 캐시 전파가 일부 지역에서 완료되지 않았을 수 있음 (regex 매칭 실패하는 엣지케이스 경로에서 HTML 반환). 핵심 경로(유효한 Sui 주소)는 정상 동작 확인됨
- pado chat-server의 leaderboard.db는 /var/www/pado-chat-server/data/에 여전히 존재 (삭제하지 않음)
- nasun chat-server의 leaderboard.db와 pado의 것은 이제 독립적 (pado 인덱서 중지됨)

### 핵심 파일 위치
- `apps/nasun-website/chat-server/src/leaderboard-api.ts` - REST API 핸들러 (신규, 가장 큰 파일)
- `apps/nasun-website/chat-server/src/rooms.ts` - pool-room 매핑 (신규)
- `apps/nasun-website/chat-server/src/server.ts` - 통합된 서버 (broadcastSystemMessage, startup, shutdown)
- `apps/nasun-website/chat-server/src/types.ts` - ChatServerConfig 확장
- `apps/nasun-website/chat-server/src/store.ts` - getDisplayName/Batch 추가
- `apps/pado/.env.production` - VITE_CHAT_HTTP_URL=https://nasun.io/chat

## 최근 변경 파일

### 신규 파일 (nasun chat-server)
- `apps/nasun-website/chat-server/src/leaderboard-api.ts`
- `apps/nasun-website/chat-server/src/rooms.ts`
- `apps/nasun-website/chat-server/src/leaderboard-types.ts` (pado에서 복사)
- `apps/nasun-website/chat-server/src/leaderboard-store.ts` (pado에서 복사)
- `apps/nasun-website/chat-server/src/price-tracker.ts` (pado에서 복사)
- `apps/nasun-website/chat-server/src/indexer.ts` (pado에서 복사)
- `apps/nasun-website/chat-server/src/aggregator.ts` (pado에서 복사)
- `apps/nasun-website/chat-server/src/market-narrator.ts` (pado에서 복사)

### 수정 파일
- `apps/nasun-website/chat-server/src/server.ts`
- `apps/nasun-website/chat-server/src/types.ts`
- `apps/nasun-website/chat-server/src/store.ts`
- `apps/nasun-website/chat-server/package.json`
- `apps/nasun-website/chat-server/src/__tests__/*.ts` (4개 테스트 파일, DEFAULT_CONFIG spread)
- `apps/pado/.env.production` (VITE_CHAT_HTTP_URL 변경)

## 즉시 다음 단계

1. git commit + push (Phase 2b + 2c 변경사항)
2. Phase 2b.5: Display Name 개선 (채팅 미참여 트레이더의 profile fetch 캐시)
3. AI Chatbot: nasun chat-server용으로 새로 작성
4. CloudFront /chat/* 캐시 전파 최종 확인
