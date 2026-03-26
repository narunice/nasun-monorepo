# Handoff: Referral System Implementation

**생성**: 2026-03-26 20:00
**브랜치**: `main`
**이전 핸드오프**: 없음 (신규 기능)

## 현재 상태 요약

레퍼럴 시스템 설계(v5)가 확정되고 5회 리뷰를 통과함. CDK ReferralStack 구현을 시작하려는 시점에서 핸드오프. 온체인 포인트 시스템은 이 세션에서 governance 이벤트 매핑 버그 수정 + RPC backfill로 정상화됨.

## 완료된 작업

- [x] 온체인 포인트 시스템 진단 및 수정
  - Governance EVENT_MAPPING 버그 수정 (VoteCast -> VoteRegistered, module 이름 수정)
  - RPC backfill 스크립트 작성 및 실행 (governance 750건 + staking 2705건 소급 반영)
  - Scanner 재시작 (최신 시퀀스까지 처리)
- [x] PointsCard 제목 변경: "ON-CHAIN POINTS" -> "ACTIVITY POINTS"
- [x] Admin Activity Points 리더보드에 프로필 이미지/X핸들/display name 표시
- [x] 프론트엔드 스테이징 + 프로덕션 배포 완료
- [x] 레퍼럴 플랜 v5 확정 (5회 독립 리뷰 통과)

## 미완료 작업

- [ ] CDK ReferralStack 생성 (DynamoDB 2개 + Lambda + API Gateway)
- [ ] Lambda 핸들러 구현 (my-code, apply, my-stats, referral-mappings)
- [ ] CDK 배포 (dev -> staging -> prod)
- [ ] 프론트엔드 구현 (referralApi.ts, ReferralCard.tsx, ?ref=CODE 캡처)
- [ ] 프론트엔드 배포 (staging -> 검증 -> prod)
- [ ] api-server scanner referral 훅 추가 (config/referral.ts + scanner/referral-bonus.ts)
- [ ] api-server /api/v1/points/referral-stats 엔드포인트 추가

## 중요 컨텍스트

### 결정사항

- **아키텍처**: Lambda(DynamoDB) = 레퍼럴 "관계" 관리, api-server(PostgreSQL) = 레퍼럴 "보상" 계산. HTTP fetch 패턴 (wallet-mappings와 동일).
- **Phase 1+2 통합 배포**: REFERRAL_REWARD_ENABLED=false로 시작, 검증 후 true. CDK 배포 1회.
- **bonus-sync 제거 (v5)**: DynamoDB에 totalBonusEarned 중복 저장 안 함. api-server에 /points/referral-stats 읽기 전용 엔드포인트 추가로 대체.
- **내부 API 1개**: referral-mappings만. AdminStack 기존 API Gateway에 추가.
- **Linked accounts 방어**: POST /apply에서 collectLinkedIdentityIds() 패턴으로 자기 참조 우회 차단.
- **referralCode ConditionExpression**: attribute_not_exists(referralCode) + 최대 3회 재시도.

### 주의사항

- **UserProfiles는 fromTableName()**: GSI 추가 불가. referralCode 역조회용 별도 nasun-referral-codes 테이블 사용.
- **referrer wallet_address 역매핑**: scanner에서 registeredWallets Map을 역전한 identityToWallet Map 생성 필요. 플랜에 명시되었으나 구현 시 주의.
- **dailyBonusAccumulator**: PM2 restart 시 초기화됨. scanner 시작 시 당일 SUM 쿼리로 warm-up 필요.
- **tx_digest 형식**: referral-bonus는 `ref:{referrerIdentityId}:{원본_digest}:{event_seq}` 형태. ON CONFLICT DO NOTHING으로 멱등성 보장.
- **Scanner 파일 분리**: scanner/referral-bonus.ts로 분리 + try-catch 격리 (메인 스캔 루프에 영향 없도록).
- **Rollback point**: `49324d02` (main)

### 파일 위치

| 용도 | 경로 |
|------|------|
| **플랜 v5** | `.claude/plans/hashed-prancing-waterfall.md` |
| **CDK 패턴** | `apps/nasun-website/cdk/lib/genesis-pass-stack.ts` |
| **Lambda 패턴** | `apps/nasun-website/cdk/lambda-src/genesis-pass/register/src/index.ts` |
| **Authorizer 패턴** | `apps/nasun-website/cdk/lambda-src/genesis-pass/authorizer/src/index.ts` |
| **내부 API 패턴** | `apps/nasun-website/cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` (L562-624) |
| **CDK 스택 등록** | `apps/nasun-website/cdk/bin/cdk.ts` |
| **Admin API Gateway** | `apps/nasun-website/cdk/lib/admin-stack.ts` |
| **My Account UI** | `apps/nasun-website/frontend/src/sections/myAccount/PointsCard.tsx` |
| **API 클라이언트 패턴** | `apps/nasun-website/frontend/src/services/activityPointsApi.ts` |
| **포인트 설정** | `apps/network-explorer/api-server/src/config/points.ts` |
| **Scanner** | `apps/network-explorer/api-server/src/scanner/points-scanner.ts` |
| **Points API** | `apps/network-explorer/api-server/src/routes/points.ts` |
| **DB 스키마** | `apps/network-explorer/api-server/src/db/points-schema.sql` |
| **Backfill 스크립트** | `apps/network-explorer/api-server/src/scripts/backfill-points.ts` |

## 즉시 다음 단계

1. **플랜 v5 읽기**: `.claude/plans/hashed-prancing-waterfall.md`
2. **CDK ReferralStack 작성**: `apps/nasun-website/cdk/lib/referral-stack.ts` (genesis-pass-stack.ts 패턴 복제)
   - DynamoDB: nasun-referral-codes (PK: referralCode) + nasun-referrals (PK: referredIdentityId, GSI: referrerIdentityId-index)
   - Lambda: referral handler (my-code, apply, my-stats) + JWT Authorizer (genesis-pass 재사용 또는 복제)
   - API Gateway: /referral/my-code, /referral/apply, /referral/my-stats
3. **AdminStack에 /internal/referral-mappings 라우트 추가**: export-whitelist.ts Lambda에 핸들러 추가
4. **Lambda 핸들러 구현**: `cdk/lambda-src/referral/` 디렉토리 생성
5. **cdk/bin/cdk.ts에 ReferralStack 등록**
