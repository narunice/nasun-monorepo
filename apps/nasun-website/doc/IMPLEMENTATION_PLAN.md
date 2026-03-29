# nasun-website 통합 구현 플랜 v5 (최종 피드백 반영)

## 불변 원칙

1. **프로덕션 `/my-account` 절대 보호**: 모든 My-Account 개발은 `/dev/my-account`에서 진행. dev 라우트는 최종 Step까지 유지.
2. **리더보드 V3 데이터 무손상**: LeaderboardV3Stack은 절대 배포하지 않음.
3. **Genesis Pass Allowlist 데이터 무손상**: GenesisPassStack은 절대 배포하지 않음.
4. **배포 금지 스택**: `LeaderboardV3Stack`, `GenesisPassStack`, `NftEventStack`은 이 플랜의 어떤 Step에서도 배포하지 않음.
5. **CDK 배포 전 `cdk diff` 필수 확인**: 의도한 변경만 포함되어 있는지 검증 후 배포.

## 프로젝트 컨텍스트

- **DAU 목표**: 1000+ (현재 ~320). 500명 미만 가정이 아님.
- **에코시스템 포인트 런칭 방식**: "Experimental Season"으로 고지. 초기 수치를 넣고 프로덕션 데이터로 밸런스 패치. 5-alpha/5-beta 분할 없이 한 번에 출시.
- **Genesis Pass 컨트랙트**: 배포 완료. `0xc40fc7cb59d85510957687cab0fa8e6adc538bf7` (Ethereum Mainnet)
- **Alliance NFT**: 1인 1개, 4개 이미지 중 선택 (이미 구현됨)
- **다중 지갑**: 사용자 1명이 여러 Nasun 지갑을 등록하고, 모든 지갑의 온체인 활동을 하나의 계정으로 통합 적립. 기존 `UserWallets` 테이블(PK: identityId, SK: walletAddress) 활용.
- **멀티플라이어 수치**: config에 초기값 설정, 프로덕션 데이터 기반 밸런스 패치.

### 초기 멀티플라이어 수치 (config, 변경 가능)

```typescript
// ecosystem-config.ts
export const MULTIPLIER_CONFIG = {
  alliance: 1.0,           // 기본 자격
  genesisPass: 1.5,        // 고정 추가 보너스
  battalion: {
    base: 1.0,             // 1개 보유 시 추가
    logCoefficient: 0.8,   // ln(count) * k
    // 1개: +1.00, 3개: +1.88, 5개: +2.29, 10개: +2.84, 20개: +3.40
  },
};

// 초기값은 의도적으로 낮게 시작 (리뷰 반영: 상향은 쉽지만 하향은 rug pull 느낌)
// 실제 튜닝 가능 값은 PostgreSQL ecosystem_config 테이블에 저장. 여기는 타입+기본값만.
export const BONUS_CONFIG = {
  padoPnlDailyPool: 1000,         // 일간 PnL 리더보드 보너스 총량 (초기 보수적)
  padoGameLogCoefficient: 5.0,    // ln(1 + winnings) * coefficient
  padoGameDailyCap: 50,           // 사용자당 일간 게임 보너스 캡
  dailyLeaderboardPool: 500,      // 일간 리더보드 순위 보너스 총량
  weeklyLeaderboardPool: 2000,    // 주간 리더보드 순위 보너스 총량
};
```

---

## 의존성 맵

```
Step 1 (restore-nfts.ts) ──────── 독립, 최우선
    |
Step 2 (Alliance 랜딩 페이지) ─── Step 1과 병렬
    |
Step 3 (My-Account 리뉴얼) ────── /dev/my-account에서 완성 -> 스테이징 검증 -> 승인 후 교체
    |                               ProfileHeroCard에 포인트 현황 중심 배치 + 게이미피케이션
    |                               Connected Accounts를 별도 섹션으로 분리 (페이지 하단)
    |                               dev 라우트는 삭제하지 않음 (Step 5까지 유지)
    |
Step 4 (Activate 백엔드 + 프론트엔드 + 레퍼럴 안티스팸)
    |                               Step 3과 병렬 (백엔드)
    |                               프론트엔드는 Step 3 완료 후 /dev/my-account에서 개발
    |
Step 5 (에코시스템 스코어 + 리더보드 + 대시보드)
    |                               Step 4 완료 후
    |                               "Experimental Season" 고지와 함께 한 번에 출시
    |                               /dev/my-account에서 대시보드 완성 -> 검증 -> 프로덕션 교체
    v                               dev 라우트 최종 삭제
```

---

## Step 1: restore-nfts.ts 복구 플로우 보강

**우선순위**: 최우선 (devnet 리셋 대비)
**의존성**: 없음

**작업**:
1. `restoreBatch()`에 `showEvents: true` 추가
2. `nasun-alliance-mint` 테이블 Scan으로 `walletAddress -> identityId` 맵 구축
   - 중복 발견 시 경고 로그 출력.
3. AllianceMinted 이벤트에서 `recipient` + `serial_number`로 매칭 -> DynamoDB `nftObjectId`/`txDigest` 업데이트
4. 운영 절차 문서화 (Lambda 비활성화 -> 복원 -> 재활성화)

**파일**: `cdk/lambda-src/nft-snapshot/scripts/restore-nfts.ts`

---

## Step 2: Alliance NFT 민팅 랜딩 페이지 (Step 1과 병렬)

**우선순위**: 높음 (마케팅 URL 확보)
**의존성**: 없음

**작업**:
1. `ALLIANCE_IMAGES`를 `constants/alliance.ts`로 추출 (프론트엔드만. Lambda 쪽은 기존 유지)
2. 경량 랜딩 페이지 (`/wave1/alliance-nft`, 200줄 이내)
   - 4가지 인증 상태별 UX (미로그인/지갑미등록/미민팅/민팅완료)
   - 1인 1개 민팅, 4개 이미지 중 선택 (기존 AllianceMintDialog 재사용)
   - Helmet으로 OG 메타데이터
3. routesConfig.ts: Pages, wave1Campaign subMenu, pageTitleMaps 업데이트

**파일**:
- 생성: `frontend/src/pages/wave1/AllianceNftPage.tsx`, `frontend/src/constants/alliance.ts`
- 수정: `frontend/src/config/routesConfig.ts`, `frontend/src/sections/myAccount/components/AllianceMintDialog.tsx`

---

## Step 3: My-Account 리뉴얼 + Referral 통합

**우선순위**: 높음
**의존성**: Step 2 완료 권장
**핵심 원칙**: `/dev/my-account`에서 완성 -> 스테이징 검증 -> 사용자 승인 -> 프로덕션 교체. **dev 라우트는 삭제하지 않는다** (Step 5까지 유지).

**작업**:

1. **CompactNftStatus 통합**
   - `showAllSections` prop 추가. `true`면 Alliance/Battalion/Frontiers 모든 섹션 표시.
   - DevCompactNftStatus.tsx 삭제.
   - NftStatusItem 서브컴포넌트 추출은 **하지 않는다** (Step 4에서 인라인 추가로 충분).

2. **ProfileHeroCard 리디자인** (리뷰 반영: Step 3에서는 기존 데이터만 표시)
   - `lg:row-span-2` 제거. row-by-row 순차 배치로 변경.
   - **기존 데이터만 표시** (Step 4/5 전이므로 멀티플라이어/에코시스템 스코어 데이터 없음):
     - 총 activity points (기존 `/points/user/:address` API, PointsCard 데이터를 ProfileHeroCard에 병합)
     - 카테고리 분포 시각화 (기존 PointsCard 기능 흡수 -- PointsCard 별도 카드 제거)
     - 크리에이터 리더보드 V3 랭크 (기존 데이터 활용)
   - **에코시스템 스코어/멀티플라이어 영역은 레이아웃만 확보**, Step 5D에서 채움
   - Connected Accounts 섹션을 ProfileHeroCard에서 분리 -> **페이지 하단 별도 섹션** (ConnectedAccountsCard 활용)
   - 참고: ProfileHeroCard (~1000줄)에 ConnectedAccounts 코드가 중복 존재할 수 있음. Step 3 시작 전 현재 상태 확인 후 중복 제거.

3. **DevMyAccountPage 업데이트** (프로덕션 MyAccountPage는 건드리지 않음)
   - ProfileHeroCard 리디자인 반영
   - CompactNftStatus `showAllSections={true}` 사용
   - ReferralCard 이미 포함됨 (확인만)
   - DailyMissionsCard, ConnectedAccountsCard 이미 포함됨 (확인만)

4. 반응형 레이아웃 검증 (3개 브레이크포인트: mobile/tablet/desktop)

5. **프로덕션 교체 절차** (반드시 순서 준수):
   a. 스테이징에 배포 (staging.nasun.io/dev/my-account에서 검증)
   b. 사용자 명시적 승인 획득
   c. git tag 생성 (`pre-my-account-renewal`) -- 롤백 지점 확보
   d. DevMyAccountPage 내용을 MyAccountPage에 반영 (별도 커밋)
   e. 스테이징에서 `/my-account` 검증
   f. 프로덕션 배포
   g. **dev 라우트는 유지** -- Step 4, 5에서 계속 사용
   - **롤백 절차**: 문제 발견 시 Step 5d 커밋을 `git revert` + 재배포

**사전 조건**: `.env.staging`에 `VITE_REFERRAL_API` 추가

**파일**:
- 수정: `CompactNftStatus.tsx` (showAllSections prop 추가)
- 수정: `ProfileHeroCard.tsx` (포인트 중심 리디자인, Connected Accounts 분리)
- 수정: `DevMyAccountPage.tsx` (리디자인 반영)
- 수정: `MyAccountPage.tsx` (교체 시점에 반영)
- 삭제: `DevCompactNftStatus.tsx`
- **유지**: `DevMyAccountPage.tsx`, `/dev/my-account` 라우트

---

## Step 4: NFT Activate 인프라 + 레퍼럴 안티스팸 (Step 3과 병렬 시작)

**우선순위**: 높음
**의존성**: Step 1 완료 후에만 devnet cron 활성화. 프론트엔드는 Step 3 완료 후.
**병렬**: 백엔드(4A)는 Step 3과 동시 진행 가능

### 4A: Activate 백엔드

1. **별도 CDK 스택 생성**: `EcosystemStack` (common-stack에 추가하지 않음)
   - DynamoDB `nasun-ecosystem-activations` 테이블 (`removalPolicy: RETAIN`, PITR 활성화)
     ```
     PK: identityId
     SK: nftType#walletAddress
     status: ACTIVE | INACTIVE  (2상태만. 사용자 해제도 INACTIVE. 재활성화는 INACTIVE->ACTIVE)
     activatedAt, lastVerifiedAt, nftCount
     ```
   - **단일 Lambda** (`ecosystem-handler`): 경로 기반 라우팅 (referral/handler 패턴)
     - `POST /ecosystem/activate`
     - `POST /ecosystem/deactivate`
     - `GET /ecosystem/status`
   - **교차 스택 테이블 접근**: `Table.fromTableName()` + `addToRolePolicy()` (referral-stack 패턴)
     - `nasun-alliance-mint` 읽기
     - `nasun-nft-ownership` 읽기
     - `nasun-nft-collections` 읽기
     - `UserProfiles` 읽기
   - **시빌 방지**: 기존 UserProfiles의 `twitterId-index` / `telegramUserId-index` GSI 활용. 별도 GSI 불필요.

2. **Activate 인증** (devnet 단순화)
   - Alliance: JWT 인증만. 백엔드에서 `nasun-alliance-mint` 보유 확인.
   - Genesis Pass: JWT 인증만. `UserProfiles.linkedAccounts.metamask.walletAddress` + Alchemy 스냅샷(`ETH#LATEST`) 대조. 컨트랙트: `0xc40fc7cb59d85510957687cab0fa8e6adc538bf7`
   - Battalion: JWT 인증만. 동일 패턴. 컨트랙트 주소는 배포 후 등록.
   - **EIP-712 서명은 devnet에서 불필요** (메인넷에서 도입).

3. **시빌 방지**: Activate 시 X 또는 Telegram 연동 필수 (Genesis Pass/Battalion). 동일 소셜 계정으로 복수 identityId에서 Activate 불가.

4. **다중 지갑 통합**: 사용자의 모든 등록 지갑(`UserWallets` 테이블)에서 발생한 활동을 identityId 기준으로 통합 집계.

5. **EventBridge cron**: 일간 소유권 검증 (UTC 00:05)
   - devnet-collector를 daily cron으로 승격
   - **안전장치**: 이전 LATEST 대비 AllianceNFT 50% 이상 감소 AND 이전 count > 10이면 LATEST 덮어쓰기 스킵 (dated 스냅샷은 항상 기록). CloudWatch 알람 발생.
   - eth-collector 기존 cron 활성화
   - **배포 전 `cdk diff NftSnapshotStack` 필수** -- EventBridge 규칙 추가 외 변경 없는지 확인.
   - 소유권 미보유 시 `status = INACTIVE` 전환

6. `nasun-nft-collections` 테이블에 Genesis Pass 컨트랙트 주소 등록 (`0xc40fc7cb59d85510957687cab0fa8e6adc538bf7`, chain: ethereum)
7. 등록 후 **eth-collector Lambda 수동 1회 실행**하여 초기 `ETH#LATEST` 스냅샷 생성 (리뷰 반영: 스냅샷 없으면 Activate가 조용히 실패). Activate Lambda에 fallback: `ETH#LATEST` 미존재 시 Alchemy API 직접 호출.

### 4B: 레퍼럴 안티스팸

**현재 취약점**: 레퍼럴 적용 즉시 보너스 지급. 모든 기존 레코드가 `status: PENDING`.

**개선안** (cron 불필요, inline 체크):

1. **기존 레퍼럴 마이그레이션 (선행 필수)**:
   - 일회성 스크립트 (`--dry-run` 지원): `nasun-referrals` Scan -> 각 피추천자의 `activity_points` distinct date count >= 5이면 `status = ACTIVATED`, `activatedAt = now()`.

2. **referral-mappings 엔드포인트 수정** (`export-whitelist.ts`):
   - `status === 'ACTIVATED'`인 레퍼럴만 반환

3. **referral-bonus.ts 활성화 체크** (scanLoop당 1회, per-batch 아님):
   - `calculateDailyMissions()` 패턴과 동일
   - PENDING 레퍼럴 identity_id를 **batch SQL 쿼리**로 일괄 확인
   - 5일 이상인 피추천자 -> `POST /internal/referral-activate` HTTP 호출로 DynamoDB 업데이트 위임 (api-server에 AWS SDK 추가하지 않음)
   - **batch 처리**: body에 `{ identityIds: [...] }` 배열로 전송. Lambda에서 BatchWriteCommand. N+1 HTTP 호출 방지. batch size 제한 100 (Lambda timeout 29초 내 처리 보장).
   - `x-api-key` 인증 (기존 referral-mappings 패턴)

4. **배포 순서 (엄수)**:
   a. 마이그레이션 스크립트 실행 (`--dry-run` 먼저)
   b. **검증 게이트**: `nasun-referrals`에서 `status = 'ACTIVATED'` count 확인
   c. referral-mappings + referral-bonus.ts + `/internal/referral-activate` 동시 배포

### 4C: Activate 프론트엔드 (Step 3 완료 후)

1. `/dev/my-account`에서 CompactNftStatus 각 섹션에 "Activate" / "Deactivate" 버튼 인라인 추가
2. `useEcosystemStatus` 훅 + `ecosystemApi.ts` 서비스 생성
3. 활성화 상태 표시 (ACTIVE 배지, 멀티플라이어 수치)
4. 스테이징 검증 -> 사용자 승인 -> MyAccountPage에 반영

**파일**:
- 생성: Lambda handler (`ecosystem-api/`, 단일 Lambda)
- 생성: CDK `EcosystemStack` (`cdk/lib/ecosystem-stack.ts`)
- 수정: `cdk/bin/cdk.ts` (EcosystemStack import + instantiation)
- 수정: `nft-snapshot-stack.ts` (devnet cron 추가, `cdk diff` 확인 후)
- 수정: `export-whitelist.ts` (ACTIVATED 필터 + `/internal/referral-activate`)
- 수정: `referral-bonus.ts` (inline 활성화 체크)
- 수정: `CompactNftStatus.tsx` (Activate 버튼 인라인)
- 생성: `hooks/useEcosystemStatus.ts`, `services/ecosystemApi.ts`
- 생성: 레퍼럴 마이그레이션 스크립트

---

## Step 5: 에코시스템 스코어 + 리더보드 + 대시보드

**우선순위**: 중간
**의존성**: Step 4 완료
**런칭 방식**: **5-core** (기본 스코어+멀티플라이어+리더보드+대시보드) 먼저 출시, **5-bonuses** (PnL/게임/순위 보너스) 안정화 후 추가. "Experimental Season" 고지. 수치는 DB 테이블로 관리하여 배포 없이 밸런스 패치.
**핵심**: `/dev/my-account`에서 대시보드 완성 -> 검증 -> 프로덕션 교체 -> dev 라우트 최종 삭제

### 5A: 에코시스템 스코어

**SQL materialized view + API 레이어 방식**:

1. **PostgreSQL materialized view** (기존 `activity_points` 위에, **identity_id 기준 GROUP BY**):
   ```sql
   CREATE MATERIALIZED VIEW ecosystem_daily_scores AS
   SELECT
     identity_id,
     date_trunc('day', tx_timestamp)::date AS day,
     COUNT(DISTINCT category) AS base_score
   FROM activity_points
   WHERE NOT flagged
     AND identity_id IS NOT NULL
     AND category NOT IN ('referral-bonus', 'daily-mission', 'wallet-transfer',
                          'ecosystem-bonus-pnl', 'ecosystem-bonus-rank',
                          'ecosystem-bonus-game', 'ecosystem-bonus-diversity')
   GROUP BY identity_id, date_trunc('day', tx_timestamp)::date;

   -- CONCURRENTLY refresh에 필수
   CREATE UNIQUE INDEX ON ecosystem_daily_scores(identity_id, day);
   ```
   - **identity_id 기준 GROUP BY** (리뷰 반영): `activity_points`에 이미 identity_id 컬럼 존재. DynamoDB UserWallets cross-DB join 완전 제거. 다중 지갑 통합이 DB 레벨에서 자동 해결.
   - `wallet-transfer` 카테고리 제외 (셀프 트랜스퍼 방지, 전송 1점 영향 미미)
   - ecosystem-bonus 카테고리들도 제외 (base_score 이중 계산 방지)
   - **리프레시**: `REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`.
     - 트리거: `totalProcessed > 0 || bonusInserted > 0`일 때 + 최소 5분 간격 floor. maximum stale time 15분 fallback.
     - `lastRefresh`는 `processing_state` 테이블에 저장 (PM2 클러스터 모드에서 worker 간 공유).
     - `pg_try_advisory_lock`으로 중복 refresh 방지.
   - **기존 `activity_points` 읽기 전용, 수정 없음**

2. **사전 인덱스**: `CREATE INDEX CONCURRENTLY idx_ap_identity_timestamp ON activity_points(identity_id, tx_timestamp);`

3. **다중 지갑 통합**: matview가 identity_id 기준이므로 API에서 별도 지갑 조회 불필요. `/points/identity/:identityId` 라우트 하나로 해결.

4. **NFT 멀티플라이어**: API 레이어에서 `nasun-ecosystem-activations` DynamoDB 조회 후 적용.
   - activation 데이터는 ecosystem Lambda의 HTTP 엔드포인트 호출 또는 기존 wallet-mappings 패턴으로 캐시 (explorer-api에 AWS SDK 추가하지 않음)
   - Alliance 활동 의무: **5-core에서는 5/7 규칙 이연**. 5-bonuses에서 도입. 리더보드 API에서 per-user 쿼리 N+1 문제 방지를 위해, 도입 시 matview에 `active_days_7d` 컬럼을 pre-compute하거나 별도 summary view 생성.
   - **API 응답 캐싱**: 기존 `cached()` 패턴(5분 TTL)
   - **튜닝 가능한 수치는 환경변수로 관리** (기존 `REFERRAL_L1_BONUS_RATE` 패턴과 동일). PM2 restart로 반영. `ecosystem-config.ts`는 타입 정의 + 환경변수 파싱 + 기본값. 비개발자 밸런스 패치가 필요해지면 그때 DB 테이블로 승격.

5. **최소 금액 임계값** (forward-only): `MIN_TRADE_QUOTE_NUSDC = 1_000_000` (1 NUSDC). 과거 데이터는 유지.

### 5B: 보너스 포인트 (5-core 출시 후 별도 배포 -- 리뷰 반영: blast radius 축소)

> 5-core에서 기본 스코어+멀티플라이어 리더보드가 안정적으로 동작하는 것을 확인한 후, 보너스 시스템을 추가 배포.

1. **Pado PnL 리더보드 보너스**:
   - `PADO_CHAT_API_URL` 환경변수 추가 (explorer-api). `scanner/pnl-bonus.ts` 모듈 생성.
   - `${PADO_CHAT_API_URL}/api/leaderboard?mode=pnl&period=24h&limit=200` HTTP 호출 (10초 타임아웃)
   - **사전 조건**: chat-server의 limit 캡이 현재 100 (`Math.min(..., 100)` in server.ts). 200위까지 배분하려면 캡을 200으로 상향하거나 2회 paginated 요청.
   - **지갑 매핑 주의**: Pado embedded/zkLogin 지갑이 UserWallets에 등록되지 않은 경우 매핑 불가. 사전 확인 필요: Pado 사용자 지갑이 UserWallets에 등록되는 플로우가 있는지. 없으면 Pado 지갑도 UserWallets에 등록하는 연동 필요.
   - wallet address -> identityId 매핑: in-memory `registeredWallets` 캐시 활용
   - 실패 시 graceful skip (해당 일 PnL 보너스 미지급, 로그 + health endpoint에 표시)
   - 일간 고정 풀(초기 1,000pts) 1~200위 비례 배분
2. **Pado 게임 수익 보너스**: `ln(1 + winnings) * 5.0`, 일간 캡 50pts/user
   - 게임 이벤트 amount 파싱 필요: `lottery::PrizeClaimed`, `scratchcard::ScratchCardPurchased` (prize_amount 필드, 0이면 loss), `prediction::WinningsClaimed` 이벤트의 금액 필드 참조. scratchcard 패키지 ID를 `points.ts` PKG에 추가 필요.
3. **거버넌스 참여 보너스**: 기존 `activity_points` governance 카테고리 활용
4. **리더보드 순위 보너스**: 일간 풀 500pts, 주간 풀 2,000pts
5. **synthetic tx_digest 포맷** (unique constraint `tx_digest, activity_type, event_seq` 준수):
   - PnL: `BONUS:pnl:{identityId}:2026-03-29` (사용자별 고유)
   - Rank: `BONUS:rank-daily:{identityId}:2026-03-29`
   - Game: `BONUS:game:{identityId}:2026-03-29`
   - 카테고리: `ecosystem-bonus-pnl`, `ecosystem-bonus-rank`, `ecosystem-bonus-game` (matview WHERE 절에서 이미 제외됨)
   - **공통 헬퍼**: `insertBonusPoints(category, entries: Array<{identityId, points}>)` -- 각 bonus 모듈은 순수 함수로 `entries` 반환, 헬퍼가 insert + idempotency 처리.

> 다양성 보너스(4카테고리, +2점)는 초기 런칭에서 제외 (리뷰: 현재 스코어 규모 대비 noise). 사용자가 단일 활동에 몰리는 현상 관찰 시 밸런스 패치로 추가.

### 5C: 에코시스템 리더보드

1. 일간/주간 리더보드 API (materialized view + DynamoDB 멀티플라이어, `cached()` 5분 TTL)
   - **에코시스템 API 위치**: 기존 `network-explorer/api-server`에 Hono 라우트 추가 (EC2, PostgreSQL 직접 접근). Lambda + VPC 불필요.
2. 일간 UTC 00:00 리셋, 주간 월요일 UTC 00:00 리셋
3. 순위별 보너스 포인트 배분 cron
4. 리더보드 프론트엔드 페이지 (`/ecosystem/leaderboard`)
5. **이상치 감지**: 보너스 배분 전 상위 N명 스크리닝. 초기 수동 운영.
6. **"Experimental Season" 배너**: 리더보드 페이지 상단에 규칙 변경 가능 고지

### 5D: My Account 에코시스템 대시보드 (게이미피케이션)

1. **EcosystemStatusCard** (`/dev/my-account`에서 개발):
   - Activate 현황 + 멀티플라이어 값
   - Alliance 활동 캘린더 (최근 7일 히트맵)
   - Alliance 상태 (ACTIVE/INACTIVE)
   - 일간/주간 순위, 누적 포인트
   - **게이미피케이션 요소**: 진행 바, 스트릭 카운트, "오늘의 목표" 달성률

2. **DailyMissionsCard 확장**: 3개 -> 6개 활동 체크리스트. 매일 리셋. 전체 달성 시 보너스.
   - 추가 미션 후보: Pado perp 트레이드, ScratchCard 구매, Baram AI 요청 (확정 필요)
   - `daily-mission.ts` 수정 시 `identity_id` 필드도 채우기 (현재 NULL 가능).

3. **프로덕션 교체 절차** (Step 3과 동일):
   a. 스테이징 검증
   b. 사용자 승인
   c. MyAccountPage에 반영
   d. **최종 정리**: DevMyAccountPage.tsx 삭제, `/dev/my-account` 라우트 제거

**파일**:
- 생성: `ecosystem-config.ts` (모든 수치 config)
- 생성: PostgreSQL materialized view + 인덱스
- 수정: `scanner/` (view refresh, 최소 금액 임계값)
- 생성: 에코시스템 API 엔드포인트 (`network-explorer/api-server` Hono 라우트)
- 생성: `frontend/src/sections/myAccount/EcosystemStatusCard.tsx`
- 수정: `ProfileHeroCard.tsx` (포인트 현황 표시 영역 -- Step 3에서 리디자인한 구조 활용)
- 수정: `DailyMissionsCard.tsx` (6개 활동 확장)
- 생성: 리더보드 프론트엔드 페이지
- 수정: `MyAccountPage.tsx` (최종 교체 시)
- 삭제: `DevMyAccountPage.tsx` (최종 정리 시)
- 수정: `AppRoutes.tsx` (dev 라우트 제거, 최종 정리 시)

---

## 안티스팸 요약

| 공격 벡터 | 방어 | 시점 | 방식 |
|-----------|------|------|------|
| 레퍼럴 유령 계정 | PENDING -> ACTIVATED (5일 활동 증명) | Step 4B | referral-bonus.ts inline 체크 |
| 셀프 트랜스퍼 | `wallet-transfer` 카테고리를 ecosystem view에서 통째로 제외 | Step 5A (5-core) | materialized view WHERE 절 |
| 최소 금액 트레이딩 | 1 NUSDC 미만 스킵 | Step 5A (5-core) | config 임계값 (forward-only) |
| Alliance 활동 의무 | 5/7 규칙 (최근 7일 중 5일 활동) | Step 5B (5-bonuses) | matview pre-compute 또는 summary view |
| 시빌 (다중 계정) | Activate 시 X/Telegram 연동 필수 | Step 4A | activate Lambda 검증 |
| 봇 자동화 | 일간 기본 스코어 자연 캡 (최대 6점 * 멀티플라이어) | 설계 자체 | 별도 구현 불필요 |
| 워시 트레이딩 | excludedAddresses + 수동 flagging | Step 5C | 관리자 운영 |
| 이상치 | 보너스 배분 전 상위 N명 스크리닝 | Step 5C | 초기 수동, 점진적 자동화 |

---

## 병렬화 요약

```
시간  Step 1          Step 2          Step 3          Step 4          Step 5
 |    [restore fix]   [Alliance LP]
 |    ============    ============
 |                                    [dev/my-account  [4A: Activate BE]
 |                                     리디자인+교체]  [4B: Referral fix]
 |                                    ==============   ===============
 |                                                     [4C: Activate FE]
 |                                                     (dev/my-account)
 |                                                     ===============
 |                                                                      [5-core: 스코어+리더보드+대시보드]
 |                                                                      (dev/my-account)
 |                                                                      -> 교체
 |                                                                      [5-bonuses: PnL/게임/순위 보너스]
 v                                                                      -> 교체 + dev 삭제
```

---

## /dev/my-account 생명주기

| 시점 | /dev/my-account 상태 | /my-account (프로덕션) 상태 |
|------|---------------------|---------------------------|
| Step 1-2 | 기존 DevMyAccountPage (변경 없음) | 기존 7카드 (변경 없음) |
| Step 3 개발 중 | ProfileHeroCard 리디자인 + CompactNftStatus 통합 등 | **변경 없음** |
| Step 3 교체 후 | 교체 완료, 이후 Step 4C용으로 재활용 | 리뉴얼 완료 (포인트 중심 ProfileHero) |
| Step 4C 시작 전 | **MyAccountPage와 동기화 확인** 후 작업 시작 | Step 3 상태 유지 |
| Step 4C 개발 중 | Activate 버튼 추가 작업 | Step 3 상태 유지 |
| Step 4C 교체 후 | 교체 완료, 이후 Step 5D용으로 재활용 | Activate 기능 포함 |
| Step 5D 시작 전 | **MyAccountPage와 동기화 확인** 후 작업 시작 | Step 4 상태 유지 |
| Step 5D 개발 중 | EcosystemStatusCard + 체크리스트 확장 등 | Step 4 상태 유지 |
| Step 5 최종 교체 후 | **삭제** | 최종 상태 (에코시스템 대시보드 포함) |

---

## 배포 체크리스트 (모든 Step 공통)

- [ ] `cdk diff` 실행하여 의도한 변경만 포함 확인
- [ ] LeaderboardV3Stack, GenesisPassStack, NftEventStack 배포 **금지** 확인
- [ ] 스테이징 배포 -> 기능 검증 -> 사용자 승인 -> 프로덕션 배포
- [ ] 프로덕션 `/my-account` 페이지 정상 동작 확인 (교체 Step 시)
- [ ] 데이터 무결성 확인 (리더보드 V3, Genesis Pass, nasun-alliance-mint)

---

## 미확정 사항

**Step 4**: Battalion NFT 컨트랙트 주소 (미배포)
**Step 5**: 모든 수치는 config 초기값으로 시작, 프로덕션 데이터 기반 밸런스 패치

---

## 검증 방법

| Step | 검증 |
|------|------|
| 1 | `restore-nfts.ts --dry-run --type AllianceNFT` -> 매핑 로그 + DynamoDB 업데이트 확인 |
| 2 | `/wave1/alliance-nft` -> 4가지 인증 상태 + OG 메타데이터 확인 |
| 3 | 스테이징 `/dev/my-account` -> ProfileHeroCard 포인트 중심 + 10카드 + 3 브레이크포인트 -> 승인 -> `/my-account` 교체 -> 프로덕션 확인 |
| 4 | Activate API -> DynamoDB 기록. Genesis Pass `0xc40fc7cb59d85510957687cab0fa8e6adc538bf7` 보유 확인. 일간 cron -> 미보유 INACTIVE. 레퍼럴 마이그레이션 -> 기존 보너스 유지 확인. 다중 지갑 통합 확인. /dev/my-account에서 Activate 버튼 동작 확인 |
| 5-core | Experimental Season 배너 확인. 활동 -> matview 스코어(identity_id 기준) -> 멀티플라이어 적용 -> 리더보드 순위 -> /dev/my-account 대시보드 -> 승인 -> 교체 |
| 5-bonuses | PnL bonus: Pado API 호출 -> 순위 배분 확인. 게임 bonus: 이벤트 금액 파싱 확인. 보너스 후 matview base_score에 이중 계산 없는지 확인 -> 승인 -> 교체 -> dev 삭제 |
