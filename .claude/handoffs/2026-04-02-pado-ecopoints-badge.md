# Handoff: Pado EcoPointsBadge + Snapshot Backup

**생성**: 2026-04-02 19:40
**브랜치**: main
**이전 핸드오프**: [2026-04-03-ecosystem-points-v1-complete.md](2026-04-03-ecosystem-points-v1-complete.md)

## 현재 상태 요약

Pado Header에 Ecosystem Points 뱃지(EcoPointsBadge)를 표시하는 작업. 코드 수정 완료, 스테이징 배포 완료. 프로덕션 배포 대기 중. 스냅샷 로컬 백업 자동화 스크립트도 작성하여 node-3에서 테스트 완료.

## 완료된 작업

- [x] EcoPointsBadge 타입 수정: `useWallet().address` -> `useSignerAddress()` (모든 인증 방식 지원)
- [x] Pado 프론트엔드 빌드 성공 (Node 22 필수, tsc + vite build)
- [x] Pado 스테이징 배포 완료 (staging.pado.finance)
- [x] 스냅샷 로컬 백업 스크립트 작성 (`backup-snapshots.ts`)
- [x] node-3에 백업 스크립트 배포 + `--full` 테스트 성공 (2026-04-01: 1156 rows)
- [x] registerWallet 디버깅: 정상 동작 확인 (register 200, Explorer API 302 redirect 성공)
- [x] Google sub 매핑 파이프라인 불필요 확인 (프로덕션에서 Pado/nasun.io 동일 zkLogin 주소)

## 미완료 작업

- [ ] Pado 스테이징 검증 (ecosystemScore > 0인 계정으로 zkLogin 테스트)
- [ ] Pado 프로덕션 배포: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm deploy:pado:prod --skip-bots`
- [ ] 스냅샷 백업 crontab 등록 (node-3)
- [ ] nasun.io zkLogin 사용자 점수 조사 (미등록 지갑 활동 누락 여부)
- [ ] EcoPointsBadge.tsx 변경 + backup-snapshots.ts 신규 + .gitignore 수정 커밋

## 중요 컨텍스트

### 결정사항

- **Google sub 매핑 불필요**: Pado와 nasun.io가 동일한 Google Client ID (`869935693878-...`) + 동일한 Salt API URL을 사용하므로 같은 Google 계정이면 동일 zkLogin 주소 생성. wallet 기반 lookup으로 충분.
- **개발서버 vs 프로덕션 주소 차이**: 개발서버(.env.local)에서는 다른 설정으로 인해 zkLogin 주소가 다를 수 있음. 프로덕션에서만 동일 주소 보장.
- **Node 22 필수**: Vite 7.x가 Node 20.19+ 필요. `source ~/.nvm/nvm.sh && nvm use 22` 로 전환 후 빌드/배포.

### 주의사항

- **스테이징 헬스체크 401**: staging.pado.finance에 Basic Auth 보호가 있어 헬스체크가 401 반환하지만, 파일 배포 자체는 성공.
- **hybrida@gmail.com 테스트 계정**: ecosystemScore가 0 (Alliance penalty + multiplier 0). 뱃지 테스트에는 score > 0인 다른 계정 필요.
- **wallet-mappings 캐시**: 10분 주기 갱신 (WALLET_CACHE_REFRESH_MS). 새 지갑 등록 후 최대 10분 대기.
- **auto-register 동작 확인**: AuthProvider.tsx:364-367의 fire-and-forget registerWallet이 정상 동작 중 (register 200 확인). 이전에 "미등록" 상태였던 것은 캐시 타이밍 또는 레거시 마이그레이션 이슈.

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `apps/pado/frontend/src/components/layout/EcoPointsBadge.tsx` | Pado Header 뱃지 (수정 완료) |
| `apps/pado/frontend/src/components/layout/Header.tsx:407` | EcoPointsBadge 렌더링 위치 |
| `apps/network-explorer/api-server/src/scripts/backup-snapshots.ts` | 스냅샷 백업 스크립트 (신규) |
| `apps/nasun-website/frontend/src/features/auth/providers/AuthProvider.tsx:364-367` | nasun.io 글로벌 auto-register |
| `apps/nasun-website/cdk/lambda-src/auth-sui/src/handlers/connect-verify.ts` | connect-verify Lambda (walletProof 발급) |
| `apps/network-explorer/api-server/src/scanner/points-scanner.ts:407-410` | 미등록 지갑 활동 스킵 로직 |

## 최근 변경 파일

```
M  .gitignore                          # **/backups/ 추가
M  apps/pado/frontend/src/components/layout/EcoPointsBadge.tsx  # useSignerAddress() 수정
?? apps/network-explorer/api-server/src/scripts/backup-snapshots.ts  # 신규
```

## 즉시 다음 단계

1. staging.pado.finance에서 ecosystemScore > 0인 계정으로 zkLogin -> 뱃지 표시 확인
2. 프로덕션 배포: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm deploy:pado:prod --skip-bots`
3. 변경사항 커밋 (EcoPointsBadge fix + backup script + .gitignore)
4. node-3 crontab에 스냅샷 백업 등록: `0 1 * * * cd ~/explorer-api && set -a && source .env && set +a && npx tsx src/scripts/backup-snapshots.ts >> ~/explorer-api/backups/backup.log 2>&1`
5. (후속) nasun.io zkLogin 사용자 UserWallets 등록 현황 조사
