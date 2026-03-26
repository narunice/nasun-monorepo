# Handoff: On-Chain Activity Points Frontend UI

**생성**: 2026-03-25 18:30
**브랜치**: `feat/points-leaderboard-ui`
**이전 핸드오프**: `.claude/handoffs/2026-03-25-onchain-activity-points.md` (백엔드 구현)

## 현재 상태 요약

On-chain activity points 프론트엔드(my-account PointsCard + admin ActivityPointsAdmin)가 구현 완료되어 스테이징에 배포됨. 프로덕션에는 한번 실수로 배포했다가 revert함. 스테이징 검증 후 사용자 승인을 받고 프로덕션에 배포해야 함.

## 완료된 작업

- [x] API 클라이언트 (`services/activityPointsApi.ts`) - SUI 주소 검증, encodeURIComponent, 404->null
- [x] 타입 정의 (`types/points.ts`) - LeaderboardEntry, UserPoints, ScannerHealth
- [x] PointsCard (`sections/myAccount/PointsCard.tsx`) - 5개 상태 처리, 카테고리 바 차트
- [x] Admin 페이지 (`features/admin/pages/ActivityPointsAdmin.tsx`) - health polling, leaderboard, user lookup
- [x] 라우트/사이드바 등록 (AppRoutes.tsx + adminConfig.ts)
- [x] 환경변수 (VITE_EXPLORER_API_URL + envSchema.ts Zod 등록)
- [x] CORS 수정 (nasun.io, staging.nasun.io 추가)
- [x] Experimental 뱃지 (amber pill, PointsCard + Admin 제목)
- [x] Genesis Pass 배수 1.5x -> 2.0x
- [x] Scanner 주기 1시간 -> 6시간, wallet cache 30분 -> 3시간
- [x] 스테이징 배포 완료
- [x] node-3 explorer-api 재배포 완료

## 미완료 작업

- [ ] 스테이징 검증 (사용자가 확인 중)
- [ ] 사용자 승인 후 main 머지 + 프로덕션 배포
- [ ] 테스트 포인트 데이터 삭제 (0xc247... 지갑의 test records)
- [ ] Anti-bot 임계값 확정 (소급 스캔 데이터 분석 후)

## 중요 컨텍스트

- **프로덕션 배포 프로세스**: 반드시 스테이징 검증 -> 사용자 명시적 승인 -> 머지 -> 프로덕션 순서. 사용자가 승인하기 전 절대 프로덕션 배포 금지.
- **main 브랜치 상태**: 이전에 실수로 머지+배포 후 revert한 상태 (`25114edf`). 다시 머지할 때 revert-of-revert가 필요할 수 있음.
- **테스트 데이터**: nasun_points DB에 `0xc247e285695df999338973b6c1198730f405668259421c04fb819a447882cdb8` 지갑의 테스트 레코드 2건 (tx_digest: `0xtest_staking_001`, `0xtest_governance_001`). 프로덕션 배포 전 삭제 필요.
- **환경 분리 이슈**: Scanner는 prod UserWallets를 사용하지만 staging은 dev Cognito로 로그인. staging에서 새로 등록한 지갑은 dev UserWallets에 저장되어 scanner가 인식 못함. 이것은 예상된 동작.
- **Node.js 버전**: 빌드 시 `nvm use 22` 필요 (Node 18에서 crypto.hash 에러)
- **PointsCard 지갑 소스**: MetaMask(EVM) 주소가 아닌 `linkedAccounts['nasun wallet'].walletAddress` 사용 (Critical)

## 파일 위치

### 프론트엔드 (nasun-website)
| 용도 | 경로 |
|------|------|
| 타입 | `frontend/src/types/points.ts` |
| API 클라이언트 | `frontend/src/services/activityPointsApi.ts` |
| PointsCard | `frontend/src/sections/myAccount/PointsCard.tsx` |
| Admin 페이지 | `frontend/src/features/admin/pages/ActivityPointsAdmin.tsx` |
| 라우트 | `frontend/src/routes/AppRoutes.tsx` |
| 사이드바 설정 | `frontend/src/features/admin/config/adminConfig.ts` |
| Env 스키마 | `frontend/src/utils/envSchema.ts` |

### 백엔드 (network-explorer)
| 용도 | 경로 |
|------|------|
| Points config | `api-server/src/config/points.ts` |
| Scanner | `api-server/src/scanner/points-scanner.ts` |
| API routes | `api-server/src/routes/points.ts` |
| CORS 설정 | `api-server/src/index.ts` |

## 즉시 다음 단계

1. 사용자의 스테이징 검증 결과 대기
2. 승인 시: 테스트 데이터 삭제 -> main에 머지 (revert-of-revert 처리) -> 프로덕션 빌드 + 배포
3. CloudFront 캐시 무효화
