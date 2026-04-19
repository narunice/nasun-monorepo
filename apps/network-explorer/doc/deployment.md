# Explorer 배포 정보

## 배포 환경

| 항목 | 값 |
|------|-----|
| 프론트엔드 호스팅 | Production EC2 (43.200.67.52) + nginx |
| API 서버 호스팅 | EC2 node-3 (54.180.61.196) + PM2 |
| Staging | https://staging.explorer.nasun.io/devnet |
| Production | https://explorer.nasun.io/devnet |
| API Production | https://explorer.nasun.io/api/v1 (nginx -> node-3:3200) |

## 프론트엔드 배포 명령어

```bash
# 모노레포 루트에서
pnpm deploy:network-explorer:staging   # 스테이징 배포
pnpm deploy:network-explorer:prod      # 프로덕션 배포

# 옵션
pnpm deploy:network-explorer:prod -- --dry-run   # 빌드만, 배포 안함
pnpm deploy:network-explorer:prod -- --force     # 확인 프롬프트 건너뛰기
pnpm deploy:network-explorer:prod -- --rollback  # 이전 버전으로 롤백
```

## API 서버 배포

```bash
# 모노레포 루트에서 단일 명령으로 실행
./scripts/deploy-explorer-api.sh

# 옵션
./scripts/deploy-explorer-api.sh --dry-run   # 빌드만, 배포 안함
./scripts/deploy-explorer-api.sh --force     # 확인 프롬프트 건너뜀
```

스크립트 순서: tsc 빌드 -> rsync -> npm install --omit=dev -> pm2 restart -> health check

상세 내용은 [api-server.md](api-server.md) 참조.

## RPC 테스트 명령어

```bash
# Chain ID 확인
curl -X POST http://3.38.127.23:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'

# 최신 체크포인트
curl -X POST http://3.38.127.23:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}'

# Faucet 토큰 요청
curl -X POST http://3.38.127.23:5003/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"<YOUR_ADDRESS>"}}'
```
