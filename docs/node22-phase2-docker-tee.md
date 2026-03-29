# Node.js 22 업그레이드 - Phase 2: Docker/TEE

> Phase 1 완료: 2026-03-29 (`.nvmrc`, `engines`, `admin-stack.ts`, `lambda-registry` 삭제)

## 개요

Baram TEE Enclave의 Docker 이미지를 `node:20`에서 `node:22`로 업그레이드한다.
Phase 1과 달리 네이티브 모듈 컴파일과 PCR 값 변경이 수반되므로 격리 테스트가 필수다.

## 리스크

- `Dockerfile.nitro`에서 `node-llama-cpp`를 cmake로 소스 컴파일. Alpine 버전 변경 시 musl 호환성 문제 가능
- EIF 이미지 변경으로 PCR 값(PCR0/PCR1/PCR2)이 변경되어 온체인 attestation baseline 업데이트 필수
- `node-vsock`, `aws-nitro-enclaves-nsm-node`도 네이티브 모듈 (단, `engines: >=11.8.0`으로 Node 22 호환)

## 변경 파일

| 파일 | 행 | 변경 |
|------|-----|------|
| `apps/baram/executor-nitro/docker/Dockerfile.nitro` | 22, 48 | `node:20-alpine` -> `node:22-alpine` |
| `apps/baram/executor-nitro/docker/Dockerfile.enclave` | 5 | `node:20-slim` -> `node:22-slim` |
| `apps/baram/executor-nitro/docker/Dockerfile.host` | 4 | `node:20-slim` -> `node:22-slim` |
| `apps/baram/executor-nitro/scripts/setup-ec2.sh` | 102-104 | `nvm install 20` -> `nvm install 22` |

추가로 `Dockerfile.nitro` 20행, 47행의 오래된 주석("Node.js 20 required for node-llama-cpp v3")도 수정한다.

## 검증 절차

### 1. 로컬 Docker 빌드 테스트

```bash
cd apps/baram/executor-nitro

# Nitro 이미지 빌드 (네이티브 모듈 컴파일 확인)
docker build -f docker/Dockerfile.nitro -t baram-nitro:node22-test .

# Enclave 이미지 빌드
docker build -f docker/Dockerfile.enclave -t baram-enclave:node22-test .

# Host 이미지 빌드
docker build -f docker/Dockerfile.host -t baram-host:node22-test .
```

빌드 실패 시 `node-llama-cpp` cmake 컴파일 로그를 확인한다.

### 2. node-llama-cpp 추론 테스트

```bash
docker run --rm baram-nitro:node22-test node -e "
  const { getLlama } = require('node-llama-cpp');
  console.log('node-llama-cpp loaded successfully');
"
```

### 3. Spot Instance에서 EIF 빌드

```bash
# Spot instance 시작
./scripts/launch-spot.sh

# EIF 빌드
nitro-cli build-enclave --docker-uri baram-enclave:node22-test --output-file baram.eif

# 새 PCR 값 기록
nitro-cli describe-eif --eif-path baram.eif
```

PCR0, PCR1, PCR2 값을 기록해둔다.

### 4. 온체인 Attestation Baseline 업데이트

`contracts-attestation/`의 PCR baseline을 새 값으로 업데이트하고 publish한다.

```bash
cd apps/baram/contracts-attestation
# PCR 값 업데이트 후
nasun move build
nasun client publish --gas-budget 100000000
```

### 5. E2E Attestation 검증

1. 새 EIF로 enclave 시작
2. Host에서 attestation 요청
3. 온체인 PCR baseline과 일치하는지 확인
4. AI 추론 요청 -> AER 생성 확인

## Pado EC2 Node 업그레이드

Phase 2와 별개로, Pado 봇/chat-server의 다음 배포 시 EC2 서버에서도 Node 22를 설치해야 한다.

```bash
# Staging EC2 (15.165.19.180)
ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180
nvm install 22
nvm alias default 22

# Production EC2 (43.200.67.52)
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52
nvm install 22
nvm alias default 22
```

`better-sqlite3` (chat-server)는 Node 22 prebuilt를 제공하므로, `npm install` 시 자동으로 올바른 바이너리를 받는다.

## Scope 외

| 파일 | 이유 |
|------|------|
| `apps/pado/deepbookv3/.github/workflows/deepbookv3-build-tx.yml` | pnpm workspace에서 제외된 벤더 포크. mainnet DeepBook 프로토콜 운영에 직접 영향. 별도 lifecycle으로 관리 |

## 롤백

Docker 이미지 롤백: base image를 `node:20-*`으로 되돌리고 재빌드.
PCR baseline 롤백: 이전 PCR 값으로 온체인 baseline을 재등록.
