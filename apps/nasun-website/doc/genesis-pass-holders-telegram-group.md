# Genesis Pass Holders Telegram Group (Token-Gating)

## Context

Genesis Pass NFT 홀더 전용 비공개 Telegram 그룹을 만든다. 홀더만 입장 가능하고, NFT를 판매/이전하면 매일 자동으로 퇴장 처리된다. 기존 인프라(Telegram Bot, NFT 소유권 확인, My Account 페이지)를 최대한 재활용한다.

## 사전 준비 (수동)

1. Telegram에서 비공개 그룹 생성 (예: "Nasun Genesis Pass Holders")
2. 기존 봇(`nasun-telegram-bot-token`)을 그룹에 추가
3. 봇을 관리자로 승격: `can_invite_users` + `can_restrict_members` 권한 부여
4. 그룹 chat ID 확인 (봇에 메시지 보낸 후 `getUpdates` API로 확인)
5. `.env` / `.env.production`에 `TELEGRAM_HOLDERS_GROUP_CHAT_ID=-100XXXXXXXXXX` 추가

## 구현 계획

### Step 1: Join Lambda 생성

**파일**: `apps/nasun-website/cdk/lambda-src/genesis-pass/holders-group-join/src/index.ts`

`POST /genesis-pass/holders-group/join` (JWT 인증 필요)

**플로우**:
1. `identityId` 추출 (authorizer context)
2. `UserProfiles`에서 프로필 조회 -> `telegramUserId` 확인 (없으면 400)
3. linked account 해소 -> EVM 주소 추출
4. `nasun-nft-ownership` `ETH#LATEST`에서 GP 소유권 확인 (없으면 403)
5. Telegram Bot API `getChatMember`로 이미 멤버인지 확인 -> 이미 멤버면 `{ alreadyMember: true }` 반환
6. `createChatInviteLink` 호출: `member_limit: 1`, `expire_date: 5분`
7. `UserProfiles`에 `holdersGroupJoinedAt` 타임스탬프 저장
8. `{ inviteLink }` 반환

**재사용 패턴**:
- 3-hop 소유권 확인: `check/src/index.ts:95-160` `resolveGenesisPassByNasunAddress` 패턴
- CORS/응답 헬퍼: 같은 파일의 `corsHeaders`, `jsonResponse` 패턴
- Telegram Bot API 호출: `verify-telegram.ts`의 `getBotToken`, `getChatMember` 패턴
- 단, 이 Lambda는 identityId로 시작하므로 Hop 1(UserWallets) 불필요. 직접 UserProfiles -> EVM 주소 해소

### Step 2: Audit Lambda 생성

**파일**: `apps/nasun-website/cdk/lambda-src/genesis-pass/holders-group-audit/src/index.ts`

EventBridge로 매일 02:00 UTC 실행 (ETH NFT collector 이후)

**플로우**:
1. `nasun-nft-ownership` META 레코드 확인 -> 오늘 eth-collector가 실행되지 않았으면 스킵 (stale data 방지)
2. `UserProfiles` Scan: `holdersGroupJoinedAt` 속성이 있는 레코드만 필터
3. 각 사용자에 대해:
   - EVM 주소 해소 -> NFT 소유권 확인
   - 미보유 시: `banChatMember` -> `unbanChatMember` (kick without permanent ban)
   - `holdersGroupJoinedAt` 제거
4. **안전장치**: 퇴장 대상이 전체 멤버의 50% 초과 시 abort + 로그 경고

### Step 3: CDK 스택 수정

**파일**: `apps/nasun-website/cdk/lib/genesis-pass-stack.ts`

추가할 리소스:
- `GenesisPassStackProps`에 `telegramHoldersGroupChatId` 추가
- Log Groups 2개 (join, audit)
- Join Lambda (`nasun-genesis-pass-holders-group-join`): 15s timeout, 256MB
- Audit Lambda (`nasun-genesis-pass-holders-group-audit`): 5min timeout, 256MB, `reservedConcurrentExecutions: 1`
- IAM: `UserProfiles` (GetItem + UpdateItem + Scan), `UserWallets` (GetItem), `nasun-nft-ownership` (GetItem), Secrets Manager (`nasun-telegram-bot-token`)
- EventBridge Rule: `cron(0 2 * * ? *)` -> Audit Lambda
- API Gateway: `/genesis-pass/holders-group/join` POST (JWT auth)
- imports 추가: `events`, `targets`

### Step 4: Frontend - useHoldersGroup 훅

**파일**: `apps/nasun-website/frontend/src/sections/myAccount/hooks/useHoldersGroup.ts` (신규)

```typescript
interface UseHoldersGroupResult {
  canJoin: boolean;       // telegram 연결됨 + GP 보유 + 아직 미가입
  isJoining: boolean;     // 요청 중
  isMember: boolean;      // holdersGroupJoinedAt 존재
  join: () => Promise<void>; // POST 호출 -> inviteLink를 window.open
  error: string | null;
}
```

- GP 소유 여부: 기존 `useGenesisPassOwnership` 훅 재사용 (Pado에 있으므로 로직 추출 또는 API 호출)
- Telegram 상태: 기존 `useTelegramVerify` 훅의 결과 활용
- API URL: `import.meta.env.VITE_GENESIS_PASS_API`

### Step 5: Frontend - My Account UI 수정

**파일**: `apps/nasun-website/frontend/src/sections/myAccount/ConnectedAccountsCard.tsx`

Telegram AccountItem 아래에 Holders Group 섹션 추가:

- **Telegram 미연결**: 섹션 숨김
- **Telegram 연결 + GP 미보유**: "Requires Genesis Pass" 비활성 텍스트
- **Telegram 연결 + GP 보유 + 미가입**: "Join Group" 버튼 (amber 테마)
- **이미 가입**: "Member" 배지 표시

**파일**: `apps/nasun-website/frontend/src/sections/myAccount/components/StatusBadges.tsx`

`HoldersGroupBadge` 컴포넌트 추가 (amber 색상, Users 아이콘)

## 비용

- Join Lambda: on-demand 호출, 월 $0.01 미만
- Audit Lambda: 하루 1회, Scan 비용 무시할 수준
- EventBridge: 무료
- Telegram Bot API: 무료
- 새 DynamoDB 테이블 없음 (기존 UserProfiles에 속성 1개 추가)

## 검증 방법

1. CDK `cdk diff GenesisPassStack`으로 변경 확인
2. Staging 배포 후:
   - My Account에서 Telegram 연결 + GP 보유 상태로 "Join Group" 클릭
   - 초대 링크로 그룹 입장 확인
   - 다시 클릭 시 `alreadyMember: true` 확인
3. Audit Lambda 수동 invoke (`aws lambda invoke`)로 퇴장 로직 확인
4. GP 미보유 계정으로 접근 시 403 확인
