# Handoff: AWS CloudWatch 알림 분석 및 대응

**생성**: 2026-03-30 17:30
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

AWS CloudWatch에서 6개의 경고 알림을 분석하고 즉시 조치가 필요한 3개 항목 중 2개를 해결했다. tpsl-keeper EADDRINUSE 크래시 루프 수정 및 GovernanceAPI 누락 시크릿 생성 완료. Dev EC2 비용 절감은 nasun-devnet 워크스페이스에서 별도 진행 예정.

## 완료된 작업

- [x] tpsl-keeper EADDRINUSE 크래시 루프 진단 및 수정 (118K+ 재시작 해소)
  - `server.on('error')` 핸들러 추가 (3초 후 재시도)
  - ecosystem.config.cjs에 `min_uptime: '30s'`, `exp_backoff_restart_delay: 100`, `kill_timeout: 10000` 추가
  - prod 배포 완료, restarts: 0, online 상태 확인
- [x] GovernanceAPI 5xx 해결: `nasun/governance/alliance-admin` 시크릿 생성
  - Lambda 환경변수 5개 정상 확인 (ALLIANCE_PACKAGE_ID, REGISTRY_ID, ADMIN_ID, SUI_RPC_URL, COGNITO_IDENTITY_POOL_ID)
  - 시크릿 형식: `{"privateKey":"<hex>"}` (기존 oracle/sponsor 패턴과 동일)
  - 에러 로그 소멸 확인
- [x] Prod API GW baseline 캡처: 3월 총 1,872,577건, ~$6.55 request 비용
- [x] 4개 CloudWatch 알람 모두 OK 상태 확인

## 추가 완료 작업

- [x] Prod API GW 비용 상세 분석: 비용의 80% ($26.11)가 레거시 V2 API의 1.6GB 캐시
- [x] 레거시 Leaderboard V2 `CdkStack` 전체 삭제 완료 (199 리소스: Lambda 26개, API GW, DynamoDB, Step Functions, EventBridge 3개 스케줄)
- [x] 예상 절감: ~$28/월 (Prod 예산 $73 -> ~$45로 $50 이내)

## 미완료 작업

- [ ] **[#3] Dev EC2 비용 절감** (nasun-devnet 워크스페이스에서 진행)
- [ ] health-check 스킬 시크릿 목록에 `nasun/governance/alliance-admin` 추가
- [ ] Prod API Gateway 비용 원인 상세 분석 (REST -> HTTP API 전환 검토)
- [ ] tpsl-keeper graceful shutdown + stuck order 복구 로직 추가
- [ ] alliance-handler stale PENDING race condition 수정
- [ ] COGNITO_IDENTITY_POOL_ID synth-time 검증 패턴 통일

## 중요 컨텍스트

### Dev EC2 비용 (nasun-devnet 워크스페이스에 전달할 내용)

Dev 계정(135808943968, profile: `nasun-dlt`)에서 3월 EC2 비용 ~$645로 예산 $100의 6.5배 초과.

| Instance | Type | State | Lifecycle | 월 비용 |
|----------|------|-------|-----------|---------|
| nasun-node-1 (i-040cc444762741157) | m6i.large | running | On-Demand | ~$70 |
| nasun-node-2 (i-049571787762752ba) | m6i.large | running | On-Demand | ~$70 |
| nasun-node-3 (i-0100cd81438c776a5) | m6i.2xlarge | running | On-Demand | ~$280 |

- Reserved Instance / Savings Plan 없음
- node-3이 비용의 ~50% 차지
- 확인 필요: 각 노드 역할(validator/fullnode/indexer), node-3이 2xlarge인 이유
- 절감 옵션: A) node-3 다운사이징 (~$210 절감), B) 불필요 노드 중지, C) 자동 중지 스케줄, D) A+B 조합, E) Spot 전환

### tpsl-keeper 추가 발견 사항 (3차 리뷰)

- `NBTC_TYPE`, `NETH_TYPE`, `NSOL_TYPE`, `NUSDC_TYPE` env vars가 ecosystem.config.cjs에 미설정 (TP/SL 실행 시 빈 타입으로 Move call 실패 가능)
- graceful shutdown 없음: SIGTERM 시 `executing` 상태 주문 영구 stuck 가능
- file-based TPSLStore(`data/tpsl-orders.json`)는 production 신뢰성에 취약

### Prod API GW 비용 분석 참고

- 3월 request 비용은 ~$6.55인데 총 API GW 비용은 $32.38
- 나머지 ~$26은 REST API 고정 비용 또는 다른 API Gateway(leaderboard-v3, auth 등)에서 발생
- API별 상세 분류 필요

### 결정사항

- tpsl-keeper 크래시 원인은 EADDRINUSE (PM2 재시작 시 port 미해제). graceful shutdown이 아닌 `server.on('error')` retry로 해결 (최소 침습적 수정)
- Alliance admin keypair는 로컬 keystore의 `hopeful-malachite` (address `0xe1c4...3d90`, AdminCap owner와 일치)
- PM2 .env 로딩은 `set -a; source .env; set +a` 패턴 필수 (deploy-pado-bots.sh 참조)

## 최근 변경 파일

- `apps/pado/bots/tpsl-keeper.ts` - EADDRINUSE 핸들러 추가 (line 688-700)
- `apps/pado/bots/ecosystem.config.cjs` - min_uptime, exp_backoff_restart_delay, kill_timeout 추가 (line 191-194)

## 플랜 파일

상세 분석 플랜: `~/.claude/plans/tingly-questing-crayon.md`

## 즉시 다음 단계

1. nasun-devnet 워크스페이스에서 Dev EC2 노드 역할 확인 후 비용 절감 옵션 결정
2. 변경된 2개 파일 커밋 (tpsl-keeper.ts, ecosystem.config.cjs)
3. health-check 스킬에 alliance-admin 시크릿 체크 추가
