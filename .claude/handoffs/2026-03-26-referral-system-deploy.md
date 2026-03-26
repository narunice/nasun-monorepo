# Handoff: Referral System - Remaining Deployment Steps

**생성**: 2026-03-26 17:10
**브랜치**: `main`
**이전 핸드오프**: [2026-03-26-referral-system-impl.md](2026-03-26-referral-system-impl.md)

## 현재 상태 요약

레퍼럴 시스템 코드 구현 + CDK 배포 + 프론트엔드 배포가 완료됨. ReferralCard는 프론트엔드에서 주석 처리하여 UI에 노출되지 않는 상태. 백엔드(Lambda + DynamoDB + API Gateway)는 dev/prod 모두 라이브. 남은 작업은 (1) ReferralStack Lambda 환경변수 업데이트, (2) api-server scanner 배포, (3) 커밋/푸시.

## 완료된 작업

- [x] CDK ReferralStack 생성 (DynamoDB 2개 + Lambda 2개 + API Gateway)
- [x] Lambda 핸들러 구현 (my-code, apply, my-stats, authorizer)
- [x] AdminStack에 /internal/referral-mappings 라우트 추가
- [x] CDK 등록 (cdk.ts) + 환경변수 설정
- [x] CDK 배포 (dev: 135808943968, prod: 466841130170) - 모두 성공
- [x] 프론트엔드 구현 (referralApi.ts, ReferralCard.tsx, useReferralCapture.ts)
- [x] MyAccountPage에 ReferralCard 추가 후 주석 처리 (런칭 전까지 숨김)
- [x] api-server scanner 확장 (referral-bonus.ts, config/referral.ts)
- [x] points routes에 /referral-stats 엔드포인트 추가
- [x] 프론트엔드 스테이징 + 프로덕션 배포 완료

## 미완료 작업

- [ ] ReferralStack Lambda 환경변수 업데이트 (REFERRAL_STATS_API_URL 반영)
- [ ] api-server scanner 배포 (node-3 .env 설정 + PM2 restart)
- [ ] 전체 변경사항 커밋/푸시
- [ ] (런칭 시) ReferralCard 주석 해제 + 프론트엔드 재배포
- [ ] (런칭 시) REFERRAL_REWARD_ENABLED=true 설정 + PM2 restart

## 중요 컨텍스트

### 결정사항

- **ReferralCard 숨김**: MyAccountPage.tsx에서 주석 처리됨 (line 169-175). 런칭 시 주석만 해제하면 됨
- **REFERRAL_STATS_API_URL**: CDK .env.development/production에 `https://explorer.nasun.io/api/v1/points/referral-stats`로 설정 완료. 하지만 CDK 배포 시점에 아직 값이 비어있었으므로 ReferralStack Lambda에 빈 값이 배포됨. 재배포 필요.
- **REFERRAL_REWARD_ENABLED=false**: 초기에는 관계만 기록, 보상 계산은 비활성. 1-2주 데이터 수집 후 true로 전환.

### API Gateway URLs

| 환경 | Referral API | Admin API (referral-mappings 포함) |
|------|-------------|-----------------------------------|
| Dev | `https://uysnvz34yl.execute-api.ap-northeast-2.amazonaws.com/prod` | `https://x9rd39ej88.execute-api.ap-northeast-2.amazonaws.com/prod` |
| Prod | `https://9snrweav74.execute-api.ap-northeast-2.amazonaws.com/prod` | 기존 AdminStack API |

### 주의사항

- **node-3 .env**: REFERRAL_MAPPINGS_URL은 AdminStack의 /internal/referral-mappings 경로. REFERRAL_MAPPINGS_API_KEY는 INTERNAL_API_KEY와 동일 값 사용.
- **Prod AdminStack API Gateway ID**: `aws apigateway get-rest-apis --profile nasun-prod`로 확인 필요
- **Scanner 배포 시**: PM2 restart만 하면 됨 (코드는 git pull 후 자동 반영)
- **Vite 빌드**: Node.js 20+ 필요 (nvm use 20). CDK는 Node.js 18에서도 동작.

### 파일 위치

| 용도 | 경로 |
|------|------|
| CDK 스택 | `apps/nasun-website/cdk/lib/referral-stack.ts` |
| CDK 등록 | `apps/nasun-website/cdk/bin/cdk.ts` |
| Lambda handler | `apps/nasun-website/cdk/lambda-src/referral/handler/src/index.ts` |
| Lambda authorizer | `apps/nasun-website/cdk/lambda-src/referral/authorizer/src/index.ts` |
| AdminStack (수정) | `apps/nasun-website/cdk/lib/admin-stack.ts` |
| Admin handler (수정) | `apps/nasun-website/cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` |
| Frontend API client | `apps/nasun-website/frontend/src/services/referralApi.ts` |
| ReferralCard | `apps/nasun-website/frontend/src/sections/myAccount/ReferralCard.tsx` |
| URL capture hook | `apps/nasun-website/frontend/src/hooks/useReferralCapture.ts` |
| MyAccountPage (수정) | `apps/nasun-website/frontend/src/pages/MyAccountPage.tsx` |
| Scanner config | `apps/network-explorer/api-server/src/config/referral.ts` |
| Referral bonus | `apps/network-explorer/api-server/src/scanner/referral-bonus.ts` |
| Scanner (수정) | `apps/network-explorer/api-server/src/scanner/points-scanner.ts` |
| Points routes (수정) | `apps/network-explorer/api-server/src/routes/points.ts` |
| 설계 문서 (v5) | `.claude/plans/hashed-prancing-waterfall.md` |

## 즉시 다음 단계

1. **ReferralStack Lambda 환경변수 업데이트**: CDK .env에 REFERRAL_STATS_API_URL이 채워졌으므로 재배포
   ```bash
   cd apps/nasun-website/cdk
   NODE_ENV=development npx cdk deploy ReferralStack --require-approval never
   NODE_ENV=production npx cdk deploy ReferralStack --profile nasun-prod --require-approval never
   ```

2. **api-server scanner 배포 (node-3)**:
   - SSH로 node-3 접속
   - `.env`에 추가:
     ```
     REFERRAL_REWARD_ENABLED=false
     REFERRAL_MAPPINGS_URL=https://{prod-admin-api-id}.execute-api.ap-northeast-2.amazonaws.com/prod/internal/referral-mappings
     REFERRAL_MAPPINGS_API_KEY=4e09b56da946337507b62ec620353638facbe3e40c062d4520314b2e87d433f7
     ```
   - git pull + PM2 restart

3. **커밋/푸시**: `/ship`으로 전체 변경사항 커밋
