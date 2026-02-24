# Deployment (nasun-website)

## 개발 워크플로우

### 로컬 개발

```bash
# 프론트엔드 개발 서버
cd frontend && pnpm dev
# http://localhost:5174

# Lambda 빌드
cd cdk/lambda-src/auth-metamask && npm run build
```

### CDK 배포

```bash
cd cdk

# 개발 환경 배포
pnpm deploy:dev

# 프로덕션 환경 배포
pnpm deploy:prod
```

**배포 스크립트가 자동 처리하는 작업:**
- Lambda 빌드 및 검증
- 환경별 .env 파일 전환
- AWS 자격 증명 검증
- CDK synth/diff

---

## 배포 프로세스

### 프론트엔드 배포

```bash
cd frontend
npm run build
# dist/ 폴더를 EC2로 배포
```

### 백엔드 배포

```bash
cd cdk
pnpm deploy:prod  # 프로덕션
pnpm deploy:dev   # 개발
```

### 배포 후 검증

```bash
# Lambda 로그 확인
aws logs tail /aws/lambda/nasun-auth-metamask --follow

# API 테스트
curl -X POST https://API_URL/prod/auth/metamask/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x..."}'
```

---

## 트러블슈팅

### Lambda "Cannot find module" 에러

```typescript
// CDK에서 전체 디렉토리 배포
code: lambda.Code.fromAsset('lambda-src/auth-metamask'),
handler: 'dist/index.handler',
```

### Twitter 로그인 502 에러

```bash
cd cdk/lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install && npm run build
cd ../../ && pnpm cdk deploy AuthStack
```

### Nonce expired 에러

- Nonce는 5분 후 자동 만료
- 로그인 프로세스를 처음부터 재시작
